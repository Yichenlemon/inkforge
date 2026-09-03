import { Router } from 'express'
import multer from 'multer'
import path from 'node:path'
import fs from 'node:fs'
import {
  diagnose, checkAccount, addDraft, updateDraft, getDraft, listDrafts, deleteDraft,
  listMaterials, uploadContentImage, uploadPermanentMaterial, sendPreview,
  fetchWechatArticle,
} from '../lib/wechat.js'
import { UPLOAD_DIR, getAsset } from '../db.js'
import { compileDoc } from '../lib/compile.js'
import { migrateDoc } from '../../shared/types.js'
import { asyncHandler, ok, badRequest, notFound, str, bool } from '../lib/http.js'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })

export const wechatRouter = Router()

/* ------------------------------------------------------------------ */
/* 账号自检                                                             */
/* ------------------------------------------------------------------ */

wechatRouter.post('/wechat/diagnose', asyncHandler(async (req, res) => {
  const accountId = str(req.body?.accountId)
  if (!accountId) badRequest('缺少 accountId')
  return ok(res, await diagnose(accountId))
}))

wechatRouter.post('/wechat/check', asyncHandler(async (req, res) => {
  const accountId = str(req.body?.accountId)
  if (!accountId) badRequest('缺少 accountId')
  return ok(res, await checkAccount(accountId))
}))

/** 从已保存的公众号文章链接提取微信生态组件元数据（小程序 / 视频号） */
wechatRouter.post('/wechat/fetch-article', asyncHandler(async (req, res) => {
  const url = str(req.body?.url)
  if (!url) badRequest('缺少文章链接')
  return ok(res, await fetchWechatArticle(url))
}))

/* ------------------------------------------------------------------ */
/* 素材                                                                 */
/* ------------------------------------------------------------------ */

wechatRouter.get('/wechat/materials', asyncHandler(async (req, res) => {
  const accountId = str(req.query.accountId)
  if (!accountId) badRequest('缺少 accountId')
  return ok(res, await listMaterials(accountId, str(req.query.type, 'image'), Number(req.query.offset ?? 0), Number(req.query.count ?? 20)))
}))

/** 上传封面（thumb），返回 thumb_media_id */
wechatRouter.post('/wechat/upload-thumb', asyncHandler(async (req, res) => {
  const accountId = str(req.body?.accountId)
  const assetId = str(req.body?.assetId)
  if (!accountId || !assetId) badRequest('缺少 accountId 或 assetId')
  const asset = getAsset(assetId)
  if (!asset) notFound('素材不存在')
  const file = path.join(UPLOAD_DIR, path.basename(asset.url))
  const r = await uploadPermanentMaterial(accountId, file, asset.name || 'cover.png', 'thumb')
  return ok(res, r)
}))

/** 把正文里的本地图片全部上传到微信，返回 url 映射 */
wechatRouter.post('/wechat/upload-images', asyncHandler(async (req, res) => {
  const accountId = str(req.body?.accountId)
  const urls: string[] = Array.isArray(req.body?.urls) ? req.body.urls : []
  if (!accountId) badRequest('缺少 accountId')
  const map: Record<string, string> = {}
  const errors: { url: string; message: string }[] = []
  for (const u of urls) {
    if (!u.startsWith('/uploads/')) continue
    const file = path.join(UPLOAD_DIR, path.basename(u))
    if (!fs.existsSync(file)) { errors.push({ url: u, message: '本地文件不存在' }); continue }
    try {
      map[u] = await uploadContentImage(accountId, file, path.basename(u))
    } catch (e: any) {
      errors.push({ url: u, message: e?.message ?? '上传失败' })
    }
  }
  return ok(res, { map, errors })
}))

/* ------------------------------------------------------------------ */
/* 草稿箱                                                               */
/* ------------------------------------------------------------------ */

/**
 * 推送到草稿箱。
 * 会先把正文里的本地图片上传并替换链接（微信正文不接受外链图片）。
 */
wechatRouter.post('/wechat/draft', asyncHandler(async (req, res) => {
  const accountId = str(req.body?.accountId)
  if (!accountId) badRequest('缺少 accountId')
  const doc = migrateDoc(req.body?.doc)
  const thumbMediaId = str(req.body?.thumbMediaId)
  if (!thumbMediaId) badRequest('缺少封面 thumbMediaId')

  const compiled = await compileDoc(doc, { stripAnimation: bool(req.body?.stripAnimation) })
  let content = compiled.html

  // 正文图片本地化 → 上传
  const localUrls = Array.from(new Set(Array.from(content.matchAll(/src="(\/uploads\/[^"]+)"/g)).map((m) => m[1])))
  if (localUrls.length) {
    const map: Record<string, string> = {}
    for (const u of localUrls) {
      const file = path.join(UPLOAD_DIR, path.basename(u))
      if (!fs.existsSync(file)) continue
      try { map[u] = await uploadContentImage(accountId, file, path.basename(u)) } catch { /* 忽略单张失败 */ }
    }
    for (const [from, to] of Object.entries(map)) content = content.split(from).join(to)
  }

  const mediaId = await addDraft(accountId, [{
    title: str(req.body?.title, doc.title),
    author: str(req.body?.author, doc.meta?.author),
    digest: str(req.body?.digest, doc.meta?.digest),
    content,
    content_source_url: str(req.body?.sourceUrl, doc.meta?.sourceUrl),
    thumb_media_id: thumbMediaId,
    need_open_comment: bool(req.body?.needOpenComment) ? 1 : 0,
    only_fans_can_comment: bool(req.body?.onlyFansCanComment) ? 1 : 0,
  }])

  return ok(res, { mediaId, diagnostics: compiled.diagnostics, stats: compiled.stats, uploaded: localUrls.length })
}))

wechatRouter.post('/wechat/draft/update', asyncHandler(async (req, res) => {
  const accountId = str(req.body?.accountId)
  const mediaId = str(req.body?.mediaId)
  if (!accountId || !mediaId) badRequest('缺少参数')
  const doc = migrateDoc(req.body?.doc)
  const compiled = await compileDoc(doc, { stripAnimation: bool(req.body?.stripAnimation) })
  await updateDraft(accountId, mediaId, Number(req.body?.index ?? 0), {
    title: str(req.body?.title, doc.title),
    author: str(req.body?.author, doc.meta?.author),
    digest: str(req.body?.digest, doc.meta?.digest),
    content: compiled.html,
    content_source_url: str(req.body?.sourceUrl, doc.meta?.sourceUrl),
    thumb_media_id: str(req.body?.thumbMediaId),
  })
  return ok(res, { mediaId })
}))

wechatRouter.get('/wechat/drafts', asyncHandler(async (req, res) => {
  const accountId = str(req.query.accountId)
  if (!accountId) badRequest('缺少 accountId')
  return ok(res, await listDrafts(accountId, Number(req.query.offset ?? 0), Number(req.query.count ?? 20)))
}))

wechatRouter.get('/wechat/draft/:mediaId', asyncHandler(async (req, res) => {
  const accountId = str(req.query.accountId)
  if (!accountId) badRequest('缺少 accountId')
  return ok(res, await getDraft(accountId, req.params.mediaId))
}))

wechatRouter.delete('/wechat/draft/:mediaId', asyncHandler(async (req, res) => {
  const accountId = str(req.query.accountId)
  if (!accountId) badRequest('缺少 accountId')
  await deleteDraft(accountId, req.params.mediaId)
  return ok(res, {})
}))

wechatRouter.post('/wechat/preview', asyncHandler(async (req, res) => {
  const accountId = str(req.body?.accountId)
  const mediaId = str(req.body?.mediaId)
  const wxName = str(req.body?.wxName)
  if (!accountId || !mediaId || !wxName) badRequest('缺少参数')
  await sendPreview(accountId, mediaId, wxName)
  return ok(res, {})
}))
