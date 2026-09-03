import { Router } from 'express'
import { listDocs, getDocRow, upsertDoc, deleteDoc, pushHistory, listHistory, getHistory } from '../db.js'
import { migrateDoc } from '../../shared/types.js'
import { asyncHandler, ok, badRequest, notFound, str } from '../lib/http.js'

export const docsRouter = Router()

docsRouter.get('/docs', asyncHandler(async (_req, res) => {
  return ok(res, { docs: listDocs() })
}))

docsRouter.get('/docs/:id', asyncHandler(async (req, res) => {
  const row = getDocRow(req.params.id)
  if (!row) notFound('文档不存在')
  return ok(res, {
    doc: {
      ...migrateDoc(JSON.parse(row.data)),
      title: row.title,
      meta: JSON.parse(row.meta || '{}'),
    },
  })
}))

docsRouter.post('/docs', asyncHandler(async (req, res) => {
  const doc = migrateDoc(req.body?.doc)
  if (!doc?.id) badRequest('缺少文档内容')
  const title = str(req.body?.title, doc.title)
  const now = Date.now()
  const row = getDocRow(doc.id)
  upsertDoc({
    id: doc.id, title, themeId: doc.themeId, data: JSON.stringify(doc),
    meta: JSON.stringify(doc.meta ?? {}), createdAt: row?.createdAt ?? now, updatedAt: now,
  })
  return ok(res, { id: doc.id, updatedAt: now })
}))

/** 保存并写入历史快照 */
docsRouter.post('/docs/:id/snapshot', asyncHandler(async (req, res) => {
  const doc = migrateDoc(req.body?.doc)
  const now = Date.now()
  const row = getDocRow(doc.id)
  if (row) pushHistory(doc.id, row.data, str(req.body?.label, '自动快照'))
  upsertDoc({
    id: doc.id, title: str(req.body?.title, doc.title), themeId: doc.themeId,
    data: JSON.stringify(doc), meta: JSON.stringify(doc.meta ?? {}),
    createdAt: row?.createdAt ?? now, updatedAt: now,
  })
  return ok(res, { id: doc.id, updatedAt: now })
}))

docsRouter.delete('/docs/:id', asyncHandler(async (req, res) => {
  deleteDoc(req.params.id)
  return ok(res, {})
}))

docsRouter.get('/docs/:id/history', asyncHandler(async (req, res) => {
  return ok(res, { history: listHistory(req.params.id) })
}))

docsRouter.get('/history/:id', asyncHandler(async (req, res) => {
  const snap = getHistory(req.params.id)
  if (!snap) notFound('快照不存在')
  return ok(res, { doc: migrateDoc(JSON.parse(snap)) })
}))
