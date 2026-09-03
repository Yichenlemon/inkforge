import { getSetting, setSetting, getAccount } from '../db.js'
import fs from 'node:fs/promises'

const API = 'https://api.weixin.qq.com/cgi-bin'

export interface WxError { errcode: number; errmsg: string }

/* ------------------------------------------------------------------ */
/* access_token                                                        */
/* ------------------------------------------------------------------ */

interface TokenCache { token: string; expiresAt: number }

async function getTokenCache(appId: string): Promise<TokenCache | null> {
  return getSetting(`wx:token:${appId}`, null)
}

async function setTokenCache(appId: string, c: TokenCache): Promise<void> {
  setSetting(`wx:token:${appId}`, c)
}

/**
 * 获取 access_token（带本地缓存，提前 5 分钟刷新）。
 * 注意：公众号要求固定 IP 白名单，未配置会返回 40164。
 */
export async function getAccessToken(appId: string, appSecret: string): Promise<string> {
  const cached = await getTokenCache(appId)
  if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) return cached.token

  const url = `${API}/token?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}`
  const res = await fetch(url)
  const json = await res.json() as any
  if (json.errcode) throw new Error(`获取 access_token 失败：${json.errcode} ${json.errmsg}`)
  await setTokenCache(appId, { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 7200) * 1000 })
  return json.access_token
}

/* ------------------------------------------------------------------ */
/* 从已保存的公众号文章提取生态组件（小程序 / 视频号）                         */
/* 秀米 / 135 等同行的真实做法：在公众号后台插入组件并保存文章，            */
/* 复制临时文章链接，由编辑器提取其中的 <mp-miniprogram> 元数据回填。       */
/* 注意：本函数只做“读取元数据 + 生成占位卡片 + 规范代码”，                 */
/* 真正的账号关联与渲染仍必须在微信官方编辑器内完成。                       */
/* ------------------------------------------------------------------ */

export interface WechatArticleComponent {
  type: 'miniprogram' | 'channels' | 'unknown'
  appId?: string
  path?: string
  title?: string
  imageUrl?: string
  snippet: string
}

export async function fetchWechatArticle(url: string): Promise<{ ok: boolean; components: WechatArticleComponent[]; error?: string }> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 9000)
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; InkForge/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    if (!res.ok) return { ok: false, components: [], error: `HTTP ${res.status}` }
    const html = await res.text()

    const components: WechatArticleComponent[] = []
    const mpRe = /<mp-miniprogram\b[^>]*>/gi
    let m: RegExpExecArray | null
    while ((m = mpRe.exec(html))) {
      const tag = m[0]
      const g = (k: string) => {
        const r = new RegExp(`data-miniprogram-${k}="([^"]*)"`, 'i').exec(tag)
        return r ? r[1] : undefined
      }
      components.push({
        type: 'miniprogram',
        appId: g('appid'), path: g('path'), title: g('title'), imageUrl: g('imageurl'),
        snippet: tag,
      })
    }
    // 视频号 / 其他微信自定义组件（以 mp-common- 开头）
    const chRe = /<mp-common-[a-z0-9-]+\b[^>]*>/gi
    while ((m = chRe.exec(html))) {
      components.push({ type: 'channels', snippet: m[0] })
    }
    return { ok: true, components }
  } catch (e: any) {
    return { ok: false, components: [], error: String(e?.message ?? e).slice(0, 140) }
  }
}

async function tokenOf(accountId: string): Promise<{ token: string; appId: string }> {
  const acc = getAccount(accountId)
  if (!acc) throw new Error('未找到该公众号账号配置')
  const token = await getAccessToken(acc.appId, acc.appSecret)
  return { token, appId: acc.appId }
}

async function call(apiPath: string, token: string, body?: any): Promise<any> {
  const url = `${API}/${apiPath}?access_token=${encodeURIComponent(token)}`
  const res = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json;charset=utf-8' }, body: JSON.stringify(body) } : {})
  const json = await res.json() as any
  if (json.errcode) throw new Error(`微信接口 ${apiPath} 返回错误：${json.errcode} ${json.errmsg}${errnoHint(json.errcode)}`)
  return json
}

function errnoHint(code: number): string {
  const hints: Record<number, string> = {
    40001: '（access_token 无效，请检查 AppSecret）',
    40164: '（当前 IP 不在公众号白名单，请在「开发 → 基本配置 → IP白名单」中添加）',
    45009: '（接口调用超过限额）',
    48001: '（接口未授权，认证服务号/订阅号权限不同）',
    53404: '（账号未认证，草稿箱等接口需要认证）',
  }
  return hints[code] ? ` ${hints[code]}` : ''
}

/* ------------------------------------------------------------------ */
/* 素材                                                                */
/* ------------------------------------------------------------------ */

/** 上传正文内图片（返回可在正文中直接引用的 url） */
export async function uploadContentImage(accountId: string, filePath: string, filename: string): Promise<string> {
  const { token } = await tokenOf(accountId)
  const buf = await fs.readFile(filePath)
  const form = new FormData()
  form.append('media', new Blob([buf]), filename)
  const res = await fetch(`${API}/media/uploadimg?access_token=${encodeURIComponent(token)}`, { method: 'POST', body: form })
  const json = await res.json() as any
  if (json.errcode) throw new Error(`上传正文图片失败：${json.errcode} ${json.errmsg}`)
  return json.url as string
}

/** 上传永久素材（thumb_media_id 需要这个） */
export async function uploadPermanentMaterial(accountId: string, filePath: string, filename: string, type: 'image' | 'voice' | 'video' | 'thumb' = 'image'): Promise<{ mediaId: string; url?: string }> {
  const { token } = await tokenOf(accountId)
  const buf = await fs.readFile(filePath)
  const form = new FormData()
  form.append('media', new Blob([buf]), filename)
  if (type === 'video') {
    form.append('description', JSON.stringify({ title: filename, introduction: '' }))
  }
  const res = await fetch(`${API}/material/add_material?access_token=${encodeURIComponent(token)}&type=${type}`, { method: 'POST', body: form })
  const json = await res.json() as any
  if (json.errcode) throw new Error(`上传永久素材失败：${json.errcode} ${json.errmsg}`)
  return { mediaId: json.media_id, url: json.url }
}

export async function listMaterials(accountId: string, type = 'image', offset = 0, count = 20): Promise<any> {
  const { token } = await tokenOf(accountId)
  return call('material/batchget_material', token, { type, offset, count })
}

/* ------------------------------------------------------------------ */
/* 草稿箱                                                               */
/* ------------------------------------------------------------------ */

export interface DraftArticle {
  title: string
  author?: string
  digest?: string
  content: string
  content_source_url?: string
  thumb_media_id: string
  need_open_comment?: 0 | 1
  only_fans_can_comment?: 0 | 1
  article_type?: string
}

export async function addDraft(accountId: string, articles: DraftArticle[]): Promise<string> {
  const { token } = await tokenOf(accountId)
  const json = await call('draft/add', token, { articles })
  return json.media_id as string
}

export async function updateDraft(accountId: string, mediaId: string, index: number, article: DraftArticle): Promise<void> {
  const { token } = await tokenOf(accountId)
  await call('draft/update', token, { media_id: mediaId, index, articles: article })
}

export async function getDraft(accountId: string, mediaId: string): Promise<any> {
  const { token } = await tokenOf(accountId)
  return call('draft/get', token, { media_id: mediaId })
}

export async function listDrafts(accountId: string, offset = 0, count = 20): Promise<any> {
  const { token } = await tokenOf(accountId)
  return call('draft/batchget', token, { offset, count, no_content: 1 })
}

export async function deleteDraft(accountId: string, mediaId: string): Promise<void> {
  const { token } = await tokenOf(accountId)
  await call('draft/delete', token, { media_id: mediaId })
}

/* ------------------------------------------------------------------ */
/* 预览 / 群发                                                          */
/* ------------------------------------------------------------------ */

/** 发送给指定微信用户预览（需该用户在公众号的「预览白名单」内） */
export async function sendPreview(accountId: string, mediaId: string, wxName: string): Promise<void> {
  const { token } = await tokenOf(accountId)
  await call('message/mass/preview', token, { media_id: mediaId, touser: wxName, msgtype: 'mpnews' })
}

/* ------------------------------------------------------------------ */
/* 账号自检                                                             */
/* ------------------------------------------------------------------ */

export async function checkAccount(accountId: string): Promise<{ ok: boolean; message: string; info?: any }> {
  try {
    const { token } = await tokenOf(accountId)
    const json = await call('get_current_autoreply_info', token)
    return { ok: true, message: '连接正常', info: json }
  } catch (e: any) {
    return { ok: false, message: e?.message ?? '未知错误' }
  }
}

/** 检测 IP 白名单问题（最常见的失败原因） */
export async function diagnose(accountId: string): Promise<{ ok: boolean; steps: { name: string; ok: boolean; message: string }[] }> {
  const acc = getAccount(accountId)
  const steps: { name: string; ok: boolean; message: string }[] = []
  if (!acc) return { ok: false, steps: [{ name: '账号配置', ok: false, message: '未找到账号' }] }

  steps.push({ name: '账号配置', ok: !!(acc.appId && acc.appSecret), message: acc.appId ? `AppID ${acc.appId.slice(0, 8)}…` : '缺少 AppID/AppSecret' })
  try {
    const token = await getAccessToken(acc.appId, acc.appSecret)
    steps.push({ name: 'access_token', ok: true, message: '获取成功（已本地缓存 2 小时）' })
    try {
      await call('material/batchget_material', token, { type: 'image', offset: 0, count: 1 })
      steps.push({ name: '素材接口', ok: true, message: '可读取素材列表' })
    } catch (e: any) {
      steps.push({ name: '素材接口', ok: false, message: e?.message ?? '' })
    }
    try {
      await call('draft/batchget', token, { offset: 0, count: 1, no_content: 1 })
      steps.push({ name: '草稿箱接口', ok: true, message: '可读写草稿箱' })
    } catch (e: any) {
      steps.push({ name: '草稿箱接口', ok: false, message: e?.message ?? '' })
    }
  } catch (e: any) {
    steps.push({ name: 'access_token', ok: false, message: e?.message ?? '' })
  }
  return { ok: steps.every((s) => s.ok), steps }
}
