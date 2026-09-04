import { Router } from 'express'
import multer from 'multer'
import {
  queryFiles, softDeleteFile, restoreFile, purgeFile, getUsedIn, getThumb,
  dedupFiles, replaceAsset, importFiles, exportFiles,
  getAsset, getDocRow, updateAssetMeta, updateDocMeta,
} from '../db.js'
import { asyncHandler, ok, badRequest, notFound, str } from '../lib/http.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024 },
})

export const filesRouter = Router()

const NUM = (v: any) => (v === undefined || v === null || v === '' ? undefined : Number(v))
const toStr = (v: any) => (typeof v === 'string' ? v : undefined)
const toTags = (v: any): string | undefined => (Array.isArray(v) ? v.join(',') : typeof v === 'string' ? v : undefined)

function resolveKind(id: string): 'doc' | 'asset' | null {
  if (getAsset(id)) return 'asset'
  if (getDocRow(id)) return 'doc'
  return null
}

/* 统一查询 */
filesRouter.get('/files', asyncHandler(async (req, res) => {
  const q = req.query
  const items = queryFiles({
    kind: toStr(q.kind),
    q: toStr(q.q),
    sort: toStr(q.sort) as any,
    trash: q.trash === '1' || q.trash === 'true',
    minSize: NUM(q.minSize),
    maxSize: NUM(q.maxSize),
    minDim: NUM(q.minDim),
    maxDim: NUM(q.maxDim),
    tag: toStr(q.tag),
    used: q.used === '0' ? 0 : NUM(q.used),
    limit: NUM(q.limit) ?? 200,
    offset: NUM(q.offset) ?? 0,
  })
  return ok(res, { items })
}))

/* 单资源 */
filesRouter.get('/files/:id', asyncHandler(async (req, res) => {
  const items = queryFiles({ id: req.params.id, limit: 1 })
  if (!items.length) notFound('文件不存在')
  return ok(res, { item: items[0] })
}))

/* 更新元数据（tags/category/name/folderId） */
filesRouter.patch('/files/:id', asyncHandler(async (req, res) => {
  let body: any = {}
  try { body = req.body ?? {} } catch { /* ignore */ }
  const id = req.params.id
  const asset = getAsset(id)
  if (asset) {
    updateAssetMeta(id, {
      name: toStr(body.name) || undefined,
      tags: toTags(body.tags),
      category: toStr(body.category),
      folderId: toStr(body.folderId),
    })
    return ok(res, { item: queryFiles({ id })[0] })
  }
  if (getDocRow(id)) {
    updateDocMeta(id, { title: toStr(body.name), folderId: toStr(body.folderId) })
    return ok(res, { item: queryFiles({ id })[0] })
  }
  return notFound('文件不存在')
}))

/* 删除：?purge=1 物理删除，否则软删 */
filesRouter.delete('/files/:id', asyncHandler(async (req, res) => {
  const id = req.params.id
  const kind = resolveKind(id)
  if (!kind) notFound('文件不存在')
  if (req.query.purge === '1') purgeFile(kind, id)
  else softDeleteFile(kind, id)
  return ok(res, {})
}))

/* 批量上传导入 */
filesRouter.post('/files/import', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) badRequest('没有收到文件')
  const { accepted, rejected } = await importFiles([{
    buffer: req.file!.buffer, name: req.file!.originalname, mime: req.file!.mimetype,
  }])
  return ok(res, { accepted, rejected })
}))

/* 远程 URL 列表导入 */
filesRouter.post('/files/import-urls', asyncHandler(async (req, res) => {
  const urls: string[] = Array.isArray(req.body?.urls) ? req.body.urls.map(String) : []
  const files: { buffer: Buffer; name: string; mime: string }[] = []
  for (const url of urls) {
    try {
      const r = await fetch(String(url), { headers: { 'User-Agent': 'Mozilla/5.0 InkForge' } })
      if (!r.ok) continue
      const buf = Buffer.from(await r.arrayBuffer())
      const mime = (r.headers.get('content-type') ?? 'image/jpeg').split(';')[0]
      const name = decodeURIComponent(String(url).split('/').pop()?.split('?')[0] ?? 'file')
      files.push({ buffer: buf, name, mime })
    } catch { /* 跳过无法获取的 URL */ }
  }
  const { accepted, rejected } = await importFiles(files)
  return ok(res, { accepted, rejected })
}))

/* 导出 zip（archiver 未安装时返回清晰错误） */
filesRouter.post('/files/export', asyncHandler(async (req, res) => {
  const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : []
  const format = str(req.body?.format, 'zip')
  const buf = await exportFiles(ids, format)
  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', 'attachment; filename="inkforge-export.zip"')
  return res.send(buf)
}))

/* 去重扫描 */
filesRouter.post('/files/dedup', asyncHandler(async (_req, res) => {
  return ok(res, { groups: dedupFiles() })
}))

/* 全局替换素材引用 */
filesRouter.post('/files/:id/replace', asyncHandler(async (req, res) => {
  const newId = toStr(req.body?.newId)
  if (!newId) badRequest('缺少 newId')
  const replaced = replaceAsset(req.params.id, newId)
  return ok(res, { replaced })
}))

/* 反向链接：谁在用 */
filesRouter.get('/files/:id/used-in', asyncHandler(async (req, res) => {
  return ok(res, { refs: getUsedIn(req.params.id) })
}))

/* 缩略图 */
filesRouter.get('/files/:id/thumb', asyncHandler(async (req, res) => {
  const b = await getThumb(req.params.id)
  if (!b) notFound('缩略图不可用')
  res.setHeader('Content-Type', 'image/png')
  return res.send(b)
}))
