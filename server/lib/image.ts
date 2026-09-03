import sharp from 'sharp'
import fs from 'node:fs/promises'
import path from 'node:path'
import { UPLOAD_DIR } from '../db.js'

export interface ImageInfo {
  width: number
  height: number
  format: string
  bytes: number
  frames?: number
  hasAlpha?: boolean
}

export async function probe(input: Buffer | string): Promise<ImageInfo> {
  const meta = await sharp(input, { animated: true }).metadata()
  return {
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    format: meta.format ?? 'unknown',
    bytes: meta.size ?? (typeof input === 'string' ? 0 : input.length),
    frames: meta.pages ?? 1,
    hasAlpha: meta.hasAlpha ?? false,
  }
}

export interface CompressOpts {
  /** 1–100 */
  quality?: number
  /** 最大宽度，超过则等比缩放 */
  maxWidth?: number
  /** 目标体积（字节），会二分质量逼近 */
  targetBytes?: number
  format?: 'jpeg' | 'png' | 'webp' | 'gif' | 'keep'
  /** 是否去除元数据 */
  strip?: boolean
}

function pickFormat(src: string | undefined, want: CompressOpts['format']): 'jpeg' | 'png' | 'webp' | 'gif' {
  if (want && want !== 'keep') return want
  if (src === 'png') return 'png'
  if (src === 'gif') return 'gif'
  if (src === 'webp') return 'webp'
  return 'jpeg'
}

export async function compress(input: Buffer, opts: CompressOpts = {}): Promise<{ buffer: Buffer; info: ImageInfo }> {
  const meta = await sharp(input, { animated: true }).metadata()
  const fmt = pickFormat(meta.format, opts.format)
  const strip = opts.strip ?? true

  const apply = (pipeline: sharp.Sharp, quality: number) => {
    let p = pipeline
    if (opts.maxWidth && meta.width && meta.width > opts.maxWidth) p = p.resize({ width: opts.maxWidth })
    if (strip) p = p.withMetadata({})
    if (fmt === 'jpeg') p = p.jpeg({ quality, mozjpeg: true, chromaSubsampling: '4:4:4' })
    else if (fmt === 'png') p = p.png({ quality, compressionLevel: 9, palette: true })
    else if (fmt === 'webp') p = p.webp({ quality })
    else p = p.gif()
    return p
  }

  let q = opts.quality ?? 82
  let out = await apply(sharp(input, { animated: fmt === 'gif' }), q).toBuffer()

  if (opts.targetBytes && out.length > opts.targetBytes) {
    let lo = 30, hi = q
    for (let i = 0; i < 7 && lo <= hi; i++) {
      const mid = Math.floor((lo + hi) / 2)
      const candidate = await apply(sharp(input, { animated: fmt === 'gif' }), mid).toBuffer()
      if (candidate.length > opts.targetBytes) hi = mid - 1
      else { out = candidate; lo = mid + 1 }
    }
  }

  return { buffer: out, info: await probe(out) }
}

export interface WatermarkOpts {
  type: 'text' | 'image'
  text?: string
  imageUrl?: string
  position?: 'nw' | 'n' | 'ne' | 'w' | 'c' | 'e' | 'sw' | 's' | 'se' | 'tile'
  opacity?: number
  fontSize?: number
  color?: string
  margin?: number
  /** 平铺间隔 */
  tileGap?: number
  rotate?: number
}

const GRAVITY: Record<string, sharp.Gravity> = {
  nw: 'northwest', n: 'north', ne: 'northeast',
  w: 'west', c: 'center', e: 'east',
  sw: 'southwest', s: 'south', se: 'southeast',
}

export async function watermark(input: Buffer, opts: WatermarkOpts): Promise<Buffer> {
  const meta = await sharp(input).metadata()
  const W = meta.width ?? 0
  const H = meta.height ?? 0
  const opacity = opts.opacity ?? 0.35
  const margin = opts.margin ?? 24

  let overlay: Buffer
  if (opts.type === 'image' && opts.imageUrl) {
    const file = opts.imageUrl.startsWith('/uploads/')
      ? path.join(UPLOAD_DIR, path.basename(opts.imageUrl))
      : opts.imageUrl
    overlay = await sharp(file).resize({ width: Math.round(W * 0.2), fit: 'inside' })
      .ensureAlpha(opacity).png().toBuffer()
  } else {
    const text = opts.text ?? 'InkForge'
    const fs = opts.fontSize ?? Math.max(14, Math.round(W / 28))
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(text.length * fs * 1.1) + 40}" height="${Math.round(fs * 1.8)}">
      <text x="20" y="${Math.round(fs * 1.25)}" font-family="sans-serif" font-size="${fs}"
        fill="${opts.color ?? '#ffffff'}" fill-opacity="${opacity}">${escapeXml(text)}</text>
    </svg>`
    overlay = Buffer.from(svg)
  }

  if (opts.position === 'tile') {
    const om = await sharp(overlay).metadata()
    const ow = om.width ?? 100
    const oh = om.height ?? 40
    const gap = opts.tileGap ?? Math.round(ow * 0.6)
    const cols = Math.ceil(W / (ow + gap)) + 1
    const rows = Math.ceil(H / (oh + gap)) + 1
    const tiles: { input: Buffer; left: number; top: number }[] = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const left = c * (ow + gap) - Math.round(ow / 2)
        const top = r * (oh + gap) - Math.round(oh / 2)
        if (left > W || top > H) continue
        tiles.push({ input: overlay, left, top })
      }
    }
    return sharp(input).composite(tiles).toBuffer()
  }

  const g = String(GRAVITY[opts.position ?? 'se'] ?? 'southeast')
  const om = await sharp(overlay).metadata()
  const ow = om.width ?? 0
  const oh = om.height ?? 0
  const hasNorth = g.includes('north')
  const hasWest = g.includes('west')
  const hasEast = g.includes('east')
  const hasSouth = g.includes('south')
  const top = hasNorth ? margin : hasSouth ? Math.max(0, H - oh - margin) : Math.max(0, Math.round((H - oh) / 2))
  const left = hasWest ? margin : hasEast ? Math.max(0, W - ow - margin) : Math.max(0, Math.round((W - ow) / 2))

  return sharp(input).composite([{ input: overlay, top, left }]).toBuffer()
}

export interface FilterOpts {
  brightness?: number  // 1 为原样
  saturation?: number
  contrast?: number
  grayscale?: boolean
  blur?: number
  sharpen?: boolean
  hue?: number
  negate?: boolean
  /** 圆角（输出 png） */
  radius?: number
  /** 边框 */
  border?: { width: number; color: string }
}

export async function applyFilter(input: Buffer, opts: FilterOpts): Promise<Buffer> {
  let p = sharp(input)
  if (opts.grayscale) p = p.grayscale()
  if (typeof opts.hue === 'number') p = p.modulate({ hue: opts.hue })
  if (typeof opts.brightness === 'number' || typeof opts.saturation === 'number') {
    p = p.modulate({ brightness: opts.brightness, saturation: opts.saturation })
  }
  if (typeof opts.contrast === 'number') p = p.linear(opts.contrast, -(128 * opts.contrast) + 128)
  if (opts.negate) p = p.negate()
  if (typeof opts.blur === 'number' && opts.blur > 0) p = p.blur(opts.blur)
  if (opts.sharpen) p = p.sharpen()

  if (opts.radius || opts.border) {
    const meta = await sharp(input).metadata()
    const W = meta.width ?? 0
    const H = meta.height ?? 0
    const r = Math.min(opts.radius ?? 0, Math.min(W, H) / 2)
    const bw = opts.border?.width ?? 0
    const mask = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
        <rect x="${bw / 2}" y="${bw / 2}" width="${W - bw}" height="${H - bw}"
          rx="${r}" ry="${r}" fill="#fff" ${bw ? `stroke="#000" stroke-width="${bw}"` : ''}/>
      </svg>`,
    )
    const composited = await p.composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer()
    if (bw && opts.border) {
      const bg = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
          <rect x="${bw / 2}" y="${bw / 2}" width="${W - bw}" height="${H - bw}" rx="${r}" ry="${r}"
            fill="none" stroke="${opts.border.color}" stroke-width="${bw}"/>
        </svg>`,
      )
      return sharp(bg).composite([{ input: composited }]).png().toBuffer()
    }
    return composited
  }
  return p.toBuffer()
}

/**
 * 去背景：基于四角采样 + 容差的连通域抠图。
 * 对纯色/接近纯色的背景（常见于手绘素材、图标、白底图）效果良好。
 * 输出 RGBA PNG。
 */
export async function removeBackground(input: Buffer, tolerance = 32, feather = 1): Promise<Buffer> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const W = info.width
  const H = info.height
  const ch = info.channels
  const px = (x: number, y: number) => {
    const i = (y * W + x) * ch
    return [data[i], data[i + 1], data[i + 2]] as const
  }
  const corners = [px(0, 0), px(W - 1, 0), px(0, H - 1), px(W - 1, H - 1)]
  const bg = corners
    .reduce((acc, c) => [acc[0] + c[0] / 4, acc[1] + c[1] / 4, acc[2] + c[2] / 4], [0, 0, 0]) as unknown as number[]
  const bgAvg = [0, 1, 2].map((k) => corners.reduce((s, c) => s + c[k], 0) / 4)

  const tol2 = tolerance * tolerance
  const isBg = (i: number) => {
    const dr = data[i] - bgAvg[0]
    const dg = data[i + 1] - bgAvg[1]
    const db = data[i + 2] - bgAvg[2]
    return dr * dr + dg * dg + db * db <= tol2
  }

  // BFS 从四边扩散，只吃掉与背景连通的区域（避免把主体里的同色区域也抠掉）
  const seen = new Uint8Array(W * H)
  const queue: number[] = []
  const push = (x: number, y: number) => {
    const idx = y * W + x
    if (seen[idx]) return
    if (!isBg(idx * ch)) return
    seen[idx] = 1
    queue.push(idx)
  }
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1) }
  for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y) }
  while (queue.length) {
    const idx = queue.pop()!
    const x = idx % W
    const y = (idx / W) | 0
    if (x > 0) push(x - 1, y)
    if (x < W - 1) push(x + 1, y)
    if (y > 0) push(x, y - 1)
    if (y < H - 1) push(x, y + 1)
  }

  const out = Buffer.from(data)
  for (let idx = 0; idx < W * H; idx++) {
    if (seen[idx]) out[idx * ch + 3] = 0
    else if (feather > 0) {
      // 边缘羽化：邻域被判为背景的比例决定半透明程度
      const x = idx % W
      const y = (idx / W) | 0
      let bgN = 0
      let n = 0
      for (let dy = -feather; dy <= feather; dy++) {
        for (let dx = -feather; dx <= feather; dx++) {
          const nx = x + dx, ny = y + dy
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
          n++
          if (seen[ny * W + nx]) bgN++
        }
      }
      if (bgN > 0) out[idx * ch + 3] = Math.round(255 * (1 - bgN / n))
    }
  }
  return sharp(out, { raw: { width: W, height: H, channels: ch } }).png().toBuffer()
}

export interface GifCheck {
  frames: number
  bytes: number
  width: number
  height: number
  ok: boolean
  problems: string[]
}

export async function checkGif(input: Buffer, maxFrames = 300, maxBytes = 10 * 1024 * 1024): Promise<GifCheck> {
  const info = await probe(input)
  const problems: string[] = []
  if ((info.frames ?? 1) > maxFrames) problems.push(`帧数 ${info.frames} 超过 ${maxFrames} 帧上限`)
  if (info.bytes > maxBytes) problems.push(`体积 ${(info.bytes / 1024 / 1024).toFixed(2)}MB 超过 10MB 上限`)
  return {
    frames: info.frames ?? 1,
    bytes: info.bytes,
    width: info.width,
    height: info.height,
    ok: problems.length === 0,
    problems,
  }
}

/** 抽帧降帧：把 GIF 降到目标帧数以内 */
export async function reduceGifFrames(input: Buffer, maxFrames = 300): Promise<Buffer> {
  const info = await probe(input)
  if ((info.frames ?? 1) <= maxFrames) return input
  const keep = Array.from({ length: maxFrames }, (_, i) => Math.floor((i * (info.frames! - 1)) / (maxFrames - 1)))
  const frames: Buffer[] = []
  for (const f of keep) {
    frames.push(await sharp(input, { animated: true, page: f }).toBuffer())
  }
  const delay = 100 // 由调用方按原始时长换算更准，这里给保守值
  return sharp(frames[0], { animated: true }).gif({ delay: [delay] }).toBuffer()
}

/** 生成纯色/渐变占位图 */
export async function placeholder(w: number, h: number, color = '#EEEEEE', text?: string): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="100%" height="100%" fill="${color}"/>
    ${text ? `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle"
      font-family="sans-serif" font-size="${Math.round(h / 8)}" fill="#999">${escapeXml(text)}</text>` : ''}
  </svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

export function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!))
}

export async function readUpload(name: string): Promise<Buffer> {
  return fs.readFile(path.join(UPLOAD_DIR, path.basename(name)))
}
