import { JSDOM } from 'jsdom'
import { optimize } from 'svgo'
import { svgPathProperties } from 'svg-path-properties'
import * as polygonClipping from 'polygon-clipping'
import type { AnimationIR, AnimTrack, Easing, SvgElementRef } from '../../shared/types.js'
import { SMIL_RULES } from '../../shared/rules.js'

const SVG_NS = 'http://www.w3.org/2000/svg'

/* ------------------------------------------------------------------ */
/* 解析                                                                 */
/* ------------------------------------------------------------------ */

export function parseSvg(svg: string): Document {
  const dom = new JSDOM(svg, { contentType: 'image/svg+xml' })
  const doc = dom.window.document
  const err = doc.querySelector('parsererror')
  if (err) throw new Error('SVG 解析失败：' + (err.textContent ?? '').slice(0, 200))
  return doc as unknown as Document
}

export function serializeSvg(doc: Document): string {
  const root = doc.documentElement
  return root.outerHTML
}

/** 拿到 SVG 根元素（输入可能是完整文档或片段） */
export function svgRoot(doc: Document): Element {
  const root = doc.documentElement
  return root.tagName.toLowerCase() === 'svg' ? root : (root.querySelector('svg') ?? root)
}

/* ------------------------------------------------------------------ */
/* 清洗与优化                                                           */
/* ------------------------------------------------------------------ */

/**
 * 安全清洗：删除脚本、外链、事件处理器、foreignObject、外链图片。
 * 微信端会删除 id/class，因此这里同步处理，避免编辑器里能跑、导出就废。
 */
export function sanitizeSvg(input: string, opts: { stripIds?: boolean } = {}): { svg: string; removed: string[] } {
  const removed: string[] = []
  const doc = parseSvg(input)
  const root = svgRoot(doc)

  const kill = 'script, foreignObject, a[href^="javascript"], iframe, style, animate[attributeName="href"]'
  root.querySelectorAll(kill).forEach((el) => {
    removed.push(el.tagName)
    el.remove()
  })

  root.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (name.startsWith('on')) { el.removeAttribute(attr.name); removed.push(attr.name) }
      else if ((name === 'href' || name === 'xlink:href') && !attr.value.startsWith('#')) {
        el.removeAttribute(attr.name); removed.push('external-href')
      }
      else if (opts.stripIds !== false && (name === 'id' || name === 'class')) {
        el.removeAttribute(attr.name); removed.push(name)
      }
    }
  })

  // <style> 内联化：微信没有全局样式表
  root.querySelectorAll('style').forEach((s) => s.remove())

  if (!root.getAttribute('xmlns')) root.setAttribute('xmlns', SVG_NS)
  return { svg: serializeSvg(doc), removed: Array.from(new Set(removed)) }
}

/**
 * SVGO 压缩。preset-default 已包含 removeScriptElement / cleanupIds 等。
 * 关键：cleanupIds.force = true —— 微信会删除 id，留着只会误导。
 */
export function optimizeSvg(input: string, opts: { removeViewBox?: boolean } = {}): { svg: string; bytesBefore: number; bytesAfter: number } {
  const bytesBefore = Buffer.byteLength(input, 'utf8')
  try {
    const res = optimize(input, {
      path: 'input.svg',
      multipass: true,
      plugins: [
        {
          name: 'preset-default',
          params: {
            overrides: {
              removeViewBox: opts.removeViewBox ?? false,
              cleanupIds: { remove: true, minify: false, preserve: [], force: true },
              removeTitle: true,
              removeDesc: true,
              removeEditorsNSData: true,
              // 编辑器场景下保留 rect/circle 等图元语义，方便用户选中做动画
              convertShapeToPath: false,
              convertEllipseToCircle: false,
              mergePaths: true,
              collapseGroups: true,
              convertPathData: { floatPrecision: 2, noSpaceAfterFlags: true },
              inlineStyles: { onlyMatchedOnce: false },
              minifyStyles: true,
            },
          },
        },
        { name: 'removeXMLProcInst' },
      ],
    } as any)
    if ('data' in res) {
      return { svg: res.data, bytesBefore, bytesAfter: Buffer.byteLength(res.data, 'utf8') }
    }
  } catch (e: any) {
    // svgo 失败不影响主流程
  }
  return { svg: input, bytesBefore, bytesAfter: bytesBefore }
}

/** 导入流水线：清洗 → 压缩 → 提取元素清单 → 基础度量 */
export function ingestSvg(input: string) {
  const cleaned = sanitizeSvg(input, { stripIds: true })
  const opt = optimizeSvg(cleaned.svg)
  const final = sanitizeSvg(opt.svg, { stripIds: true })
  const elements = extractElements(final.svg)
  const geometry = readGeometry(final.svg)
  return {
    svg: final.svg,
    bytes: Buffer.byteLength(final.svg, 'utf8'),
    bytesBefore: Buffer.byteLength(input, 'utf8'),
    elements,
    ...geometry,
    removed: cleaned.removed,
  }
}

export function readGeometry(svg: string): { viewBox?: string; width?: number; height?: number } {
  try {
    const root = svgRoot(parseSvg(svg))
    const vb = root.getAttribute('viewBox') ?? undefined
    let width = parseFloat(root.getAttribute('width') ?? '')
    let height = parseFloat(root.getAttribute('height') ?? '')
    if ((!width || !height) && vb) {
      const p = vb.split(/[\s,]+/).map(Number)
      width = p[2]; height = p[3]
    }
    return { viewBox: vb, width: width || undefined, height: height || undefined }
  } catch {
    return {}
  }
}

/* ------------------------------------------------------------------ */
/* 元素清单                                                             */
/* ------------------------------------------------------------------ */

const SHAPE_TAGS = ['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'image', 'g']

export function extractElements(svg: string): SvgElementRef[] {
  const out: SvgElementRef[] = []
  try {
    const root = svgRoot(parseSvg(svg))
    walk(root, [], 0)
    function walk(el: Element, path: number[], depth: number) {
      const children = Array.from(el.children)
      // 跳过 defs / clipPath / mask 内部（不可直接动画）
      const skipSelf = ['defs', 'clipPath', 'mask', 'metadata', 'title', 'desc'].includes(el.tagName.toLowerCase())
      children.forEach((child, i) => {
        const tag = child.tagName.toLowerCase()
        const childPath = [...path, i]
        if (!skipSelf && SHAPE_TAGS.includes(tag)) {
          out.push({
            path: childPath,
            tag,
            label: elementLabel(child, tag, out.length),
            ref: childPath.map((n) => `n${n}`).join('>') + '>' + tag,
          })
        }
        walk(child, childPath, depth + 1)
      })
    }
  } catch {
    /* 解析失败返回空清单 */
  }
  return out
}

function elementLabel(el: Element, tag: string, index: number): string {
  const id = el.getAttribute('id')
  if (id) return `#${id}`
  const d = el.getAttribute('d')
  if (d) return `${tag} ${d.slice(0, 14)}…`
  const cls = el.getAttribute('class')
  if (cls) return `${tag}.${cls.split(/\s+/)[0]}`
  const fill = el.getAttribute('fill')
  if (fill && fill !== 'none') return `${tag} ${fill}`
  const text = (el.textContent ?? '').trim()
  if (text) return `“${text.slice(0, 8)}”`
  return `${tag}#${index}`
}

/** 按索引路径定位元素 */
export function elementByPath(root: Element, path: number[]): Element | null {
  let cur: Element = root
  for (const i of path) {
    const children = Array.from(cur.children)
    if (!children[i]) return null
    cur = children[i]
  }
  return cur
}

/* ------------------------------------------------------------------ */
/* 路径工具                                                             */
/* ------------------------------------------------------------------ */

export function pathLength(d: string): number {
  try {
    return new svgPathProperties(d).getTotalLength()
  } catch {
    return 0
  }
}

export function samplePath(d: string, count = 24): { x: number; y: number }[] {
  try {
    const p = new svgPathProperties(d)
    const L = p.getTotalLength()
    const pts: { x: number; y: number }[] = []
    for (let i = 0; i < count; i++) {
      const pt = p.getPointAtLength((L * i) / (count - 1 || 1))
      pts.push({ x: round(pt.x), y: round(pt.y) })
    }
    return pts
  } catch {
    return []
  }
}

/** 把路径近似成多边形（供布尔运算使用） */
export function pathToPolygon(d: string, steps = 64): number[][] {
  const p = new svgPathProperties(d)
  const L = p.getTotalLength()
  const ring: number[][] = []
  for (let i = 0; i < steps; i++) {
    const pt = p.getPointAtLength((L * i) / steps)
    ring.push([round(pt.x), round(pt.y)])
  }
  if (ring.length) ring.push([ring[0][0], ring[0][1]])
  return ring
}

export function polygonToPath(ring: number[][]): string {
  if (!ring.length) return ''
  const [first, ...rest] = ring
  return `M${first[0]},${first[1]}` + rest.map((p) => `L${p[0]},${p[1]}`).join('') + 'Z'
}

/** 布尔运算：union / intersection / difference / xor */
export function booleanOp(a: string, b: string, op: 'union' | 'intersection' | 'difference' | 'xor'): string {
  const pa = pathToPolygon(a)
  const pb = pathToPolygon(b)
  if (!pa.length || !pb.length) return a
  const result = polygonClipping[op]([pa] as any, [pb] as any) as unknown as number[][][]
  const rings = (result ?? []).filter((r) => r && r.length > 2)
  if (!rings.length) return ''
  return rings.map((r) => polygonToPath(r.map((pt) => [round(pt[0]), round(pt[1])]))).join(' ')
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

/* ------------------------------------------------------------------ */
/* SMIL 编译器                                                          */
/* ------------------------------------------------------------------ */

const PRESET_BEZIER: Record<string, [number, number, number, number]> = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
  'power2.out': [0.22, 1, 0.36, 1],
  'power2.inOut': [0.65, 0, 0.35, 1],
  'back.out': [0.34, 1.56, 0.64, 1],
  'elastic.out': [0.18, 1.4, 0.4, 1],
  'bounce.out': [0.32, 1.28, 0.6, 1],
}

export function easingToBezier(e: Easing): [number, number, number, number] {
  if (e.type === 'bezier' && e.bezier) return e.bezier
  return PRESET_BEZIER[e.name ?? 'linear'] ?? PRESET_BEZIER.linear
}

/** 逐段 keySplines：n 个关键帧 → n-1 段 */
export function buildKeySplines(keyframes: { t: number }[], easing: Easing): string {
  const [a, b, c, d] = easingToBezier(easing)
  const segs = Math.max(1, keyframes.length - 1)
  return Array.from({ length: segs }, () => `${a} ${b} ${c} ${d}`).join(';')
}

export function buildKeyTimes(keyframes: { t: number }[]): string {
  return keyframes.map((k) => clamp01(k.t).toFixed(4)).join(';')
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

export interface CompileAnimResult {
  svg: string
  warnings: string[]
}

/**
 * 把 AnimationIR 编译进 SVG，产出微信端能活的 SMIL。
 *
 * 四条铁律（缺一不可）：
 * 1. 交互触发统一 `begin="touchstart; click"`（只写 touchstart 时 PC 端不触发）。
 * 2. 不用 id 做同步（id 会被全量删除），改为绝对时间偏移。
 * 3. iOS 的 transform-origin 不稳定 → 用 translate 补偿或直接避免。
 * 4. 单条 animate 的 dur 不得低于 SMIL_RULES.minDur。
 */
export function compileAnimation(inputSvg: string, anim: AnimationIR): CompileAnimResult {
  const warnings: string[] = []
  const doc = parseSvg(inputSvg)
  const root = svgRoot(doc)

  // 清掉旧的动画节点，保证幂等
  root.querySelectorAll('animate, animateTransform, animateMotion, set').forEach((n) => n.remove())

  const isPointer = anim.trigger === 'click' || anim.trigger === 'longpress'

  for (const track of anim.tracks) {
    const target = elementByPath(root, track.targetPath)
    if (!target) {
      warnings.push(`轨道「${track.property}」的目标元素不存在，已跳过`)
      continue
    }

    const dur = Math.max(SMIL_RULES.minDur, track.dur)
    if (dur !== track.dur) warnings.push(`轨道「${track.property}」时长 ${track.dur}s 过短，已提升到 ${dur}s`)

    let begin: string
    if (anim.trigger === 'auto') {
      begin = `${round(track.begin)}s`
    } else if (anim.trigger === 'longpress') {
      begin = 'touchstart; click'
    } else {
      begin = SMIL_RULES.pointerBegin
    }
    if (isPointer && track.begin > 0) {
      warnings.push('指针触发的动画不支持延迟，已忽略该轨道的 begin 偏移')
    }

    const repeatCount = anim.loop && !isPointer
      ? (track.repeat === 'indefinite' ? 'indefinite' : String(Math.min(SMIL_RULES.maxRepeat, Number(track.repeat) || 0) || 'indefinite'))
      : String(Math.min(SMIL_RULES.maxRepeat, Math.max(1, Number(track.repeat) || 1)))

    const node = buildTrackNode(doc, track, dur, begin, repeatCount, root, warnings)
    if (node) target.appendChild(node)
    else warnings.push(`轨道「${track.property}」未能生成动画节点`)
  }

  if (anim.trigger === 'longpress') {
    warnings.push('长按触发：安卓端需「循环动画元素」作触发媒介才能随松随停，预览已模拟该行为')
  }

  return { svg: serializeSvg(doc), warnings }
}

function buildTrackNode(
  doc: Document,
  track: AnimTrack,
  dur: number,
  begin: string,
  repeatCount: string,
  root: Element,
  warnings: string[],
): Element | null {
  const kf = [...track.keyframes].sort((a, b) => a.t - b.t)
  if (kf.length < 2) return null

  const values = kf.map((k) => k.value).join(';')
  const keyTimes = buildKeyTimes(kf)
  const calcMode = kf.length > 2 ? 'spline' : 'spline'
  const keySplines = buildKeySplines(kf, track.easing)

  const common: Record<string, string> = {
    dur: `${round(dur)}s`,
    begin,
    repeatCount,
    fill: track.fill ?? 'freeze',
    calcMode,
    keyTimes,
    keySplines,
  }

  const make = (tag: string, attrs: Record<string, string>) => {
    const el = doc.createElementNS(SVG_NS, tag)
    for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v)
    return el
  }

  switch (track.property) {
    case 'translate':
    case 'scale':
    case 'rotate': {
      const type = track.property === 'translate' ? 'translate' : track.property === 'scale' ? 'scale' : 'rotate'
      return make('animateTransform', {
        attributeName: 'transform',
        attributeType: 'XML',
        type,
        values,
        ...common,
        additive: 'sum',
      })
    }
    case 'motion': {
      const pathEl = track.pathRef ? elementByPath(root, track.pathRef) : null
      const d = pathEl?.getAttribute('d') ?? ''
      if (!d) {
        warnings.push('沿路径动画缺少参考路径，已跳过')
        return null
      }
      const el = make('animateMotion', {
        dur: common.dur, begin: common.begin, repeatCount: common.repeatCount,
        fill: common.fill, calcMode: common.calcMode, keyTimes: common.keyTimes,
        keySplines: common.keySplines,
        path: d,
        rotate: track.rotateAlong ? 'auto' : '0',
      })
      return el
    }
    case 'stroke-dashoffset': {
      // 描边动画：自动补 stroke-dasharray = 路径长度
      const target = elementByPath(root, track.targetPath)
      const d = target?.getAttribute('d')
      if (d) {
        const L = pathLength(d)
        if (L > 0) {
          target!.setAttribute('stroke-dasharray', String(round(L)))
          const patched = kf.map((k) => {
            const n = parseFloat(k.value)
            return isNaN(n) ? k.value : String(round(n * L))
          }).join(';')
          return make('animate', { attributeName: 'stroke-dashoffset', values: patched, ...common })
        }
      }
      return make('animate', { attributeName: 'stroke-dashoffset', values, ...common })
    }
    default: {
      return make('animate', { attributeName: track.property, values, ...common })
    }
  }
}

/** 移除全部动画（保守发布降级为静态首帧） */
export function stripAnimation(svg: string): string {
  const doc = parseSvg(svg)
  const root = svgRoot(doc)
  root.querySelectorAll('animate, animateTransform, animateMotion, set').forEach((n) => n.remove())
  return serializeSvg(doc)
}

/** 统计 SVG 内的动画节点数 */
export function countAnimations(svg: string): number {
  try {
    return svgRoot(parseSvg(svg)).querySelectorAll('animate, animateTransform, animateMotion, set').length
  } catch {
    return (svg.match(/<animate/g) ?? []).length
  }
}

/** 给 SVG 套一个微信安全的外壳 section */
export function wrapSvgForWechat(svg: string, opts: { maxWidth?: number; align?: string } = {}): string {
  const g = readGeometry(svg)
  const w = opts.maxWidth ?? 677
  const h = g.viewBox ? Math.round((w * parseFloat(g.viewBox.split(/[\s,]+/)[3])) / parseFloat(g.viewBox.split(/[\s,]+/)[2])) : undefined
  return `<section style="width:${w}px;margin:0 auto;text-align:${opts.align ?? 'center'};line-height:0;font-size:0;">${svg}</section>`
}
