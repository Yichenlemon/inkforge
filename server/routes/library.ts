import { Router } from 'express'
import crypto from 'node:crypto'
import { listSnippets, insertSnippet, deleteSnippet, listTemplates, insertTemplate, getTemplate, deleteTemplate, listAccounts, insertAccount, deleteAccount } from '../db.js'
import { asyncHandler, ok, badRequest, notFound, str } from '../lib/http.js'

export const libraryRouter = Router()

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
