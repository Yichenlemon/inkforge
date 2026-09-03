import { Router } from 'express'
import { compileDoc, compileBlocks } from '../lib/compile.js'
import { migrateDoc } from '../../shared/types.js'
import { blocksToMarkdown } from '../lib/convert.js'
import { asyncHandler, ok, badRequest, str, bool } from '../lib/http.js'

export const compileRouter = Router()

function getDoc(body: any) {
  const doc = migrateDoc(body?.doc)
  if (!doc || !Array.isArray(doc.blocks)) badRequest('缺少文档数据')
  return doc
}

/** 编译为公众号安全 HTML */
compileRouter.post('/compile', asyncHandler(async (req, res) => {
  const doc = getDoc(req.body)
  const result = await compileDoc(doc, {
    stripAnimation: bool(req.body?.stripAnimation),
    maxWidth: req.body?.maxWidth ? Number(req.body.maxWidth) : undefined,
    wrap: req.body?.wrap !== false,
  })
  return ok(res, result)
}))

/** 局部预览（不套外壳） */
compileRouter.post('/compile/blocks', asyncHandler(async (req, res) => {
  const blocks = Array.isArray(req.body?.blocks) ? req.body.blocks : []
  const html = await compileBlocks(blocks, str(req.body?.themeId, 'clean'), {
    stripAnimation: bool(req.body?.stripAnimation),
    wrap: false,
  })
  return ok(res, { html })
}))

/** 只跑诊断，不产出 HTML（编辑时实时提示） */
compileRouter.post('/validate', asyncHandler(async (req, res) => {
  const doc = getDoc(req.body)
  const result = await compileDoc(doc, { stripAnimation: bool(req.body?.stripAnimation), wrap: false })
  return ok(res, { diagnostics: result.diagnostics, stats: result.stats })
}))

/* ------------------------------------------------------------------ */
/* 导出                                                                 */
/* ------------------------------------------------------------------ */

compileRouter.post('/export/html', asyncHandler(async (req, res) => {
  const doc = getDoc(req.body)
  const result = await compileDoc(doc, { stripAnimation: bool(req.body?.stripAnimation) })
  const full = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(doc.title)}</title>
<style>
  body{margin:0;padding:24px 0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Helvetica Neue",Arial,sans-serif;}
  .inkforge-page{max-width:677px;margin:0 auto;background:#fff;padding:24px 20px;border-radius:8px;}
</style>
</head>
<body>
<div class="inkforge-page">
${result.html}
</div>
</body>
</html>`
  return ok(res, { html: result.html, full, diagnostics: result.diagnostics, stats: result.stats })
}))

compileRouter.post('/export/markdown', asyncHandler(async (req, res) => {
  const doc = getDoc(req.body)
  return ok(res, { markdown: blocksToMarkdown(doc.blocks) })
}))

compileRouter.post('/export/json', asyncHandler(async (req, res) => {
  const doc = getDoc(req.body)
  return ok(res, { json: JSON.stringify(doc, null, 2) })
}))

compileRouter.post('/export/plaintext', asyncHandler(async (req, res) => {
  const doc = getDoc(req.body)
  const result = await compileDoc(doc, { stripAnimation: bool(req.body?.stripAnimation), wrap: false })
  const text = result.html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return ok(res, { text })
}))

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
}
