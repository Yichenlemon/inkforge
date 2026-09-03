import type { Block, Doc, Diagnostic, ThemeTokens } from '../../shared/types.js'
import { getTheme } from '../../shared/themes.js'
import { CONTENT_RULES, STRUCTURE_RULES } from '../../shared/rules.js'
import { renderBlock, type RenderCtx } from './render.js'
import { wechatify } from './wechatify.js'
import { countAnimations } from './svg.js'

export interface CompileOptions {
  /** 关闭全部动效，降级为静态首帧 */
  stripAnimation?: boolean
  /** 画布最大宽度，默认 677（公众号正文实际宽度） */
  maxWidth?: number
  /** 是否套一层全局容器（复制到公众号时需要） */
  wrap?: boolean
}

export interface CompileResult {
  html: string
  diagnostics: Diagnostic[]
  stats: {
    bytes: number
    blocks: number
    animations: number
    images: number
    svgs: number
  }
}

export async function compileDoc(doc: Doc, opts: CompileOptions = {}): Promise<CompileResult> {
  const theme = getTheme(doc.themeId)
  const tokens: ThemeTokens = { ...theme.tokens, ...(doc.tokenOverride ?? {}) }
  const maxWidth = opts.maxWidth ?? 677

  const diagnostics: Diagnostic[] = []
  const ctx: RenderCtx = {
    tokens,
    maxWidth,
    stripAnimation: opts.stripAnimation ?? false,
    diagnostics,
    headingNumber: new Map(),
  }

  const parts: string[] = []
  for (const b of doc.blocks) {
    try {
      parts.push(await renderBlock(b, ctx))
    } catch (e: any) {
      diagnostics.push({
        level: 'error', rule: 'render-failed',
        message: `区块 ${b.type} 渲染失败：${e?.message ?? '未知错误'}`,
        blockId: b.id,
      })
    }
  }

  const raw = parts.join('\n')
  const { html, diagnostics: wxDiagnostics } = wechatify(raw)
  diagnostics.push(...wxDiagnostics)

  let out = html
  if (opts.wrap !== false) {
    const wrapper = [
      `font-size:${tokens.fontSize}px`,
      `color:${tokens.colorText}`,
      `line-height:${tokens.lineHeight}`,
      `letter-spacing:${px(tokens.letterSpacing)}`,
      `background-color:${tokens.colorBg}`,
      'word-break:break-word',
      'padding:0',
    ].join(';')
    out = `<section data-role="outer" data-inkforge="1" style="${wrapper}">${html}</section>`
  }

  const bytes = Buffer.byteLength(out, 'utf8')
  let svgs = 0
  let images = 0
  for (const b of doc.blocks) {
    if (b.type === 'svg' || b.type === 'lottie') svgs++
    if (b.type === 'image') images++
    if (b.type === 'gallery') images += (b.data as any)?.images?.length ?? 0
  }
  const animations = countAnimations(out)

  /* 全局诊断 */
  if (bytes > STRUCTURE_RULES.softMaxBytes) {
    diagnostics.push({
      level: 'warning', rule: 'doc-too-large',
      message: `文章 ${(bytes / 1024).toFixed(0)}KB 超过软上限 ${(STRUCTURE_RULES.softMaxBytes / 1024).toFixed(0)}KB，建议压缩图片或减少内联 SVG`,
    })
  }
  if (svgs > STRUCTURE_RULES.softMaxInlineSvg) {
    diagnostics.push({
      level: 'warning', rule: 'too-many-svg',
      message: `内联 SVG ${svgs} 个，超过建议上限 ${STRUCTURE_RULES.softMaxInlineSvg} 个，可能影响加载`,
    })
  }
  if (animations > 0 && opts.stripAnimation) {
    diagnostics.push({ level: 'info', rule: 'anim-stripped', message: `已移除 ${animations} 处动效（保守发布模式）` })
  }
  if (doc.title.length > CONTENT_RULES.titleMaxChars) {
    diagnostics.push({
      level: 'error', rule: 'title-too-long',
      message: `标题 ${doc.title.length} 字，超过公众号 ${CONTENT_RULES.titleMaxChars} 字上限`,
    })
  }
  if ((doc.meta?.digest?.length ?? 0) > CONTENT_RULES.digestMaxChars) {
    diagnostics.push({
      level: 'warning', rule: 'digest-too-long',
      message: `摘要超过 ${CONTENT_RULES.digestMaxChars} 字，会被截断`,
    })
  }

  return {
    html: out,
    diagnostics: sortDiagnostics(dedupe(diagnostics)),
    stats: { bytes, blocks: doc.blocks.length, animations, images, svgs },
  }
}

const px = (n?: number) => (n == null ? undefined : `${n}px`)

const LEVEL_ORDER: Record<Diagnostic['level'], number> = { error: 0, warning: 1, info: 2 }

function sortDiagnostics(list: Diagnostic[]): Diagnostic[] {
  return list.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level])
}

function dedupe(list: Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>()
  const out: Diagnostic[] = []
  for (const d of list) {
    const key = `${d.level}|${d.rule}|${d.message}|${d.blockId ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(d)
  }
  return out
}

/** 只渲染某几个 block（用于局部预览 / 组件预览） */
export async function compileBlocks(blocks: Block[], themeId = 'clean', opts: CompileOptions = {}): Promise<string> {
  const fakeDoc: Doc = {
    id: 'preview', title: '', themeId, blocks, createdAt: 0, updatedAt: 0,
    schemaVersion: 2, meta: {},
  }
  const res = await compileDoc(fakeDoc, { ...opts, wrap: false })
  return res.html
}
