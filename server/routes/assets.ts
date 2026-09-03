import { Router } from 'express'
import sharp from 'sharp'
import multer from 'multer'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { UPLOAD_DIR } from '../db.js'
import { insertAsset, listAssets, getAsset, deleteAsset, updateAssetMeta } from '../db.js'
import { probe, compress, watermark, applyFilter, removeBackground, checkGif, reduceGifFrames, placeholder } from '../lib/image.js'
import { asyncHandler, ok, badRequest, notFound, str, num, bool } from '../lib/http.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024 },
})

export const assetsRouter = Router()

/* ------------------------------------------------------------------ */
/* 上传                                                                 */
/* ------------------------------------------------------------------ */

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
  'image/svg+xml': 'svg', 'application/json': 'json', 'video/mp4': 'mp4', 'audio/mpeg': 'mp3',
}

function extOf(mime: string, original: string): string {
  return MIME_EXT[mime] ?? (path.extname(original).replace('.', '') || 'bin')
}

async function saveBuffer(buf: Buffer, ext: string): Promise<string> {
  const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf)
  return name
}

assetsRouter.post('/assets/upload', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) badRequest('没有收到文件')
  const file = req.file!
  const ext = extOf(file.mimetype, file.originalname)
  const kind = ext === 'svg' ? 'svg' : ext === 'json' ? 'lottie' : ext === 'gif' ? 'gif' : /image\//.test(file.mimetype) ? 'image' : 'other'

  let buf = file.buffer
  let width: number | undefined
  let height: number | undefined
  if (kind === 'image' || kind === 'gif') {
    try {
      const info = await probe(buf)
      width = info.width
      height = info.height
    } catch { /* 非图片或无法解析 */ }
  }

  const name = await saveBuffer(buf, ext)
  const id = crypto.randomBytes(6).toString('hex')
  const url = `/uploads/${name}`
  insertAsset({
    id, kind, name: file.originalname, url, mime: file.mimetype, bytes: buf.length,
    width, height, tags: '', category: '', license: '', createdAt: Date.now(),
  })
  return ok(res, { asset: { id, url, kind, width, height, bytes: buf.length, name: file.originalname } })
}))

/** 外链导入入库（粘贴网络图片时保证后续可用） */
assetsRouter.post('/fetch-url', asyncHandler(async (req, res) => {
  const url = str(req.body?.url)
  if (!/^https?:\/\//.test(url)) badRequest('只支持 http(s) 链接')
  const res2 = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 InkForge' } })
  if (!res2.ok) badRequest(`导入失败：HTTP ${res2.status}`)
  const buf = Buffer.from(await res2.arrayBuffer())
  const mime = res2.headers.get('content-type') ?? 'image/jpeg'
  const ext = extOf(mime.split(';')[0], url.split('?')[0])
  const name = await saveBuffer(buf, ext)
  const id = crypto.randomBytes(6).toString('hex')
  let width: number | undefined, height: number | undefined
  try { const i = await probe(buf); width = i.width; height = i.height } catch { /* ignore */ }
  insertAsset({ id, kind: ext === 'gif' ? 'gif' : 'image', name: url.split('/').pop() ?? url, url: `/uploads/${name}`, mime, bytes: buf.length, width, height, tags: '', category: '', license: '', createdAt: Date.now() })
  return ok(res, { asset: { id, url: `/uploads/${name}`, width, height, bytes: buf.length } })
}))

/* ------------------------------------------------------------------ */
/* 列表 / 元数据                                                        */
/* ------------------------------------------------------------------ */

assetsRouter.get('/assets', asyncHandler(async (req, res) => {
  const kind = str(req.query.kind, 'all')
  return ok(res, { assets: listAssets(kind) })
}))

assetsRouter.patch('/assets/:id', asyncHandler(async (req, res) => {
  const cur = getAsset(req.params.id)
  if (!cur) notFound('素材不存在')
  updateAssetMeta(req.params.id, {
    name: str(req.body?.name) || undefined,
    tags: str(req.body?.tags ?? ''),
    category: str(req.body?.category ?? ''),
    license: str(req.body?.license ?? ''),
  })
  return ok(res, { asset: getAsset(req.params.id) })
}))

assetsRouter.delete('/assets/:id', asyncHandler(async (req, res) => {
  const removed = deleteAsset(req.params.id)
  if (!removed) notFound('素材不存在')
  try {
    const file = path.join(UPLOAD_DIR, path.basename(removed.url))
    if (fs.existsSync(file)) fs.unlinkSync(file)
  } catch { /* 文件已不存在 */ }
  return ok(res, {})
}))

/* ------------------------------------------------------------------ */
/* 图片处理                                                             */
/* ------------------------------------------------------------------ */

async function resolveInput(body: any): Promise<{ buf: Buffer; assetId?: string } | null> {
  if (body?.assetId) {
    const a = getAsset(str(body.assetId))
    if (!a) notFound('素材不存在')
    const file = path.join(UPLOAD_DIR, path.basename(a.url))
    return { buf: fs.readFileSync(file), assetId: a.id }
  }
  if (body?.url && str(body.url).startsWith('/uploads/')) {
    const file = path.join(UPLOAD_DIR, path.basename(str(body.url)))
    return { buf: fs.readFileSync(file) }
  }
  // 外链图片：导入后处理（用于编辑器里直接修外部图）
  if (body?.url && /^https?:\/\//.test(str(body.url))) {
    try {
      const r = await fetch(str(body.url), { headers: { 'User-Agent': 'Mozilla/5.0 InkForge' } })
      if (r.ok) return { buf: Buffer.from(await r.arrayBuffer()) }
    } catch { /* 导入失败 → 返回 null */ }
  }
  return null
}

/**
 * 按请求参数对图片做调整：旋转 → 滤镜（亮度/对比度/饱和/灰度/模糊/锐化/色相/反相/圆角/描边）→ 去背景。
 * 不落盘、不建素材，供预览与保存复用。
 */
async function adjustBuffer(buf: Buffer, b: any): Promise<Buffer> {
  let out = buf
  if (b.rotate) out = await sharp(out).rotate(num(b.rotate)).toBuffer()
  const hasFilter = b.brightness != null || b.saturation != null || b.contrast != null ||
    b.grayscale || b.blur != null || b.sharpen || b.hue != null || b.negate ||
    b.radius != null || b.borderWidth
  if (hasFilter) {
    out = await applyFilter(out, {
      brightness: b.brightness != null ? num(b.brightness, 1) : undefined,
      saturation: b.saturation != null ? num(b.saturation, 1) : undefined,
      contrast: b.contrast != null ? num(b.contrast, 1) : undefined,
      grayscale: bool(b.grayscale),
      blur: b.blur != null ? num(b.blur) : undefined,
      sharpen: bool(b.sharpen),
      hue: b.hue != null ? num(b.hue) : undefined,
      negate: bool(b.negate),
      radius: b.radius != null ? num(b.radius) : undefined,
      border: b.borderWidth ? { width: num(b.borderWidth), color: str(b.borderColor, '#eee') } : undefined,
    })
  }
  if (b.removeBg) out = await removeBackground(out, num(b.tolerance, 32), num(b.feather, 1))
  return out
}

/** 返回处理后的新素材 */
assetsRouter.post('/image/process', asyncHandler(async (req, res) => {
  const input = await resolveInput(req.body)
  if (!input) badRequest('需要 assetId 或 url')
  const b = req.body ?? {}
  let out = input.buf

  if (b.compress) {
    const r = await compress(out, {
      quality: num(b.quality, 82), maxWidth: num(b.maxWidth, 1080),
      targetBytes: b.targetBytes ? num(b.targetBytes) : undefined,
      format: b.format ?? 'keep',
    })
    out = r.buffer
  }
  // 旋转 + 滤镜 + 去背景（含 rotate）
  out = await adjustBuffer(out, b)
  if (b.watermark) {
    out = await watermark(out, {
      type: b.wmType === 'image' ? 'image' : 'text',
      text: str(b.wmText, 'InkForge'), imageUrl: str(b.wmImageUrl),
      position: str(b.wmPosition, 'se') as any,
      opacity: num(b.wmOpacity, 0.35), fontSize: b.wmFontSize ? num(b.wmFontSize) : undefined,
      color: str(b.wmColor, '#ffffff'), tileGap: b.wmTileGap ? num(b.wmTileGap) : undefined,
    })
  }

  const ext = str(b.outputExt, 'png')
  const name = await saveBuffer(out, ext)
  const id = crypto.randomBytes(6).toString('hex')
  let width: number | undefined, height: number | undefined
  try { const i = await probe(out); width = i.width; height = i.height } catch { /* ignore */ }
  const url = `/uploads/${name}`
  insertAsset({
    id, kind: ext === 'gif' ? 'gif' : 'image', name: str(b.name, `processed.${ext}`), url,
    mime: `image/${ext === 'jpg' ? 'jpeg' : ext}`, bytes: out.length, width, height,
    tags: '', category: '', license: '', createdAt: Date.now(),
  })
  return ok(res, { asset: { id, url, width, height, bytes: out.length } })
}))

/** GIF 合规检查 */
assetsRouter.post('/image/gif-check', asyncHandler(async (req, res) => {
  const input = await resolveInput(req.body)
  if (!input) badRequest('需要 assetId 或 url')
  const result = await checkGif(input.buf)
  return ok(res, { check: result })
}))

/** GIF 降帧 */
assetsRouter.post('/image/gif-reduce', asyncHandler(async (req, res) => {
  const input = await resolveInput(req.body)
  if (!input) badRequest('需要 assetId 或 url')
  const out = await reduceGifFrames(input.buf, num(req.body?.maxFrames, 300))
  const name = await saveBuffer(out, 'gif')
  const id = crypto.randomBytes(6).toString('hex')
  const info = await probe(out)
  const url = `/uploads/${name}`
  insertAsset({ id, kind: 'gif', name: 'reduced.gif', url, mime: 'image/gif', bytes: out.length, width: info.width, height: info.height, tags: '', category: '', license: '', createdAt: Date.now() })
  return ok(res, { asset: { id, url, frames: info.frames, bytes: out.length } })
}))

/** 图片信息 */
assetsRouter.post('/image/info', asyncHandler(async (req, res) => {
  const input = await resolveInput(req.body)
  if (!input) badRequest('需要 assetId 或 url')
  return ok(res, { info: await probe(input.buf) })
}))

/** 实时预览：应用调整参数，返回 base64 dataURL（不落盘、不建素材） */
assetsRouter.post('/image/preview', asyncHandler(async (req, res) => {
  const input = await resolveInput(req.body)
  if (!input) badRequest('需要 assetId 或 url')
  const b = req.body ?? {}
  const out = await adjustBuffer(input.buf, b)
  const fmt = str(b.outputExt, 'png')
  let buf = out
  let mime = 'image/png'
  if (fmt === 'jpeg' || fmt === 'jpg') { buf = await sharp(out).jpeg({ quality: 90, mozjpeg: true }).toBuffer(); mime = 'image/jpeg' }
  else if (fmt === 'webp') { buf = await sharp(out).webp({ quality: 90 }).toBuffer(); mime = 'image/webp' }
  else buf = await sharp(out).png().toBuffer()
  const info = await probe(buf)
  return ok(res, { dataUrl: `data:${mime};base64,${buf.toString('base64')}`, width: info.width, height: info.height })
}))

/** 生成占位图 */
assetsRouter.post('/image/placeholder', asyncHandler(async (req, res) => {
  const buf = await placeholder(num(req.body?.width, 600), num(req.body?.height, 300), str(req.body?.color, '#EEEEEE'), str(req.body?.text))
  const name = await saveBuffer(buf, 'png')
  const id = crypto.randomBytes(6).toString('hex')
  const url = `/uploads/${name}`
  insertAsset({ id, kind: 'image', name: 'placeholder.png', url, mime: 'image/png', bytes: buf.length, width: num(req.body?.width, 600), height: num(req.body?.height, 300), tags: '', category: '', license: '', createdAt: Date.now() })
  return ok(res, { asset: { id, url } })
}))

/** 批量压缩 */
assetsRouter.post('/image/batch-compress', asyncHandler(async (req, res) => {
  const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids : []
  if (!ids.length) badRequest('需要 ids')
  const results: any[] = []
  for (const id of ids) {
    const a = getAsset(str(id))
    if (!a) continue
    try {
      const file = path.join(UPLOAD_DIR, path.basename(a.url))
      const r = await compress(fs.readFileSync(file), {
        quality: num(req.body?.quality, 80), maxWidth: num(req.body?.maxWidth, 1080),
        targetBytes: req.body?.targetBytes ? num(req.body.targetBytes) : undefined,
      })
      fs.writeFileSync(file, r.buffer)
      updateAssetMeta(a.id, {})
      const db = (await import('../db.js'))
      db.db.prepare('UPDATE assets SET bytes = ? WHERE id = ?').run(r.buffer.length, a.id)
      results.push({ id: a.id, bytes: r.buffer.length, before: a.bytes })
    } catch (e: any) {
      results.push({ id: a.id, error: e?.message ?? '失败' })
    }
  }
  return ok(res, { results })
}))
