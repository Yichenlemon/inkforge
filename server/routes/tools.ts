import { Router } from 'express'
import { typeset, convertChinese, scanRisks, scanTypos, readability, countText, makeDigest, autoSpacing, toHalfWidth, toFullWidth, avoidOrphan, normalizeQuotes, AD_LAW_WORDS, MEDICAL_WORDS, FINANCE_WORDS } from '../lib/text.js'
import { extractPalette } from '../../shared/themes.js'
import { asyncHandler, ok, badRequest, str, num, bool } from '../lib/http.js'
import { colord } from 'colord'

export const toolsRouter = Router()

toolsRouter.post('/tools/typeset', asyncHandler(async (req, res) => {
  const html = str(req.body?.html)
  if (!html) badRequest('缺少内容')
  return ok(res, typeset(html, {
    autoSpacing: bool(req.body?.autoSpacing),
    halfWidthAlnum: bool(req.body?.halfWidthAlnum),
    dedupePunctuation: bool(req.body?.dedupePunctuation),
    trimSpaces: req.body?.trimSpaces !== false,
    terms: Array.isArray(req.body?.terms) ? req.body.terms : [],
  }))
}))

toolsRouter.post('/tools/spacing', asyncHandler(async (req, res) => {
  return ok(res, { text: autoSpacing(str(req.body?.text)) })
}))

toolsRouter.post('/tools/width', asyncHandler(async (req, res) => {
  const text = str(req.body?.text)
  return ok(res, { text: str(req.body?.mode) === 'full' ? toFullWidth(text) : toHalfWidth(text) })
}))

toolsRouter.post('/tools/orphan', asyncHandler(async (req, res) => {
  return ok(res, { text: avoidOrphan(str(req.body?.text)) })
}))

toolsRouter.post('/tools/case', asyncHandler(async (req, res) => {
  const mode = str(req.body?.mode, 's2t') as any
  return ok(res, { text: convertChinese(str(req.body?.text), mode) })
}))

/** 引号规范化：corner（直角）/ curly（弯引号）/ straight（直引号） */
toolsRouter.post('/tools/quote', asyncHandler(async (req, res) => {
  const html = str(req.body?.html)
  const mode = str(req.body?.mode, 'curly') as 'corner' | 'curly' | 'straight'
  if (!html) badRequest('缺少内容')
  return ok(res, { html: normalizeQuotes(html, mode) })
}))

toolsRouter.post('/tools/check', asyncHandler(async (req, res) => {
  const text = str(req.body?.text)
  return ok(res, {
    risks: scanRisks(text),
    typos: scanTypos(text),
    readability: readability(text),
    count: countText(text),
    digest: makeDigest(text, num(req.body?.digestLength, 100)),
  })
}))

toolsRouter.get('/tools/wordlists', asyncHandler(async (_req, res) => {
  return ok(res, { ad: AD_LAW_WORDS, medical: MEDICAL_WORDS, finance: FINANCE_WORDS })
}))

toolsRouter.post('/tools/palette', asyncHandler(async (req, res) => {
  return ok(res, { tokens: extractPalette(str(req.body?.html)) })
}))

/** 对比度检查（无障碍 / 阅读体验） */
toolsRouter.post('/tools/contrast', asyncHandler(async (req, res) => {
  const fg = str(req.body?.fg, '#333333')
  const bg = str(req.body?.bg, '#ffffff')
  const ratio = contrastRatio(fg, bg)
  return ok(res, {
    ratio: Math.round(ratio * 100) / 100,
    level: ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'AA Large' : 'Fail',
    pass: ratio >= 4.5,
  })
}))

/** 生成和谐的配色方案 */
toolsRouter.post('/tools/color-scheme', asyncHandler(async (req, res) => {
  const base = str(req.body?.base, '#2C6BED')
  const c = colord(base)
  return ok(res, {
    primary: c.toHex(),
    light: c.lighten(0.25).toHex(),
    dark: c.darken(0.2).toHex(),
    accent: c.rotate(150).toHex(),
    complement: c.rotate(180).toHex(),
    analogous: [c.rotate(-30).toHex(), c.rotate(30).toHex()],
    triad: [c.rotate(120).toHex(), c.rotate(240).toHex()],
    neutral: c.grayscale().lighten(0.4).toHex(),
    readable: c.isDark() ? '#ffffff' : '#1a1a1a',
  })
}))

function contrastRatio(fg: string, bg: string): number {
  const l1 = relLuminance(fg)
  const l2 = relLuminance(bg)
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

function relLuminance(color: string): number {
  const { r, g, b } = colord(color).toRgb()
  const f = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
