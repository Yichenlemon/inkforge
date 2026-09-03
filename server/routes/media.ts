import { Router } from 'express'
import {
  ingestSvg, optimizeSvg, sanitizeSvg, extractElements, compileAnimation, stripAnimation,
  pathLength, samplePath, booleanOp, readGeometry, countAnimations,
} from '../lib/svg.js'
import {
  probeLottie, convertLottie, loadDotLottie, renderFrames, buildFlipbook, lottieToSmil, lottieToGif,
} from '../lib/lottie.js'
import { highlightToWechat, highlightPreview, listLangs, listThemes } from '../lib/shiki.js'
import QRCode from 'qrcode'
import { asyncHandler, ok, badRequest, str, num } from '../lib/http.js'

export const mediaRouter = Router()

/* ------------------------------------------------------------------ */
/* SVG                                                                 */
/* ------------------------------------------------------------------ */

/** 导入：清洗 + 压缩 + 提取元素清单 + 基础度量 */
mediaRouter.post('/svg/ingest', asyncHandler(async (req, res) => {
  const svg = str(req.body?.svg)
  if (!svg.trim()) badRequest('缺少 SVG 内容')
  return ok(res, ingestSvg(svg))
}))

mediaRouter.post('/svg/optimize', asyncHandler(async (req, res) => {
  const svg = str(req.body?.svg)
  if (!svg.trim()) badRequest('缺少 SVG 内容')
  return ok(res, optimizeSvg(svg, { removeViewBox: !!req.body?.removeViewBox }))
}))

mediaRouter.post('/svg/sanitize', asyncHandler(async (req, res) => {
  const svg = str(req.body?.svg)
  if (!svg.trim()) badRequest('缺少 SVG 内容')
  return ok(res, sanitizeSvg(svg, { stripIds: req.body?.stripIds !== false }))
}))

mediaRouter.post('/svg/elements', asyncHandler(async (req, res) => {
  const svg = str(req.body?.svg)
  if (!svg.trim()) badRequest('缺少 SVG 内容')
  return ok(res, { elements: extractElements(svg), geometry: readGeometry(svg), animations: countAnimations(svg) })
}))

/** 动画 IR → SMIL */
mediaRouter.post('/svg/animate', asyncHandler(async (req, res) => {
  const svg = str(req.body?.svg)
  const anim = req.body?.anim
  if (!svg.trim()) badRequest('缺少 SVG 内容')
  if (!anim) badRequest('缺少动画配置')
  return ok(res, compileAnimation(svg, anim))
}))

mediaRouter.post('/svg/strip-animation', asyncHandler(async (req, res) => {
  const svg = str(req.body?.svg)
  if (!svg.trim()) badRequest('缺少 SVG 内容')
  return ok(res, { svg: stripAnimation(svg) })
}))

/** 路径工具 */
mediaRouter.post('/svg/path-info', asyncHandler(async (req, res) => {
  const d = str(req.body?.d)
  if (!d) badRequest('缺少路径 d')
  const length = pathLength(d)
  const points = length ? samplePath(d, num(req.body?.samples, 24)) : []
  return ok(res, { length, points })
}))

mediaRouter.post('/svg/boolean', asyncHandler(async (req, res) => {
  const a = str(req.body?.a)
  const b = str(req.body?.b)
  const op = str(req.body?.op, 'union') as 'union' | 'intersection' | 'difference' | 'xor'
  if (!a || !b) badRequest('缺少路径')
  return ok(res, { d: booleanOp(a, b, op) })
}))

/* ------------------------------------------------------------------ */
/* Lottie                                                              */
/* ------------------------------------------------------------------ */

function parseLottieInput(body: any): any {
  if (body?.json) return body.json
  const text = str(body?.text)
  if (text.trim()) return JSON.parse(text)
  badRequest('缺少 Lottie 数据')
}

mediaRouter.post('/lottie/probe', asyncHandler(async (req, res) => {
  const json = parseLottieInput(req.body)
  return ok(res, { report: probeLottie(json) })
}))

mediaRouter.post('/lottie/convert', asyncHandler(async (req, res) => {
  const json = parseLottieInput(req.body)
  const mode = str(req.body?.mode, 'auto') as any
  const report = probeLottie(json)
  const target = mode === 'auto' ? report.suggested : mode
  const result = await convertLottie(json, target, {
    width: req.body?.width ? num(req.body.width) : undefined,
    loop: req.body?.loop !== false,
    maxFrames: req.body?.maxFrames ? num(req.body.maxFrames) : undefined,
    assets: req.body?.assets,
  })
  return ok(res, { ...result, mode: target, report })
}))

/** 各级别单独导出（便于对比效果与体积） */
mediaRouter.post('/lottie/render', asyncHandler(async (req, res) => {
  const json = parseLottieInput(req.body)
  const level = str(req.body?.level, 'smil')
  if (level === 'smil') return ok(res, lottieToSmil(json))
  if (level === 'frames') {
    const res2 = await renderFrames(json, { maxFrames: req.body?.maxFrames ? num(req.body.maxFrames) : undefined, assets: req.body?.assets })
    return ok(res, { svg: buildFlipbook(res2, { loop: req.body?.loop !== false }), frames: res2.frames.length })
  }
  if (level === 'gif') {
    const gif = await lottieToGif(json, { width: req.body?.width ? num(req.body.width) : 480, maxFrames: req.body?.maxFrames ? num(req.body.maxFrames) : undefined, assets: req.body?.assets })
    const name = `lottie-${Date.now()}.gif`
    const fs = await import('node:fs')
    const path = await import('node:path')
    const { OUT_DIR } = await import('../db.js')
    fs.writeFileSync(path.join(OUT_DIR, name), gif.buffer)
    return ok(res, { gifUrl: `/out/${name}`, frames: gif.frames, bytes: gif.buffer.length })
  }
  badRequest('未知导出级别')
}))

/* ------------------------------------------------------------------ */
/* 代码块                                                               */
/* ------------------------------------------------------------------ */

mediaRouter.post('/code/highlight', asyncHandler(async (req, res) => {
  const code = str(req.body?.code)
  return ok(res, await highlightToWechat(code, {
    lang: str(req.body?.lang, 'plaintext'),
    theme: str(req.body?.theme, 'github-light'),
    showLineNumbers: !!req.body?.showLineNumbers,
    highlight: str(req.body?.highlight),
    diff: !!req.body?.diff,
    scroll: req.body?.scroll !== false,
    title: str(req.body?.title),
    startLine: req.body?.startLine ? num(req.body.startLine) : 1,
  }))
}))

mediaRouter.post('/code/preview', asyncHandler(async (req, res) => {
  return ok(res, { html: await highlightPreview(str(req.body?.code), str(req.body?.lang, 'plaintext'), str(req.body?.theme, 'github-light')) })
}))

mediaRouter.get('/code/langs', asyncHandler(async (_req, res) => ok(res, { langs: listLangs(), themes: listThemes() })))

/* ------------------------------------------------------------------ */
/* 二维码 / 小程序码                                                     */
/* ------------------------------------------------------------------ */

mediaRouter.post('/qrcode', asyncHandler(async (req, res) => {
  const content = str(req.body?.content)
  if (!content) badRequest('缺少编码内容')
  const size = num(req.body?.size, 240)
  const dataUrl = await QRCode.toDataURL(content, {
    width: size * 2, margin: 1, errorCorrectionLevel: 'M',
    color: { dark: str(req.body?.fg, '#000000ff'), light: str(req.body?.bg, '#ffffffff') },
  })
  return ok(res, { dataUrl })
}))

mediaRouter.get('/qrcode/svg', asyncHandler(async (req, res) => {
  const content = str(req.query.content)
  if (!content) badRequest('缺少编码内容')
  const svg = await QRCode.toString(content, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
  res.type('image/svg+xml').send(svg)
  return undefined
}))
