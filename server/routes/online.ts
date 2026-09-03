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
  const provider = str(req.query.provider, 'auto') // auto/openverse/pixabay/vvhan/picsum
  const page = Math.max(1, num(req.query.page, 1))
  const per = Math.min(48, Math.max(1, num(req.query.per, 24)))

  // 多源聚合：每个源取 per 张，合并返回
  let sources: { name: string; fetch: () => Promise<any[]> }[] = []

  sources.push({
    name: 'openverse',
    fetch: async () => {
      try {
        const data = await getJSON(`${OPENVERSRE_URL}?q=${encodeURIComponent(q)}&page=${page}&page_size=${Math.ceil(per / 2)}&mature=false`)
        return (data.results ?? []).map((r: any) => ({
          id: `ov-${r.id ?? r.url}`, url: r.url, thumb: r.thumbnail || r.url,
          title: r.title || '未命名', creator: r.creator || '', source: 'Openverse', license: r.license || '',
        }))
      } catch { return [] }
    },
  })

  // 国内免费源：vvhan（按分类聚合，按中文关键词返回随机图）
  sources.push({
    name: 'vvhan',
    fetch: async () => {
      try {
        const data = await getJSON(`https://api.vvhan.com/api/images/category?category=${encodeURIComponent(q)}&num=${Math.ceil(per / 2)}`)
        const list: any[] = Array.isArray(data) ? data : (data?.data ?? [])
        return list.map((u: string, i: number) => ({ id: `vv-${q}-${i}`, url: u, thumb: u, title: q, creator: 'vvhan', source: 'vvhan API', license: 'Free' }))
      } catch { return [] }
    },
  })

  // Bing 国内代理：api.pearktrue.cn 提供按关键词检索的图片列表
  sources.push({
    name: 'pearktrue',
    fetch: async () => {
      try {
        const data = await getJSON(`https://api.pearktrue.cn/api/dailyhot/api.php?num=${Math.ceil(per / 2)}`)
        const list: any[] = Array.isArray(data) ? data : (data?.data ?? [])
        return list.filter((x: any) => typeof x?.imgurl === 'string').map((x: any, i: number) => ({
          id: `pt-${i}-${x.imgurl.slice(-10)}`, url: x.imgurl, thumb: x.imgurl,
          title: x.title || q, creator: x.source || 'pearktrue', source: '每日壁纸', license: 'Free',
        }))
      } catch { return [] }
    },
  })

  // 单源模式：只跑指定源
  if (provider !== 'auto' && provider !== 'picsum') {
    sources = sources.filter((s) => s.name === provider)
  }

  const settled = await Promise.all(sources.map((s) => s.fetch().catch(() => [])))
  const items = settled.flat().slice(0, per)
  const providers = sources.map((s) => s.name)

  if (!items.length) {
    // 兜底：Picsum 随机（必定可达）
    const w = 900, h = 600
    return ok(res, { provider: 'picsum', query: q, page, items: Array.from({ length: 12 }, (_, i) => ({
      id: `picsum-${q}-${i}`, url: `https://picsum.photos/seed/${encodeURIComponent(q)}-${i}/${w}/${h}`, thumb: `https://picsum.photos/seed/${encodeURIComponent(q)}-${i}/${w}/${h}`,
      title: '随机图', creator: 'Lorem Picsum', source: 'Picsum 兜底', width: w, height: h, license: 'CC0',
    })) })
  }
  return ok(res, { provider: providers.join('+'), query: q, page, items })
}))

/** 随机优质图（多源，分类随机：美女/风景/动漫/萌宠/动漫头像 等中文分类） */
onlineRouter.get('/photos/random', asyncHandler(async (req, res) => {
  const seed = str(req.query.seed, 'inkforge') || 'inkforge'
  const cat = str(req.query.cat, '风景')
  const count = Math.min(30, Math.max(1, num(req.query.count, 12)))
  try {
    const data = await getJSON(`https://api.vvhan.com/api/images/category?category=${encodeURIComponent(cat)}&num=${count}`)
    const list: any[] = Array.isArray(data) ? data : (data?.data ?? [])
    const items = list.slice(0, count).map((u: string, i: number) => ({
      id: `vv-rand-${cat}-${i}`, url: u, thumb: u, title: cat, creator: 'vvhan', source: 'vvhan API', license: 'Free',
    }))
    if (items.length) return ok(res, { provider: 'vvhan', category: cat, items })
  } catch { /* fall through */ }
  const w = 900, h = 600
  return ok(res, { provider: 'picsum', items: Array.from({ length: count }, (_, i) => ({
    id: `${seed}-${i}`, url: `https://picsum.photos/seed/${encodeURIComponent(seed)}-${i}/${w}/${h}`, thumb: `https://picsum.photos/seed/${encodeURIComponent(seed)}-${i}/${w}/${h}`,
    title: '随机图', creator: 'Picsum', source: 'Lorem Picsum', width: w, height: h, license: 'CC0',
  })) })
}))

/* ------------------------------------------------------------------ */
/* 图标：中文场景支持                                                   */
/* ------------------------------------------------------------------ */

/** 中文关键词 → Iconify 英文关键词 的映射（覆盖公众号最常用的几十类） */
const ICON_ZH_MAP: Record<string, string> = {
  '房子': 'home', '车': 'car', '爱心': 'heart', '心': 'heart', '星星': 'star', '火': 'fire', '水': 'water',
  '电话': 'phone', '邮件': 'envelope', '位置': 'map-pin', '人': 'user', '用户': 'user', '日历': 'calendar',
  '时钟': 'clock', '天气': 'cloud', '太阳': 'sun', '月亮': 'moon', '书': 'book', '相机': 'camera',
  '图片': 'image', '音乐': 'music', '视频': 'video', '麦克风': 'microphone', '礼物': 'gift',
  '购物': 'shopping-cart', '钱': 'dollar', '搜索': 'search', '设置': 'settings', '文件': 'file',
  '文件夹': 'folder', '链接': 'link', '锁': 'lock', '钥匙': 'key', '标签': 'tag',
  '对勾': 'check', '叉': 'x', '加号': 'plus', '减号': 'minus', '箭头': 'arrow',
  '房子家': 'home', '国旗': 'flag', '点赞': 'thumbs-up', '评论': 'comment', '分享': 'share',
  '微信': 'message', '二维码': 'qr-code', '相机拍照': 'camera', '信息': 'info', '警告': 'alert-triangle',
  '成功': 'check-circle', '失败': 'x-circle', '主页': 'home', '退出': 'log-out', '刷新': 'refresh',
}

onlineRouter.get('/icons', asyncHandler(async (req, res) => {
  const q = str(req.query.q, 'star')
  const limit = Math.min(120, Math.max(1, num(req.query.limit, 60)))
  // 中文关键词翻译后并行检索 Iconify
  const en = ICON_ZH_MAP[q] ?? q
  const candidates = [en, q, 'star', 'home', 'arrow'].filter((x, i, a) => a.indexOf(x) === i)
  try {
    const results = await Promise.all(candidates.map((c) =>
      getJSON(`https://api.iconify.design/search?query=${encodeURIComponent(c)}&limit=${Math.ceil(limit / 2)}`)
        .then((d) => (d?.icons ?? []) as string[])
        .catch(() => [] as string[])
    ))
    const seen = new Set<string>()
    const icons: string[] = []
    for (const arr of results) for (const i of arr) if (!seen.has(i)) { seen.add(i); icons.push(i); if (icons.length >= limit) break }
    return ok(res, { provider: 'iconify', query: q, translated: en, icons })
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
