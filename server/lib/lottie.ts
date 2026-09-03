import { JSDOM } from 'jsdom'
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { createRequire } from 'node:module'
import type { LottieReport, LottieExportMode } from '../../shared/types.js'
import { CONTENT_RULES } from '../../shared/rules.js'
import { OUT_DIR } from '../db.js'

const require_ = createRequire(import.meta.url)

/* ------------------------------------------------------------------ */
/* jsdom 运行环境（lottie-web 需要 DOM）                                 */
/* ------------------------------------------------------------------ */

type LottiePlayer = any

let cachedPlayer: LottiePlayer | null = null
let cachedDom: JSDOM | null = null

const stubCtx = {
  font: '', fillStyle: '', strokeStyle: '', textBaseline: '', textAlign: '', globalAlpha: 1, lineWidth: 1,
  measureText: (t: string) => ({ width: String(t).length * 8 }),
  fillText() {}, strokeText() {}, fillRect() {}, clearRect() {}, strokeRect() {},
  save() {}, restore() {}, translate() {}, scale() {}, rotate() {}, beginPath() {}, closePath() {},
  moveTo() {}, lineTo() {}, bezierCurveTo() {}, quadraticCurveTo() {}, arc() {}, fill() {}, stroke() {},
  clip() {}, setTransform() {}, transform() {}, drawImage() {},
  createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
  getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
  putImageData() {},
}

function ensureEnv(): { dom: JSDOM; lottie: LottiePlayer } {
  if (cachedDom && cachedPlayer) return { dom: cachedDom, lottie: cachedPlayer }
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { pretendToBeVisual: true })
  const w = dom.window as any
  w.HTMLCanvasElement.prototype.getContext = () => stubCtx

  const g = globalThis as any
  const set = (k: string, v: any) => Object.defineProperty(g, k, { value: v, configurable: true, writable: true })
  set('window', w)
  set('document', w.document)
  set('navigator', w.navigator)
  set('HTMLElement', w.HTMLElement)
  set('SVGElement', w.SVGElement)
  set('requestAnimationFrame', w.requestAnimationFrame.bind(w))
  set('cancelAnimationFrame', w.cancelAnimationFrame.bind(w))

  // lottie-web 是浏览器 UMD 包，必须在全局就绪后再加载
  const player = require_('lottie-web')
  cachedDom = dom
  cachedPlayer = player.default ?? player
  return { dom, lottie: cachedPlayer }
}

/* ------------------------------------------------------------------ */
/* .lottie（zip）解压 —— 只用 node 内置 zlib，不引第三方                   */
/* ------------------------------------------------------------------ */

export function loadDotLottie(buf: Buffer): any {
  // 定位 End of Central Directory
  let eocd = -1
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 65558; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('不是合法的 .lottie（zip）文件')
  const entries = buf.readUInt16LE(eocd + 10)
  let off = buf.readUInt32LE(eocd + 16)

  const files: Record<string, Buffer> = {}
  for (let i = 0; i < entries; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break
    const method = buf.readUInt16LE(off + 10)
    const compSize = buf.readUInt32LE(off + 20)
    const nameLen = buf.readUInt16LE(off + 28)
    const extraLen = buf.readUInt16LE(off + 30)
    const commentLen = buf.readUInt16LE(off + 32)
    const localOff = buf.readUInt32LE(off + 42)
    const name = buf.slice(off + 46, off + 46 + nameLen).toString('utf8')

    const lnLen = buf.readUInt16LE(localOff + 26)
    const lxLen = buf.readUInt16LE(localOff + 28)
    const dataStart = localOff + 30 + lnLen + lxLen
    const raw = buf.slice(dataStart, dataStart + compSize)
    files[name] = method === 0 ? raw : zlib.inflateRawSync(raw)
    off += 46 + nameLen + extraLen + commentLen
  }

  const manifestName = Object.keys(files).find((n) => n.endsWith('manifest.json'))
  const dataName = manifestName
    ? (() => {
      try {
        const manifest = JSON.parse(files[manifestName].toString('utf8'))
        const first = manifest.animations?.[0]
        return first ? `animations/${first.id}.json` : undefined
      } catch { return undefined }
    })()
    : undefined
  const target = Object.keys(files).find((n) => n.endsWith('.json') && !n.endsWith('manifest.json'))
  const jsonName = (dataName && files[dataName] ? dataName : target) ?? Object.keys(files)[0]
  const json = JSON.parse(files[jsonName].toString('utf8'))
  return { json, files }
}

/* ------------------------------------------------------------------ */
/* 能力探测                                                             */
/* ------------------------------------------------------------------ */

const UNSUPPORTED_FOR_SMIL = new Set(['tm', 'rp', 'mm', 'gf', 'gs', 'ef', 'pb', 'zz', 'op', 'rd'])

function walkShapes(items: any[], hit: Set<string>) {
  for (const it of items ?? []) {
    if (!it || typeof it !== 'object') continue
    hit.add(it.ty)
    if (it.it) walkShapes(it.it, hit)
  }
}

function propIsAnimated(p: any): boolean {
  return !!p && p.a === 1 && Array.isArray(p.k) && p.k.length > 1
}

export function probeLottie(json: any): LottieReport {
  const w: number = json.w ?? 0
  const h: number = json.h ?? 0
  const fr: number = json.fr ?? 30
  const ip: number = json.ip ?? 0
  const op: number = json.op ?? 0
  const frames = Math.max(1, Math.round(op - ip))
  const durationMs = Math.round((frames / fr) * 1000)

  const features = new Set<string>()
  const unsupported: string[] = []
  const notes: LottieReport['notes'] = []
  let hasImages = false
  let hasMasks = false
  let hasExpressions = false
  let hasText = false
  let smilOk = true

  const inspectLayer = (layer: any, prefix = ''): void => {
    const ty = layer.ty
    const name = prefix + (layer.nm ?? `layer${layer.ind}`)
    const reasons: string[] = []

    if (layer.ddd === 1) { reasons.push('3D 图层'); features.add('3D') }
    if (layer.hasMask || (layer.masksProperties?.length ?? 0) > 0) { hasMasks = true; reasons.push('蒙版'); features.add('蒙版') }
    if (layer.tt) { reasons.push('轨道遮罩'); features.add('轨道遮罩') }
    if (layer.ef?.length) { hasExpressions = true; reasons.push('效果/表达式'); features.add('效果') }
    if (layer.tm) { reasons.push('时间重映射'); features.add('时间重映射') }
    if ((layer.bm ?? 0) !== 0) { reasons.push('混合模式'); features.add('混合模式') }

    const hits = new Set<string>()
    if (layer.shapes) walkShapes(layer.shapes, hits)
    for (const k of hits) {
      if (UNSUPPORTED_FOR_SMIL.has(k)) {
        reasons.push(`形状特性 ${k}`)
        features.add(k)
      }
    }

    switch (ty) {
      case 0: {
        features.add('预合成')
        const asset = (json.assets ?? []).find((a: any) => a.id === layer.refId)
        if (asset?.layers) {
          for (const sub of asset.layers) inspectLayer(sub, name + '/')
        } else reasons.push('找不到预合成资源')
        break
      }
      case 1: features.add('纯色层'); break
      case 2:
        hasImages = true
        reasons.push('位图图层')
        features.add('位图')
        break
      case 3: features.add('空对象'); break
      case 4: features.add('形状层'); break
      case 5:
        hasText = true
        reasons.push('文字图层（SMIL 无法保证字体度量一致）')
        features.add('文字')
        break
      case 6: reasons.push('音频层'); features.add('音频'); break
      default: reasons.push(`未支持图层类型 ${ty}`)
    }

    if (JSON.stringify(layer ?? {}).includes('"x":"var') || typeof layer.ks?.o?.k?.[0]?.x === 'string') {
      hasExpressions = true
      reasons.push('表达式')
      features.add('表达式')
    }

    if (reasons.length) smilOk = false
    notes.push({ layer: name, ok: reasons.length === 0, reason: reasons.join('、') || undefined })
  }

  for (const layer of json.layers ?? []) inspectLayer(layer)

  if (frames > CONTENT_RULES.gifMaxFrames) unsupported.push(`帧数 ${frames} 超过 GIF 300 帧上限`)
  if (hasMasks) unsupported.push('蒙版会被降级（微信端无法保留 id 引用，已自动展平）')
  if (hasImages) unsupported.push('位图需先上传为素材，导出时会替换链接')

  const capability = {
    smil: smilOk,
    frames: true,
    gif: frames <= CONTENT_RULES.gifMaxFrames * 2,
  }
  const suggested: LottieExportMode = capability.smil ? 'smil' : 'frames'

  return {
    features: Array.from(features),
    unsupported,
    capability,
    suggested,
    frames,
    durationMs,
    width: w,
    height: h,
    layers: (json.layers ?? []).length,
    hasImages,
    hasMasks,
    hasExpressions,
    hasText,
    notes,
  }
}

/* ------------------------------------------------------------------ */
/* 帧渲染                                                               */
/* ------------------------------------------------------------------ */

export interface RenderResult {
  frames: string[]
  width: number
  height: number
  fps: number
  totalFrames: number
}

/** 用 lottie-web 逐帧渲染为 SVG 源码 */
export async function renderFrames(
  animationData: any,
  opts: { maxFrames?: number; assets?: Record<string, string> } = {},
): Promise<RenderResult> {
  const { dom, lottie } = ensureEnv()
  const data = applyAssetUrls(JSON.parse(JSON.stringify(animationData)), opts.assets)
  const fr: number = data.fr ?? 30
  const ip: number = data.ip ?? 0
  const op: number = data.op ?? 0
  const totalRaw = Math.max(1, Math.round(op - ip))
  const maxFrames = Math.min(opts.maxFrames ?? CONTENT_RULES.gifMaxFrames, CONTENT_RULES.gifMaxFrames)
  const step = totalRaw > maxFrames ? totalRaw / maxFrames : 1
  const count = Math.min(maxFrames, totalRaw)

  const container = dom.window.document.createElement('div')
  dom.window.document.body.appendChild(container)

  const anim = lottie.loadAnimation({ container, renderer: 'svg', loop: false, autoplay: false, animationData: data })
  await new Promise((r) => setTimeout(r, 60))

  const frames: string[] = []
  for (let i = 0; i < count; i++) {
    const f = ip + Math.round(i * step)
    anim.goToAndStop(f, true)
    frames.push(normalizeFrame(container.innerHTML))
  }

  anim.destroy()
  container.remove()

  const width = data.w ?? 0
  const height = data.h ?? 0
  return { frames, width, height, fps: totalRaw > maxFrames ? (count / (totalRaw / fr)) : fr, totalFrames: count }
}

/** 把位图资源替换为已上传的链接 */
function applyAssetUrls(json: any, assets?: Record<string, string>): any {
  if (!assets || !Array.isArray(json.assets)) return json
  for (const a of json.assets) {
    const url = assets[a.id] ?? assets[String(a.id)]
    if (url && a.p) { a.p = url; a.e = 0 }
  }
  return json
}

/**
 * 规范化单帧 SVG：
 * 1. 去掉 lottie-web 注入的 style（含 translate3d / content-visibility，微信不认）
 * 2. 解析 url(#id) 引用 —— 微信会全量删除 id，引用会全部失效
 *    - 覆盖整个画布的 clipPath → 直接丢弃
 *    - 渐变 → 取中间色展平成纯色
 *    - 其它 → 丢弃引用
 * 3. 删除所有 id / class
 * 4. 外链图片 → 保留（已替换为上传后的链接）
 */
export function normalizeFrame(svg: string): string {
  const dom = new JSDOM(svg, { contentType: 'image/svg+xml' })
  const doc = dom.window.document
  const root = doc.documentElement
  if (root.tagName.toLowerCase() !== 'svg') return svg

  root.removeAttribute('style')
  root.removeAttribute('width')
  root.removeAttribute('height')
  if (!root.getAttribute('preserveAspectRatio')) root.setAttribute('preserveAspectRatio', 'xMidYMid meet')

  const vb = (root.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number)
  const [vx, vy, vw, vh] = vb.length === 4 ? vb : [0, 0, 0, 0]

  const defsById = new Map<string, Element>()
  root.querySelectorAll('[id]').forEach((el) => defsById.set(el.getAttribute('id')!, el))

  const resolveUrl = (value: string): string | null => {
    const m = /url\(["']?#([^"')]+)["']?\)/.exec(value)
    if (!m) return null
    const target = defsById.get(m[1])
    if (!target) return null
    const tag = target.tagName.toLowerCase()
    if (tag === 'lineargradient' || tag === 'radialgradient') {
      const stops = Array.from(target.querySelectorAll('stop'))
      if (!stops.length) return null
      const mid = stops[Math.floor(stops.length / 2)]
      return mid.getAttribute('stop-color') ?? '#888888'
    }
    if (tag === 'clippath') {
      const shapes = Array.from(target.children)
      if (shapes.length === 1 && shapes[0].tagName.toLowerCase() === 'rect') {
        const r = shapes[0]
        const rx = parseFloat(r.getAttribute('x') ?? '0')
        const ry = parseFloat(r.getAttribute('y') ?? '0')
        const rw = parseFloat(r.getAttribute('width') ?? '0')
        const rh = parseFloat(r.getAttribute('height') ?? '0')
        // 覆盖整个画布的裁剪等价于不裁剪
        if (rx <= vx + 0.5 && ry <= vy + 0.5 && rw >= vw - 1 && rh >= vh - 1) return 'none'
      }
      return null
    }
    return null
  }

  root.querySelectorAll('*').forEach((el: any) => {
    el.removeAttribute('style')
    for (const attr of ['clip-path', 'mask', 'fill', 'stroke', 'filter']) {
      const v = el.getAttribute?.(attr)
      if (!v || !v.includes('url(')) continue
      const resolved = resolveUrl(v)
      if (resolved === null) el.removeAttribute(attr)
      else if (resolved === 'none') el.removeAttribute(attr)
      else if (attr === 'fill' || attr === 'stroke') el.setAttribute(attr, resolved)
      else el.removeAttribute(attr)
    }
    el.removeAttribute('id')
    el.removeAttribute('class')
  })

  root.querySelectorAll('defs, clipPath, mask, filter, linearGradient, radialGradient').forEach((el) => el.remove())
  return root.outerHTML
}

/** 单帧的「内容部分」（去掉外层 svg 壳），用于拼装翻页动画 */
function frameInner(svg: string): string {
  const dom = new JSDOM(svg, { contentType: 'image/svg+xml' })
  const root = dom.window.document.documentElement
  return root.innerHTML
}

/* ------------------------------------------------------------------ */
/* L2：帧序列 SVG（翻页）                                                */
/* ------------------------------------------------------------------ */

export interface FlipbookOpts {
  loop?: boolean
  /** 触发方式 */
  trigger?: 'auto' | 'click'
}

export function buildFlipbook(res: RenderResult, opts: FlipbookOpts = {}): string {
  const loop = opts.loop ?? true
  const { frames, width, height, fps, totalFrames } = res
  if (!frames.length) return ''

  const dt = 1 / (fps || 30)
  const total = dt * totalFrames

  const groups = frames.map((f, i) => {
    const begin = (i * dt).toFixed(4)
    const keyTime = Math.min(0.9999, dt / total).toFixed(5)
    const anim = loop
      ? `<animate attributeName="display" values="inline;none" keyTimes="0;${keyTime}" calcMode="discrete" begin="${begin}s" dur="${total.toFixed(4)}s" repeatCount="indefinite"/>`
      : `<set attributeName="display" to="inline" begin="${begin}s" dur="${dt.toFixed(4)}s" fill="remove"/>`
    return `<g display="none">${anim}${frameInner(f)}</g>`
  }).join('')

  const triggerAttr = opts.trigger === 'click'
    ? `<set attributeName="display" to="inline" begin="touchstart; click" dur="0.01s" fill="freeze"/>`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="display:block">${triggerAttr}${groups}</svg>`
}

/* ------------------------------------------------------------------ */
/* L1：原生 SMIL 转换                                                    */
/* ------------------------------------------------------------------ */

const hex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')

function rgbaToHex(c: number[]): string {
  const [r, g, b] = c.map((v) => Math.round(v * 255))
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

function staticValue(prop: any, dims = 1): number[] {
  if (!prop) return Array.from({ length: dims }, () => (dims === 2 ? 100 : 0))
  if (prop.a === 0) {
    const k = prop.k
    return Array.isArray(k) ? k.slice(0, dims) : [k]
  }
  const first = prop.k?.[0]?.s
  if (Array.isArray(first)) return first.slice(0, dims)
  return [first ?? 0]
}

interface Kf { t: number; v: number[]; ox?: number; oy?: number; ix?: number; iy?: number }

function readKeyframes(prop: any, dims: number): Kf[] {
  if (!prop) return [{ t: 0, v: Array.from({ length: dims }, () => 0) }]
  if (prop.a === 0) return [{ t: 0, v: staticValue(prop, dims) }]
  const out: Kf[] = []
  for (const k of prop.k ?? []) {
    const s = Array.isArray(k.s) ? k.s.slice(0, dims) : [k.s]
    const pick = (o: any) => (Array.isArray(o?.x) ? o.x[0] : o?.x)
    const pickY = (o: any) => (Array.isArray(o?.y) ? o.y[0] : o?.y)
    out.push({
      t: k.t ?? 0,
      v: s.map((n: any) => (typeof n === 'number' ? n : 0)),
      ox: pick(k.o), oy: pickY(k.o), ix: pick(k.i), iy: pickY(k.i),
    })
  }
  // 最后一个关键帧只有时间点（Lottie 规范如此），补上数值
  if (out.length > 1) {
    const last = out[out.length - 1]
    if (!last.v.length || last.v.every((n) => n === undefined)) last.v = [...out[out.length - 2].v]
  }
  return out
}

/** 关键帧 → SMIL 的 values / keyTimes / keySplines */
function kfToSmil(kfs: Kf[], fps: number, startFrame: number, endFrame: number) {
  if (kfs.length === 1) {
    return { values: joinVals([kfs[0].v]), keyTimes: '0', keySplines: null as string | null, dur: Math.max(0.05, (endFrame - startFrame) / fps) }
  }
  const span = Math.max(0.001, kfs[kfs.length - 1].t - kfs[0].t)
  const keyTimes = kfs.map((k) => (((k.t - kfs[0].t) / span) || 0).toFixed(4)).join(';')
  const values = joinList(kfs.map((k) => k.v))
  const splines: string[] = []
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i], b = kfs[i + 1]
    const x1 = clamp(a.ox ?? 0.333, 0, 1), y1 = clamp(a.oy ?? 0.333, -2, 2)
    const x2 = clamp(b.ix ?? 0.667, 0, 1), y2 = clamp(b.iy ?? 0.667, -2, 2)
    splines.push(`${r(x1)} ${r(y1)} ${r(x2)} ${r(y2)}`)
  }
  return { values, keyTimes, keySplines: splines.join(';'), dur: Math.max(0.05, span / fps) }
}

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)) }
function r(n: number) { return Math.round(n * 1000) / 1000 }
function joinVals(v: number[][]) { return v.map((a) => a.join(' ')).join(';') }
function joinList(v: number[][]) { return v.map((a) => a.join(' ')).join(';') }

/** values 字符串整体缩放（百分比 → 0–1 等场景） */
function scaleValues(values: string, k: number, digits = 4): string {
  return values
    .split(';')
    .map((seg) => seg.trim().split(/\s+/).map((n) => (parseFloat(n) * k).toFixed(digits)).join(' '))
    .join(';')
}

/** 贝塞尔路径：Lottie 的 v/i/o → SVG d */
function bezierPath(k: any): string {
  const v: number[][] = k.v ?? []
  const i: number[][] = k.i ?? []
  const o: number[][] = k.o ?? []
  if (!v.length) return ''
  let d = `M${r(v[0][0])},${r(v[0][1])}`
  for (let n = 1; n < v.length; n++) {
    const c1 = [r(v[n - 1][0] + (o[n - 1]?.[0] ?? 0)), r(v[n - 1][1] + (o[n - 1]?.[1] ?? 0))]
    const c2 = [r(v[n][0] + (i[n]?.[0] ?? 0)), r(v[n][1] + (i[n]?.[1] ?? 0))]
    d += `C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${r(v[n][0])},${r(v[n][1])}`
  }
  if (k.c) d += 'Z'
  return d
}

function rectPath(s: number[], p: number[], rad: number): string {
  const [w, h] = s
  const x = p[0] - w / 2
  const y = p[1] - h / 2
  const rr = Math.min(rad, w / 2, h / 2)
  if (rr <= 0) return `M${r(x)},${r(y)}h${r(w)}v${r(h)}h${r(-w)}Z`
  return `M${r(x + rr)},${r(y)}h${r(w - 2 * rr)}a${rr},${rr} 0 0 1 ${rr},${rr}v${r(h - 2 * rr)}a${rr},${rr} 0 0 1 ${-rr},${rr}h${r(-(w - 2 * rr))}a${rr},${rr} 0 0 1 ${-rr},${-rr}v${r(-(h - 2 * rr))}a${rr},${rr} 0 0 1 ${rr},${-rr}Z`
}

function ellipsePath(s: number[], p: number[]): string {
  const rx = s[0] / 2, ry = s[1] / 2
  return `M${r(p[0] - rx)},${r(p[1])}a${r(rx)},${r(ry)} 0 1 0 ${r(2 * rx)},0a${r(rx)},${r(ry)} 0 1 0 ${r(-2 * rx)},0Z`
}

interface ShapeOut { d: string; fill?: string; fillOpacity?: number; stroke?: string; strokeWidth?: number; strokeOpacity?: number }

/** 形状组 → 扁平的路径 + 绘制属性 */
function flattenShapes(items: any[], parent: ShapeOut, out: ShapeOut[], depth = 0): void {
  if (depth > 8) return
  for (const it of items ?? []) {
    if (!it || typeof it !== 'object') continue
    switch (it.ty) {
      case 'gr': {
        flattenShapes(it.it ?? [], { ...parent }, out, depth + 1)
        break
      }
      case 'sh': {
        const k = it.ks?.k
        const d = typeof k === 'string' ? k : bezierPath(k)
        if (d) out.push({ ...parent, d })
        break
      }
      case 'rc': {
        const s = staticValue(it.s, 2)
        const p = staticValue(it.p, 2)
        const rad = staticValue(it.r, 1)[0] ?? 0
        out.push({ ...parent, d: rectPath(s, p, rad) })
        break
      }
      case 'el': {
        const s = staticValue(it.s, 2)
        const p = staticValue(it.p, 2)
        out.push({ ...parent, d: ellipsePath(s, p) })
        break
      }
      case 'fl': {
        parent.fill = rgbaToHex(staticValue(it.c, 4))
        parent.fillOpacity = (staticValue(it.o, 1)[0] ?? 100) / 100
        break
      }
      case 'st': {
        parent.stroke = rgbaToHex(staticValue(it.c, 4))
        parent.strokeWidth = staticValue(it.w, 1)[0] ?? 1
        parent.strokeOpacity = (staticValue(it.o, 1)[0] ?? 100) / 100
        break
      }
      default:
        break
    }
  }
}

function shapeAttrs(s: ShapeOut): string {
  const a: string[] = []
  a.push(`fill="${s.fill ?? 'none'}"`)
  if (s.fillOpacity != null && s.fillOpacity < 1) a.push(`fill-opacity="${r(s.fillOpacity)}"`)
  if (s.stroke) {
    a.push(`stroke="${s.stroke}"`)
    a.push(`stroke-width="${r(s.strokeWidth ?? 1)}"`)
    if (s.strokeOpacity != null && s.strokeOpacity < 1) a.push(`stroke-opacity="${r(s.strokeOpacity)}"`)
  }
  return a.join(' ')
}

function animAttrs(smil: { values: string; keyTimes: string; keySplines: string | null }, dur: number, begin: number, repeat: string): string {
  const parts = [
    `dur="${r(dur)}s"`,
    `begin="${r(begin)}s"`,
    `repeatCount="${repeat}"`,
    'fill="freeze"',
  ]
  if (smil.keySplines) {
    parts.push('calcMode="spline"', `keyTimes="${smil.keyTimes}"`, `keySplines="${smil.keySplines}"`)
  }
  return parts.join(' ')
}

/**
 * Lottie → 原生 SMIL（L1）。
 * 覆盖：形状层（rc/el/sh + fl/st）、纯色层、预合成，以及 p/r/s/o 的关键帧。
 * 不覆盖的（蒙版 / 渐变 / 裁剪路径 / 位图 / 文字）由 probe 判定后降级到 L2/L3。
 */
export function lottieToSmil(json: any): { svg: string; warnings: string[] } {
  const warnings: string[] = []
  const fr: number = json.fr ?? 30
  const ip0: number = json.ip ?? 0
  const op0: number = json.op ?? 0
  const totalDur = Math.max(0.05, (op0 - ip0) / fr)

  const body = renderLayerGroup(json.layers ?? [], json, ip0, fr, totalDur, warnings, 0)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${json.w ?? 200} ${json.h ?? 200}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="display:block">${body}</svg>`
  return { svg, warnings }
}

function renderLayerGroup(layers: any[], json: any, ip0: number, fr: number, totalDur: number, warnings: string[], depth: number): string {
  if (depth > 6) return ''
  const out: string[] = []
  // Lottie 的 ind 越大越靠上，绘制顺序为数组顺序（第一个在最上层）→ 反转
  for (const layer of [...layers].reverse()) {
    out.push(renderLayer(layer, json, ip0, fr, totalDur, warnings, depth))
  }
  return out.join('')
}

function renderLayer(layer: any, json: any, ip0: number, fr: number, totalDur: number, warnings: string[], depth: number): string {
  const ks = layer.ks ?? {}
  const ip: number = layer.ip ?? ip0
  const op: number = layer.op ?? (ip0 + totalDur * fr)

  const pKf = readKeyframes(ks.p, ks.p?.a === 1 && Array.isArray(ks.p.k?.[0]?.s) && ks.p.k[0].s.length === 3 ? 3 : 2)
  const aV = staticValue(ks.a, 3)
  const sKf = readKeyframes(ks.s, 2)
  const rKf = readKeyframes(ks.r, 1)
  const oKf = readKeyframes(ks.o, 1)

  // 3D 位置只取 xy
  for (const k of pKf) k.v = k.v.slice(0, 2)

  const pS = kfToSmil(pKf, fr, ip, op)
  const sS = kfToSmil(sKf, fr, ip, op)
  const rS = kfToSmil(rKf, fr, ip, op)
  const oS = kfToSmil(oKf, fr, ip, op)

  // 各属性时长可能不同 → 统一按各自 dur + repeatCount 铺满整段
  const repeat = (dur: number) => (dur >= totalDur - 0.001 ? '1' : String(Math.max(1, Math.round(totalDur / Math.max(0.05, dur)))))

  const anims = [
    `<animateTransform attributeName="transform" attributeType="XML" type="translate" values="${pS.values}" ${animAttrs(pS, pS.dur, 0, repeat(pS.dur))} additive="sum"/>`,
    `<animateTransform attributeName="transform" attributeType="XML" type="rotate" values="${rS.values}" ${animAttrs(rS, rS.dur, 0, repeat(rS.dur))} additive="sum"/>`,
    `<animateTransform attributeName="transform" attributeType="XML" type="scale" values="${scaleValues(sS.values, 0.01)}" ${animAttrs(sS, sS.dur, 0, repeat(sS.dur))} additive="sum"/>`,
    `<animate attributeName="opacity" values="${scaleValues(oS.values, 0.01, 3)}" ${animAttrs(oS, oS.dur, 0, repeat(oS.dur))}/>`,
  ].join('')

  // 出入点：超出范围隐藏
  const visibility: string[] = []
  if (ip > ip0) {
    visibility.push(`<set attributeName="display" to="inline" begin="${r((ip - ip0) / fr)}s" dur="${r(totalDur)}s" fill="freeze"/>`)
  }
  if (op < ip0 + totalDur * fr - 0.5) {
    visibility.push(`<set attributeName="display" to="none" begin="${r((op - ip0) / fr)}s" dur="${r(totalDur)}s" fill="freeze"/>`)
  }
  const displayAttr = ip > ip0 ? ' display="none"' : ''

  let content = ''
  switch (layer.ty) {
    case 4: {
      const shapes: ShapeOut[] = []
      flattenShapes(layer.shapes ?? [], {} as ShapeOut, shapes)
      content = shapes.filter((s) => s.d).map((s) => `<path d="${s.d}" ${shapeAttrs(s)}/>`).join('')
      break
    }
    case 1: {
      const [w, h] = [layer.sw ?? 100, layer.sh ?? 100]
      const col = layer.sc ?? '#cccccc'
      content = `<rect x="${r(-w / 2)}" y="${r(-h / 2)}" width="${r(w)}" height="${r(h)}" fill="${col}"/>`
      break
    }
    case 0: {
      const asset = (json.assets ?? []).find((a: any) => a.id === layer.refId)
      if (asset?.layers) {
        content = renderLayerGroup(asset.layers, json, ip0, fr, totalDur, warnings, depth + 1)
      } else {
        warnings.push(`预合成 ${layer.refId} 缺失`)
      }
      break
    }
    case 3:
      content = ''
      break
    default:
      warnings.push(`图层「${layer.nm ?? layer.ind}」类型 ${layer.ty} 不支持 SMIL，已跳过`)
      return ''
  }

  const ax = r(aV[0] ?? 0)
  const ay = r(aV[1] ?? 0)
  return `<g${displayAttr}>${visibility.join('')}${anims}<g transform="translate(${-ax},${-ay})">${content}</g></g>`
}

/* ------------------------------------------------------------------ */
/* L3：GIF                                                              */
/* ------------------------------------------------------------------ */

export async function lottieToGif(
  animationData: any,
  opts: { width?: number; maxFrames?: number; loop?: boolean; assets?: Record<string, string> } = {},
): Promise<{ buffer: Buffer; frames: number; width: number; height: number }> {
  const res = await renderFrames(animationData, { maxFrames: opts.maxFrames, assets: opts.assets })
  const targetW = Math.max(16, Math.min(opts.width ?? res.width ?? 480, 640))
  const scale = res.width ? targetW / res.width : 1
  const targetH = Math.max(16, Math.round((res.height ?? targetW) * scale))

  const GIFEncoder = require_('gif-encoder-2')
  const encoder = new GIFEncoder(targetW, targetH, 'octree', true, res.frames.length)
  encoder.start()
  encoder.setRepeat(opts.loop === false ? 0 : 0)
  encoder.setDelay(Math.max(20, Math.round(1000 / (res.fps || 30))))
  encoder.setQuality(10)
  encoder.setThreshold(20)

  for (const f of res.frames) {
    const raw = await sharp(Buffer.from(f), { density: 144 })
      .resize(targetW, targetH, { fit: 'fill', background: '#ffffff' })
      .ensureAlpha()
      .raw()
      .toBuffer()
    encoder.addFrame(new Uint8ClampedArray(raw))
  }
  encoder.finish()
  const buffer: Buffer = encoder.out.getData()
  return { buffer, frames: res.frames.length, width: targetW, height: targetH }
}

/* ------------------------------------------------------------------ */
/* L4：静态首帧                                                          */
/* ------------------------------------------------------------------ */

export async function lottieToStatic(animationData: any, assets?: Record<string, string>): Promise<string> {
  const res = await renderFrames(animationData, { maxFrames: 1, assets })
  return res.frames[0] ?? ''
}

/* ------------------------------------------------------------------ */
/* 统一入口                                                             */
/* ------------------------------------------------------------------ */

export async function convertLottie(
  animationData: any,
  mode: LottieExportMode,
  opts: { width?: number; loop?: boolean; maxFrames?: number; assets?: Record<string, string> } = {},
): Promise<{ output: string; gifUrl?: string; warnings: string[] }> {
  const report = probeLottie(animationData)
  const warnings: string[] = []
  let useMode = mode

  if (mode === 'smil' && !report.capability.smil) {
    useMode = report.capability.frames ? 'frames' : 'gif'
    warnings.push(`SMIL 不支持该动画（${report.unsupported.join('；') || '含不受支持的图层'}），已降级为 ${useMode.toUpperCase()}`)
  }

  if (useMode === 'smil') {
    const { svg, warnings: w } = lottieToSmil(animationData)
    return { output: svg, warnings: [...warnings, ...w] }
  }

  if (useMode === 'frames') {
    const res = await renderFrames(animationData, { maxFrames: opts.maxFrames, assets: opts.assets })
    const svg = buildFlipbook(res, { loop: opts.loop ?? true })
    if (report.hasMasks) warnings.push('蒙版已被展平，视觉可能有差异')
    return { output: svg, warnings }
  }

  if (useMode === 'gif') {
    const { buffer, frames } = await lottieToGif(animationData, { width: opts.width, loop: opts.loop, assets: opts.assets })
    const name = `lottie-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.gif`
    fs.writeFileSync(path.join(OUT_DIR, name), buffer)
    warnings.push(`已生成 ${frames} 帧 GIF（${(buffer.length / 1024).toFixed(0)}KB）`)
    return { output: '', gifUrl: `/out/${name}`, warnings }
  }

  const svg = await lottieToStatic(animationData, opts.assets)
  return { output: svg, warnings: [...warnings, '已导出静态首帧'] }
}
