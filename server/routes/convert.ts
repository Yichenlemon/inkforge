import { Router } from 'express'
import multer from 'multer'
import {
  markdownToHtml, htmlToMarkdown, htmlToBlocks, markdownToBlocks,
  docxToBlocks, xlsxToTables, delimitedToRows, docxToHtml, blocksToMarkdown,
} from '../lib/convert.js'
import { loadDotLottie } from '../lib/lottie.js'
import { asyncHandler, ok, badRequest, str } from '../lib/http.js'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } })

export const convertRouter = Router()

convertRouter.post('/convert/md2html', asyncHandler(async (req, res) => {
  const md = str(req.body?.md)
  return ok(res, { html: markdownToHtml(md) })
}))

convertRouter.post('/convert/html2md', asyncHandler(async (req, res) => {
  const html = str(req.body?.html)
  return ok(res, { md: htmlToMarkdown(html) })
}))

/** 核心：任意 HTML → BlockIR（粘贴 / 导入） */
convertRouter.post('/convert/html2blocks', asyncHandler(async (req, res) => {
  const html = str(req.body?.html)
  if (!html.trim()) badRequest('缺少 HTML')
  return ok(res, htmlToBlocks(html))
}))

convertRouter.post('/convert/md2blocks', asyncHandler(async (req, res) => {
  const md = str(req.body?.md)
  if (!md.trim()) badRequest('缺少 Markdown')
  return ok(res, markdownToBlocks(md))
}))

convertRouter.post('/convert/blocks2md', asyncHandler(async (req, res) => {
  const blocks = Array.isArray(req.body?.blocks) ? req.body.blocks : []
  return ok(res, { md: blocksToMarkdown(blocks) })
}))

convertRouter.post('/convert/docx', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) badRequest('没有收到文件')
  const r = await docxToBlocks(req.file.buffer)
  return ok(res, r)
}))

convertRouter.post('/convert/docx-html', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) badRequest('没有收到文件')
  return ok(res, await docxToHtml(req.file.buffer))
}))

convertRouter.post('/convert/xlsx', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) badRequest('没有收到文件')
  const tables = await xlsxToTables(req.file.buffer, str(req.body?.sheet) || undefined)
  return ok(res, { tables })
}))

/** 直接粘贴表格文本（Excel / Numbers / 飞书 复制出来的 TSV） */
convertRouter.post('/convert/tsv', asyncHandler(async (req, res) => {
  const text = str(req.body?.text)
  if (!text.trim()) badRequest('缺少文本')
  const delim = str(req.body?.delimiter, '\t')
  return ok(res, { rows: delimitedToRows(text, delim) })
}))

/** .lottie（zip）解包并取出动画 JSON */
convertRouter.post('/convert/dotlottie', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) badRequest('没有收到文件')
  const { json } = loadDotLottie(req.file.buffer)
  if (!json || !Array.isArray(json.layers)) badRequest('zip 内没有找到合法的 Lottie 动画')
  return ok(res, { json })
}))
