import { JSDOM } from 'jsdom'
import { marked } from 'marked'
import TurndownService from 'turndown'
// @ts-ignore - 无官方类型
import turndownPluginGfm from 'turndown-plugin-gfm'
import mammoth from 'mammoth'
import ExcelJS from 'exceljs'
import { makeBlock, createId, type Block, type BlockType } from '../../shared/types.js'
import { normalizeRichHtml, filterStyle } from './wechatify.js'

/* ------------------------------------------------------------------ */
/* Markdown → HTML                                                     */
/* ------------------------------------------------------------------ */

marked.setOptions({ gfm: true, breaks: true })

export function markdownToHtml(md: string): string {
  return marked.parse(md ?? '', { async: false }) as string
}

/* ------------------------------------------------------------------ */
/* HTML → Markdown                                                     */
/* ------------------------------------------------------------------ */

function makeTurndown(): TurndownService {
  const td = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    fence: '```',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined',
  })
  td.use(turndownPluginGfm.gfm)
  // 保留 <section>/<span> 的语义：只取内容
  td.addRule('wechatSection', {
    filter: ['section'],
    replacement: (content: string) => `\n\n${content}\n\n`,
  })
  td.addRule('wechatSpan', {
    filter: (node: any) => node.nodeName === 'SPAN',
    replacement: (content: string) => content,
  })
  return td
}

export function htmlToMarkdown(html: string): string {
  return makeTurndown().turndown(html ?? '').replace(/\n{3,}/g, '\n\n').trim()
}

/* ------------------------------------------------------------------ */
/* HTML → BlockIR（粘贴导入 / Word / 网页 / 飞书 归一化）                  */
/* ------------------------------------------------------------------ */

const HEADING_RE = /^h([1-6])$/

function styleAttr(el: Element): Record<string, string> {
  const style = el.getAttribute('style') ?? ''
  const out: Record<string, string> = {}
  for (const part of style.split(';')) {
    const i = part.indexOf(':')
    if (i < 0) continue
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim()
  }
  return out
}

function num(v: string | undefined): number | undefined {
  if (!v) return undefined
  const n = parseFloat(v)
  return isNaN(n) ? undefined : n
}

function blockStyleFrom(el: Element): Block['style'] {
  const s = styleAttr(el)
  return {
    marginTop: num(s['margin-top']) ?? 0,
    marginBottom: num(s['margin-bottom']) ?? 16,
    paddingTop: num(s['padding-top']),
    paddingRight: num(s['padding-right']),
    paddingBottom: num(s['padding-bottom']),
    paddingLeft: num(s['padding-left']),
    background: s['background-color'] || s['background'],
    borderRadius: num(s['border-radius']),
    textAlign: (s['text-align'] as any) ?? undefined,
    color: s['color'],
    fontSize: num(s['font-size']),
    lineHeight: num(s['line-height']),
  }
}

const SKIP = new Set(['script', 'style', 'noscript', 'meta', 'link', 'head'])

/**
 * 任意 HTML → Block 数组。
 * 覆盖：标题 / 段落 / 图片 / 引用 / 列表 / 表格 / 分割线 / 代码块 / 内联 SVG / 视频 iframe。
 * 内联样式会被过滤成微信白名单内的子集，从源头保证「导进来就是干净的」。
 */
export function htmlToBlocks(inputHtml: string): { blocks: Block[]; stats: Record<string, number> } {
  const html = normalizeRichHtml(inputHtml ?? '')
  const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="root">${html}</div></body></html>`)
  const root = dom.window.document.getElementById('root')!
  const blocks: Block[] = []
  const stats: Record<string, number> = {}

  const bump = (k: string) => { stats[k] = (stats[k] ?? 0) + 1 }

  const cleanInline = (el: Element): string => {
    // 过滤内联样式到白名单
    for (const inner of Array.from(el.querySelectorAll('*'))) {
      if (inner.hasAttribute('style')) {
        const { style } = filterStyle(inner.getAttribute('style') ?? '')
        if (style) inner.setAttribute('style', style)
        else inner.removeAttribute('style')
      }
    }
    return el.innerHTML
  }

  const walk = (parent: Element): void => {
    for (const child of Array.from(parent.children)) {
      const tag = child.tagName.toLowerCase()
      if (SKIP.has(tag)) continue
      if (tag === 'svg') {
        blocks.push(makeBlock('svg', { svg: child.outerHTML, bytes: child.outerHTML.length }))
        bump('svg')
        continue
      }

      // 只有一个子容器的包装层 → 下钻
      if ((tag === 'div' || tag === 'section') && child.children.length === 1 && !child.textContent?.trim()) {
        walk(child)
        continue
      }

      const hm = HEADING_RE.exec(tag)
      if (hm) {
        blocks.push(makeBlock('heading', {
          html: cleanInline(child),
          level: Math.min(4, Number(hm[1])) as 1 | 2 | 3 | 4,
          headingStyle: 'plain',
        }, blockStyleFrom(child)))
        bump('heading')
        continue
      }

      switch (tag) {
        case 'p': {
          // 纯图片段落 → image block
          const imgs = Array.from(child.querySelectorAll('img'))
          const textLen = (child.textContent ?? '').trim().length
          if (imgs.length && textLen === 0) {
            for (const img of imgs) {
              blocks.push(makeBlock('image', {
                src: img.getAttribute('src') ?? '',
                alt: img.getAttribute('alt') ?? '',
                naturalWidth: num(img.getAttribute('data-w')) ?? undefined,
              }))
              bump('image')
            }
            break
          }
          if (!textLen && !imgs.length) break
          blocks.push(makeBlock('paragraph', { html: cleanInline(child) }, blockStyleFrom(child)))
          bump('paragraph')
          break
        }
        case 'img': {
          blocks.push(makeBlock('image', {
            src: child.getAttribute('src') ?? '',
            alt: child.getAttribute('alt') ?? '',
            naturalWidth: num(child.getAttribute('data-w')) ?? undefined,
          }))
          bump('image')
          break
        }
        case 'blockquote': {
          blocks.push(makeBlock('quote', { html: cleanInline(child), quoteStyle: 'bar' }, blockStyleFrom(child)))
          bump('quote')
          break
        }
        case 'ul':
        case 'ol': {
          blocks.push(makeBlock('list', {
            html: cleanInline(child),
            ordered: tag === 'ol',
          }, blockStyleFrom(child)))
          bump('list')
          break
        }
        case 'table': {
          const rows: string[][] = []
          for (const tr of Array.from(child.querySelectorAll('tr'))) {
            const cells = Array.from(tr.querySelectorAll('td,th')).map((c) => (c.textContent ?? '').trim())
            if (cells.length) rows.push(cells)
          }
          const firstRowHasTh = !!child.querySelector('tr th')
          if (rows.length) {
            blocks.push(makeBlock('table', {
              header: firstRowHasTh, rows, zebra: false, borderMode: 'all',
            }, blockStyleFrom(child)))
            bump('table')
          }
          break
        }
        case 'hr': {
          blocks.push(makeBlock('divider', { variant: 'solid', width: '100%' }))
          bump('divider')
          break
        }
        case 'pre': {
          const code = child.querySelector('code')
          const langMatch = /(?:lang|language)-([a-z0-9+#-]+)/i.exec(code?.className ?? child.className ?? '')
          blocks.push(makeBlock('code', {
            code: (code ?? child).textContent ?? '',
            lang: langMatch?.[1] ?? 'plaintext',
            theme: 'github-light',
            showLineNumbers: true,
            scroll: true,
          }))
          bump('code')
          break
        }
        case 'figure': {
          walk(child)
          break
        }
        case 'iframe': {
          const src = child.getAttribute('src') ?? ''
          blocks.push(makeBlock('video', { url: src, mode: 'poster', title: '外部视频（需替换为视频号组件）' }))
          bump('video')
          break
        }
        case 'div':
        case 'section': {
          // 含块级子元素 → 下钻；否则当作段落
          const hasBlock = Array.from(child.children).some((c) => ['p', 'div', 'section', 'h1', 'h2', 'h3', 'ul', 'ol', 'table', 'blockquote', 'img'].includes(c.tagName.toLowerCase()))
          if (hasBlock) { walk(child); break }
          const text = (child.textContent ?? '').trim()
          if (!text) { walk(child); break }
          blocks.push(makeBlock('paragraph', { html: cleanInline(child) }, blockStyleFrom(child)))
          bump('paragraph')
          break
        }
        default: {
          const text = (child.textContent ?? '').trim()
          if (!text) { walk(child); break }
          blocks.push(makeBlock('paragraph', { html: cleanInline(child) }, blockStyleFrom(child)))
          bump('paragraph')
        }
      }
    }
  }

  walk(root)

  // 兜底：整段没有任何块级结构 → 作为纯文本段落
  if (!blocks.length) {
    const text = (root.textContent ?? '').trim()
    if (text) blocks.push(makeBlock('paragraph', { html: escapeText(text) }))
  }
  return { blocks, stats }
}

function escapeText(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))
}

/* ------------------------------------------------------------------ */
/* Markdown → BlockIR                                                  */
/* ------------------------------------------------------------------ */

export function markdownToBlocks(md: string): { blocks: Block[]; stats: Record<string, number> } {
  return htmlToBlocks(markdownToHtml(md))
}

/* ------------------------------------------------------------------ */
/* Word / Excel                                                        */
/* ------------------------------------------------------------------ */

export async function docxToHtml(buffer: Buffer): Promise<{ html: string; messages: string[] }> {
  const res = await mammoth.convertToHtml({ buffer })
  return { html: res.value, messages: res.messages.map((m: any) => m.message) }
}

export async function docxToBlocks(buffer: Buffer): Promise<{ blocks: Block[]; stats: Record<string, number>; messages: string[] }> {
  const { html, messages } = await docxToHtml(buffer)
  const { blocks, stats } = htmlToBlocks(html)
  return { blocks, stats, messages }
}

export async function xlsxToTables(buffer: Buffer, sheetName?: string): Promise<{ name: string; rows: string[][] }[]> {
  const wb = new ExcelJS.Workbook()
  await (wb as any).xlsx.load(buffer)
  const out: { name: string; rows: string[][] }[] = []
  wb.worksheets.forEach((ws) => {
    if (sheetName && ws.name !== sheetName) return
    const rows: string[][] = []
    ws.eachRow((row: any) => {
      const cells: string[] = []
      row.eachCell({ includeEmpty: true }, (cell: any) => {
        const v = cell.value
        if (v == null) cells.push('')
        else if (typeof v === 'object' && 'richText' in v) cells.push(v.richText.map((r: any) => r.text).join(''))
        else if (typeof v === 'object' && 'text' in v) cells.push(String(v.text))
        else if (typeof v === 'object' && 'result' in v) cells.push(String(v.result ?? ''))
        else cells.push(String(v))
      })
      rows.push(cells)
    })
    // 去掉尾部全空行
    while (rows.length && rows[rows.length - 1].every((c) => !c.trim())) rows.pop()
    if (rows.length) out.push({ name: ws.name, rows })
  })
  return out
}

/** 从 TSV / CSV 文本解析表格 */
export function delimitedToRows(text: string, delimiter = '\t'): string[][] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length)
    .map((line) => line.split(delimiter).map((c) => c.replace(/^"|"$/g, '').trim()))
}

/* ------------------------------------------------------------------ */
/* BlockIR → Markdown（导出用）                                         */
/* ------------------------------------------------------------------ */

/** 把一段内联富文本 HTML 转成单行 Markdown（用于标题/正文/列表项/引用等） */
function richInline(html: string): string {
  return makeTurndown().turndown(html ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * BlockIR → Markdown（直接遍历块结构，保证分隔线、表格、列表、引用、代码、图片
 * 都能正确往返，而不依赖「先编译成 HTML 再 turndown」——后者会把分隔线（渲染成
 * 空 <section border-top>）和表格（gfm 回退成原始 HTML）弄丢）。
 */
export function blocksToMarkdown(blocks: Block[]): string {
  const out: string[] = []

  const push = (s: string) => { if (s && s.trim()) out.push(s.trimEnd()) }
  const fenceRow = (r: string[]) =>
    '| ' + r.map((c) => (c ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').trim()).join(' | ') + ' |'

  for (const b of blocks) {
    const d: any = b.data ?? {}
    switch (b.type) {
      case 'heading': {
        const lvl = Math.max(1, Math.min(6, Number(d.level) || 2))
        push(`${'#'.repeat(lvl)} ${richInline(d.html ?? '')}`)
        break
      }
      case 'paragraph':
        push(richInline(d.html ?? ''))
        break
      case 'list': {
        const items: string[] = Array.isArray(d.items)
          ? d.items.map((it: any) => (typeof it === 'string' ? it : it.html ?? '')).filter(Boolean)
          : String(d.html ?? '').split(/<\/li>/i)
            .map((s) => s.replace(/^[\s\S]*<li[^>]*>/i, '').trim())
            .filter(Boolean)
        const marker = d.ordered ? '1.' : '-'
        push(items.map((it) => `${marker} ${richInline(it)}`).join('\n'))
        break
      }
      case 'quote':
        push(richInline(d.html ?? '').split('\n').map((l) => `> ${l}`).join('\n'))
        break
      case 'divider': {
        if (d.variant === 'space') break
        if (d.variant === 'symbol') { push(String(d.symbol ?? '• • •')); break }
        push('---')
        break
      }
      case 'code':
        push(`\`\`\`${(d.lang && d.lang !== 'plaintext') ? d.lang : ''}\n${(d.code ?? '').replace(/\n+$/, '')}\n\`\`\``)
        break
      case 'table': {
        const rows: string[][] = Array.isArray(d.rows) ? d.rows : []
        if (rows.length) {
          const head = rows[0]
          const body = rows.slice(1)
          const tbl = [fenceRow(head), fenceRow(head.map(() => '---')), ...body.map(fenceRow)].join('\n')
          push(tbl)
        }
        break
      }
      case 'image': {
        push(`![${d.alt ?? ''}](${d.src ?? ''})`)
        if (d.caption) push(`*${richInline(d.caption)}*`)
        break
      }
      case 'callout':
        push(richInline(d.html ?? ''))
        break
      case 'card':
        if (d.title) push(`**${d.title}**`)
        push(richInline(d.html ?? ''))
        break
      case 'html':
        push(richInline(d.html ?? ''))
        break
      default:
        if (d.html) push(richInline(d.html))
    }
    out.push('') // 块间空行
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
