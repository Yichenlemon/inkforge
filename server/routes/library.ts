import { Router } from 'express'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { listSnippets, insertSnippet, deleteSnippet, listTemplates, insertTemplate, getTemplate, deleteTemplate, listAccounts, insertAccount, deleteAccount } from '../db.js'
import { asyncHandler, ok, badRequest, notFound, str } from '../lib/http.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const libraryRouter = Router()

/* ------------------------------------------------------------------ */
/* 壹伴样式库（16,245 条微信兼容内联样式，直接可用）                       */
/* ------------------------------------------------------------------ */

interface YibanItem {
  id: number; desc: string; tags: string[]; detail: string; type: string;
  free: boolean; category: number; second_category: number;
}

let _yibanCache: YibanItem[] | null = null
function loadYiban(): YibanItem[] {
  if (_yibanCache) return _yibanCache
  const file = path.join(__dirname, '../../_ref/yiban/yiban_materials.json')
  if (!fs.existsSync(file)) return []
  try {
    _yibanCache = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    _yibanCache = []
  }
  return _yibanCache
}

/** 主分类 = tags[0]（壹伴的一级分类） */
function yibanCat(m: YibanItem): string {
  return (m.tags && m.tags[0]) || '未分类'
}

libraryRouter.get('/yiban/categories', asyncHandler(async (_req, res) => {
  const all = loadYiban()
  const counts = new Map<string, number>()
  for (const m of all) {
    const c = yibanCat(m)
    counts.set(c, (counts.get(c) ?? 0) + 1)
  }
  const categories = Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
  return ok(res, { total: all.length, categories })
}))

libraryRouter.get('/yiban', asyncHandler(async (req, res) => {
  const all = loadYiban()
  const q = str(req.query.q).trim().toLowerCase()
  const cat = str(req.query.cat).trim()
  const idsParam = str(req.query.ids).trim()
  const page = Math.max(1, parseInt(str(req.query.page, '1'), 10) || 1)
  const size = Math.min(60, Math.max(1, parseInt(str(req.query.size, '24'), 10) || 24))
  let filtered = all
  if (idsParam) {
    // 收藏模式：按 id 集合精确取回（跨分页）
    const want = new Set(idsParam.split(',').map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n)).slice(0, 300))
    filtered = all.filter((m) => want.has(m.id))
  } else {
    if (cat && cat !== '全部') filtered = filtered.filter((m) => yibanCat(m) === cat)
    if (q) {
      filtered = filtered.filter((m) =>
        (m.desc && m.desc.toLowerCase().includes(q)) ||
        (m.tags && m.tags.join('/').toLowerCase().includes(q)) ||
        (m.detail && m.detail.toLowerCase().includes(q)))
    }
  }
  const start = (page - 1) * size
  const items = filtered.slice(start, start + size).map((m) => ({
    id: m.id, desc: m.desc, tags: m.tags, type: m.type, free: m.free,
    category: yibanCat(m),
    detail: m.detail,
  }))
  return ok(res, { total: filtered.length, page, size, items })
}))

/* ------------------------------------------------------------------ */
/* 片段（支持 {{变量}}）                                                 */
/* ------------------------------------------------------------------ */

function extractVariables(html: string): string[] {
  const out = new Set<string>()
  const re = /\{\{\s*([^{}]+?)\s*\}\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) out.add(m[1])
  return Array.from(out)
}

libraryRouter.get('/snippets', asyncHandler(async (_req, res) => ok(res, { snippets: listSnippets() })))

libraryRouter.post('/snippets', asyncHandler(async (req, res) => {
  const html = str(req.body?.html)
  if (!html) badRequest('缺少内容')
  const id = crypto.randomBytes(6).toString('hex')
  insertSnippet({ id, name: str(req.body?.name, '未命名片段'), html, variables: extractVariables(html).join(','), createdAt: Date.now() })
  return ok(res, { id })
}))

libraryRouter.post('/snippets/render', asyncHandler(async (req, res) => {
  const html = str(req.body?.html)
  const vars: Record<string, string> = req.body?.vars ?? {}
  const out = html.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_m, name: string) => vars[name] ?? `{{${name}}}`)
  return ok(res, { html: out, variables: extractVariables(html) })
}))

libraryRouter.delete('/snippets/:id', asyncHandler(async (req, res) => {
  deleteSnippet(req.params.id)
  return ok(res, {})
}))

/* ------------------------------------------------------------------ */
/* 文章模板                                                             */
/* ------------------------------------------------------------------ */

libraryRouter.get('/templates', asyncHandler(async (_req, res) => ok(res, { templates: listTemplates() })))

libraryRouter.post('/templates', asyncHandler(async (req, res) => {
  const blocks = req.body?.blocks
  if (!Array.isArray(blocks)) badRequest('缺少 blocks')
  const id = crypto.randomBytes(6).toString('hex')
  insertTemplate({
    id, name: str(req.body?.name, '未命名模板'), grp: str(req.body?.group, '自定义'),
    themeId: str(req.body?.themeId, 'clean'), blocks: JSON.stringify(blocks), createdAt: Date.now(),
  })
  return ok(res, { id })
}))

libraryRouter.get('/templates/:id', asyncHandler(async (req, res) => {
  const t = getTemplate(req.params.id)
  if (!t) notFound('模板不存在')
  return ok(res, { template: { ...t, blocks: JSON.parse(t.blocks) } })
}))

libraryRouter.delete('/templates/:id', asyncHandler(async (req, res) => {
  deleteTemplate(req.params.id)
  return ok(res, {})
}))

/* ------------------------------------------------------------------ */
/* 公众号账号                                                            */
/* ------------------------------------------------------------------ */

libraryRouter.get('/accounts', asyncHandler(async (_req, res) => ok(res, { accounts: listAccounts() })))

libraryRouter.post('/accounts', asyncHandler(async (req, res) => {
  const appId = str(req.body?.appId)
  const appSecret = str(req.body?.appSecret)
  if (!appId || !appSecret) badRequest('缺少 AppID 或 AppSecret')
  const id = crypto.randomBytes(6).toString('hex')
  insertAccount({ id, name: str(req.body?.name, '未命名公众号'), appId, appSecret, createdAt: Date.now() })
  return ok(res, { id })
}))

libraryRouter.delete('/accounts/:id', asyncHandler(async (req, res) => {
  deleteAccount(req.params.id)
  return ok(res, {})
}))
