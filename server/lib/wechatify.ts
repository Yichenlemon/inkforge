import { JSDOM } from 'jsdom'
import type { Diagnostic } from '../../shared/types.js'
import {
  ALLOWED_TAGS, KILL_LINE_TAGS, TAG_REPLACEMENTS, isAttrAllowed,
  checkCssDeclaration, STRUCTURE_RULES, CASE_SENSITIVE_ATTRS,
} from '../../shared/rules.js'

const INLINE_TAGS = new Set([
  'span', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', 'sub', 'sup',
  'small', 'big', 'a', 'code', 'br', 'tspan', 'text',
])

/* ------------------------------------------------------------------ */
/* 样式字符串解析                                                        */
/* ------------------------------------------------------------------ */

export function parseStyle(style: string): { prop: string; value: string }[] {
  const out: { prop: string; value: string }[] = []
  if (!style) return out
  let buf = ''
  let depth = 0
  const parts: string[] = []
  for (const ch of style) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ';' && depth === 0) { parts.push(buf); buf = ''; continue }
    buf += ch
  }
  parts.push(buf)
  for (const p of parts) {
    const i = p.indexOf(':')
    if (i < 0) continue
    const prop = p.slice(0, i).trim()
    const value = p.slice(i + 1).trim()
    if (prop) out.push({ prop, value })
  }
  return out
}

export interface FilterStyleResult {
  style: string
  dropped: { prop: string; value: string; reason: string }[]
}

export function filterStyle(style: string): FilterStyleResult {
  const decls = parseStyle(style)
  const kept: string[] = []
  const dropped: FilterStyleResult['dropped'] = []
  for (const d of decls) {
    const res = checkCssDeclaration(d.prop, d.value)
    if (res.keep) kept.push(`${d.prop}:${d.value}`)
    else dropped.push({ ...d, reason: res.reason ?? '不支持' })
  }
  return { style: kept.join(';'), dropped }
}

/* ------------------------------------------------------------------ */
/* 微信化主流程                                                          */
/* ------------------------------------------------------------------ */

export interface WechatifyResult {
  html: string
  diagnostics: Diagnostic[]
}

export function wechatify(html: string, opts: { blockIdOf?: (el: Element) => string | undefined } = {}): WechatifyResult {
  const diagnostics: Diagnostic[] = []
  const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="root">${html}</div></body></html>`)
  const doc = dom.window.document
  const root = doc.getElementById('root')!

  const blockIdOf = opts.blockIdOf ?? defaultBlockIdOf
  const seenDropped = new Set<string>()

  /* 1. 整行删除的标签（script/style/iframe…） */
  root.querySelectorAll(KILL_LINE_TAGS.join(',')).forEach((el) => {
    const id = blockIdOf(el)
    diagnostics.push({
      level: 'error', rule: 'forbidden-tag',
      message: `<${el.tagName.toLowerCase()}> 会导致整行样式被平台删除，已移除`,
      blockId: id, fix: 'inline-styles',
    })
    el.remove()
  })

  /* 2. 标签替换 + 白名单外的标签降级为 span/section */
  const nodes = Array.from(root.querySelectorAll('*'))
  for (const el of nodes) {
    const tag = el.tagName.toLowerCase()
    if (tag === 'svg' || tag === 'animate' || tag === 'animatetransform' || tag === 'animatemotion' || tag === 'set' || tag === 'mpath') continue
    if (el.closest('svg')) continue

    let target = tag
    if (TAG_REPLACEMENTS[tag]) target = TAG_REPLACEMENTS[tag]
    if (!(ALLOWED_TAGS as readonly string[]).includes(target)) {
      target = hasBlockChild(el) ? 'section' : 'span'
    }
    if (target !== tag) {
      diagnostics.push({
        level: 'warning', rule: 'tag-replaced',
        message: `<${tag}> 在公众号内不可用，已替换为 <${target}>`,
        blockId: blockIdOf(el),
      })
      replaceTag(doc, el, target)
    }
  }

  /* 3. 属性过滤（含 id / class 全删） */
  for (const el of Array.from(root.querySelectorAll('*'))) {
    const tag = el.tagName.toLowerCase()
    // SVG 子树整体跳过：HTML 解析器会把 attributeName/viewBox 等小写化，
    // 一旦改了属性名 SVG 就废了。SVG 内容由 svg.ts 单独清洗。
    if (tag === 'svg' || el.closest('svg')) continue
    // HTML 里的 SMIL 节点（<set>/<animate>）不在 svg 内，属性名同样会被小写化 → 还原
    if (['animate', 'animatetransform', 'animatemotion', 'set', 'mpath'].includes(tag)) {
      for (const attr of Array.from(el.attributes)) {
        const fixed = CASE_SENSITIVE_ATTRS[attr.name.toLowerCase()]
        if (fixed && fixed !== attr.name) {
          el.setAttribute(fixed, attr.value)
          el.removeAttribute(attr.name)
        }
      }
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (!isAttrAllowed(tag, name)) {
        if (name === 'id' || name === 'class') {
          diagnostics.push({
            level: 'warning', rule: 'strip-ids',
            message: 'id / class 会被平台全量删除（SVG 内的引用会失效）',
            blockId: blockIdOf(el), fix: 'strip-ids',
          })
        } else {
          diagnostics.push({
            level: 'info', rule: 'attr-removed',
            message: `属性 ${name} 不在白名单内，已移除`,
            blockId: blockIdOf(el),
          })
        }
        el.removeAttribute(attr.name)
      }
    }
  }

  /* 4. 内联样式过滤 */
  for (const el of Array.from(root.querySelectorAll('[style]'))) {
    if (el.tagName.toLowerCase() === 'svg' || el.closest('svg')) continue
    const { style, dropped } = filterStyle(el.getAttribute('style') ?? '')
    if (style) el.setAttribute('style', style)
    else el.removeAttribute('style')
    for (const d of dropped) {
      const id = blockIdOf(el)
      const blockKey = `${id ?? ''}|${d.prop}`
      if (seenDropped.has(blockKey)) continue
      seenDropped.add(blockKey)
      const level = d.prop === 'position' || d.prop.startsWith('animation') || d.prop.startsWith('transition')
        ? 'error' : 'warning'
      diagnostics.push({
        level, rule: 'css-dropped',
        message: `${d.prop} 已移除：${d.reason}`,
        blockId: id, fix: d.prop === 'position' ? 'strip-position' : undefined,
      })
    }
  }

  /* 5. 结构化标记：span[leaf] / section[nodeleaf] */
  markStructure(root, diagnostics, blockIdOf)

  /* 6. 同标签同样式连续嵌套 > 10 层 → 扁平化 */
  flattenDeepNesting(root, diagnostics, blockIdOf)

  /* 7. 图片：补 data-w / 宽度百分比化 */
  root.querySelectorAll('img').forEach((img) => {
    const id = blockIdOf(img)
    if (!img.getAttribute('data-w')) {
      diagnostics.push({
        level: 'warning', rule: 'img-data-w',
        message: '图片缺少 data-w，各端宽度计算可能不稳定',
        blockId: id,
      })
    }
    const w = img.getAttribute('width')
    if (w && /^\d+$/.test(w) && Number(w) > 677) {
      img.setAttribute('width', '100%')
      diagnostics.push({
        level: 'warning', rule: 'img-fixed-width',
        message: '固定像素宽度会触发平台溢出检测，已改为 100%',
        blockId: id, fix: 'percent-width',
      })
    }
  })

  return { html: root.innerHTML, diagnostics }
}

function defaultBlockIdOf(el: Element): string | undefined {
  let cur: Element | null = el
  while (cur) {
    const id = cur.getAttribute?.('data-block-id')
    if (id) return id
    cur = cur.parentElement
  }
  return undefined
}

function hasBlockChild(el: Element): boolean {
  return Array.from(el.children).some((c) => !INLINE_TAGS.has(c.tagName.toLowerCase()))
}

function replaceTag(doc: Document, el: Element, newTag: string): Element {
  const fresh = doc.createElement(newTag)
  for (const attr of Array.from(el.attributes)) fresh.setAttribute(attr.name, attr.value)
  while (el.firstChild) fresh.appendChild(el.firstChild)
  el.replaceWith(fresh)
  return fresh
}

/* ------------------------------------------------------------------ */
/* 结构标记                                                             */
/* ------------------------------------------------------------------ */

/**
 * 官方规范：
 * - 只含文本的叶子节点 → span[leaf]
 * - 所有子节点都是叶子的容器 → section[nodeleaf]
 * - 其余容器 → section[node]
 */
function markStructure(root: Element, diagnostics: Diagnostic[], blockIdOf: (el: Element) => string | undefined): void {
  const visit = (el: Element): boolean => {
    // 返回 true 表示「该节点是叶子（只含文本/行内元素）」
    if (el.closest('svg')) return false
    if (el.tagName.toLowerCase() === 'svg') return false

    const children = Array.from(el.children).filter((c) => !['leaf-marker'].includes(c.tagName.toLowerCase()))
    if (!children.length) {
      if (el.tagName.toLowerCase() === 'span' && !el.hasAttribute('leaf')) el.setAttribute('leaf', '')
      return true
    }
    const allLeaf = children.map(visit).every(Boolean)
    const tag = el.tagName.toLowerCase()
    if (tag === 'section' || tag === 'div' || tag === 'p') {
      el.setAttribute(allLeaf ? 'nodeleaf' : 'node', '')
    }
    return false
  }
  for (const child of Array.from(root.children)) visit(child)
}

/* ------------------------------------------------------------------ */
/* 嵌套扁平化                                                           */
/* ------------------------------------------------------------------ */

function flattenDeepNesting(root: Element, diagnostics: Diagnostic[], blockIdOf: (el: Element) => string | undefined): void {
  const walk = (el: Element, depth: number) => {
    for (const child of Array.from(el.children)) {
      if (child.closest('svg')) continue
      const sameStyle = child.getAttribute('style') === el.getAttribute('style')
      const singleChild = el.children.length === 1
      const newDepth = sameStyle && singleChild ? depth + 1 : 1
      if (newDepth > STRUCTURE_RULES.maxSameStyleNesting) {
        diagnostics.push({
          level: 'error', rule: 'nesting-too-deep',
          message: `同标签同样式的嵌套超过 ${STRUCTURE_RULES.maxSameStyleNesting} 层，平台会自动精简，已提前扁平化`,
          blockId: blockIdOf(el), fix: 'flatten-nesting',
        })
        // 把 child 的样式合并到 el，删除 child，提升孙节点
        const merged = mergeStyles(el.getAttribute('style') ?? '', child.getAttribute('style') ?? '')
        if (merged) el.setAttribute('style', merged)
        while (child.firstChild) el.appendChild(child.firstChild)
        child.remove()
        continue
      }
      walk(child, newDepth)
    }
  }
  walk(root, 0)
}

function mergeStyles(a: string, b: string): string {
  const map = new Map<string, string>()
  for (const d of [...parseStyle(a), ...parseStyle(b)]) map.set(d.prop, d.value)
  return Array.from(map.entries()).map(([p, v]) => `${p}:${v}`).join(';')
}

/* ------------------------------------------------------------------ */
/* 供外部复用的小工具                                                    */
/* ------------------------------------------------------------------ */

/** 把一段富文本 HTML 归一化为「微信安全」的片段（用于粘贴导入） */
export function normalizeRichHtml(input: string): string {
  const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="root">${input}</div></body></html>`)
  const doc = dom.window.document
  const root = doc.getElementById('root')!
  root.querySelectorAll('script,style,iframe,link,meta').forEach((el) => el.remove())
  for (const el of Array.from(root.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (name === 'id' || name === 'class' || name.startsWith('on')) el.removeAttribute(attr.name)
    }
    if (el.hasAttribute('style')) {
      const { style } = filterStyle(el.getAttribute('style') ?? '')
      if (style) el.setAttribute('style', style)
      else el.removeAttribute('style')
    }
  }
  return root.innerHTML
}
