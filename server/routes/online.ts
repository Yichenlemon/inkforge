import { Router } from 'express'
import { asyncHandler, ok, str, num } from '../lib/http.js'

export const onlineRouter = Router()

const TIMEOUT = 9000
async function getJSON(url: string): Promise<any> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT)
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'InkForge/0.1' } })
    if (!r.ok) throw new Error(`upstream ${r.status}`)
    return await r.json()
  } finally {
    clearTimeout(t)
  }
}
async function getText(url: string): Promise<string> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT)
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'InkForge/0.1' } })
    if (!r.ok) throw new Error(`upstream ${r.status}`)
    return await r.text()
  } finally {
    clearTimeout(t)
  }
}

/* ------------------------------------------------------------------ */
/* 图片：Openverse（CC0，全球免费，免 key）+ Picsum 兜底                  */
/* ------------------------------------------------------------------ */

const OPENVERSRE_URL = 'https://api.openverse.org/v1/images/'

/** 关键词搜索 CC 图片 */
onlineRouter.get('/photos', asyncHandler(async (req, res) => {
  const q = str(req.query.q, 'nature')
  const page = Math.max(1, num(req.query.page, 1))
  const per = Math.min(48, Math.max(1, num(req.query.per, 24)))
  try {
    const data = await getJSON(`${OPENVERSRE_URL}?q=${encodeURIComponent(q)}&page=${page}&page_size=${per}&mature=false`)
    const items = (data.results ?? []).map((r: any) => ({
      id: String(r.id ?? r.url),
      url: r.url,
      thumb: r.thumbnail || r.url,
      title: r.title || '未命名',
      creator: r.creator || '',
      source: r.source || r.provider || '',
      width: r.width || 0,
      height: r.height || 0,
      license: r.license || '',
    }))
    return ok(res, { provider: 'openverse', query: q, page, items })
  } catch {
    return ok(res, { provider: 'openverse', query: q, page, items: [], error: 'unreachable' })
  }
}))

/** 随机优质图（Picsum，必定可达，作为关键词搜索不可用时的兜底） */
onlineRouter.get('/photos/random', asyncHandler(async (req, res) => {
  const seed = str(req.query.seed, 'inkforge') || 'inkforge'
  const count = Math.min(30, Math.max(1, num(req.query.count, 12)))
  const w = num(req.query.w, 900)
  const h = num(req.query.h, 600)
  const items = Array.from({ length: count }, (_, i) => {
    const u = `https://picsum.photos/seed/${encodeURIComponent(seed)}-${i}/${w}/${h}`
    return { id: `${seed}-${i}`, url: u, thumb: u, title: '随机图', creator: 'Picsum', source: 'Lorem Picsum', width: w, height: h, license: 'CC0' }
  })
  return ok(res, { provider: 'picsum', query: seed, items })
}))

/* ------------------------------------------------------------------ */
/* 图标：Iconify（全球图标集，免 key）                                    */
/* ------------------------------------------------------------------ */

onlineRouter.get('/icons', asyncHandler(async (req, res) => {
  const q = str(req.query.q, 'star')
  const limit = Math.min(120, Math.max(1, num(req.query.limit, 60)))
  try {
    const data = await getJSON(`https://api.iconify.design/search?query=${encodeURIComponent(q)}&limit=${limit}`)
    const icons: string[] = (data.icons ?? []).slice(0, limit)
    return ok(res, { provider: 'iconify', query: q, icons })
  } catch {
    return ok(res, { provider: 'iconify', query: q, icons: [], error: 'unreachable' })
  }
}))

/** 取单个图标 SVG（避免浏览器直连 iconify 的 CORS/稳定性问题） */
onlineRouter.get('/icon', asyncHandler(async (req, res) => {
  const name = str(req.query.name)
  if (!name) return ok(res, { svg: '' })
  const color = str(req.query.color)
  const height = num(req.query.height, 48)
  const url = `https://api.iconify.design/${encodeURIComponent(name)}.svg?height=${height}${color ? `&color=${encodeURIComponent(color)}` : ''}`
  try {
    const svg = await getText(url)
    return ok(res, { name, svg })
  } catch {
    return ok(res, { name, svg: '' })
  }
}))
