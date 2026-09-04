import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(__dirname, '..')
export const DATA_DIR = path.join(ROOT, 'data')
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads')
export const OUT_DIR = path.join(DATA_DIR, 'out')

for (const d of [DATA_DIR, UPLOAD_DIR, OUT_DIR]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
}

const DB_PATH = process.env.DB_PATH ?? path.join(DATA_DIR, 'inkforge.db')

export const db = new Database(DB_PATH)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// 旧库兼容：缺列则补列（SQLite 不支持 IF NOT EXISTS for ADD COLUMN）
try { db.exec('ALTER TABLE docs ADD COLUMN lastOpenedAt INTEGER') } catch { /* column exists */ }

db.exec(`
CREATE TABLE IF NOT EXISTS docs (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL DEFAULT '',
  themeId     TEXT NOT NULL DEFAULT 'clean',
  data        TEXT NOT NULL,
  meta        TEXT NOT NULL DEFAULT '{}',
  createdAt   INTEGER NOT NULL,
  updatedAt   INTEGER NOT NULL,
  lastOpenedAt INTEGER
);
CREATE INDEX IF NOT EXISTS idx_docs_updated ON docs(updatedAt DESC);
CREATE INDEX IF NOT EXISTS idx_docs_opened ON docs(lastOpenedAt DESC);

CREATE TABLE IF NOT EXISTS history (
  id        TEXT PRIMARY KEY,
  docId     TEXT NOT NULL,
  snapshot  TEXT NOT NULL,
  label     TEXT DEFAULT '',
  createdAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_history_doc ON history(docId, createdAt DESC);

CREATE TABLE IF NOT EXISTS assets (
  id        TEXT PRIMARY KEY,
  kind      TEXT NOT NULL,
  name      TEXT NOT NULL,
  url       TEXT NOT NULL,
  mime      TEXT NOT NULL DEFAULT '',
  bytes     INTEGER NOT NULL DEFAULT 0,
  width     INTEGER,
  height    INTEGER,
  tags      TEXT NOT NULL DEFAULT '',
  category  TEXT DEFAULT '',
  license   TEXT DEFAULT '',
  createdAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assets_kind ON assets(kind, createdAt DESC);

CREATE TABLE IF NOT EXISTS snippets (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  html      TEXT NOT NULL,
  variables TEXT NOT NULL DEFAULT '',
  createdAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS templates (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  grp       TEXT NOT NULL DEFAULT '自定义',
  themeId   TEXT NOT NULL DEFAULT 'clean',
  blocks    TEXT NOT NULL,
  createdAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  appId     TEXT NOT NULL,
  appSecret TEXT NOT NULL,
  createdAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`)

/* ------------------------------------------------------------------ */
/* 迁移：v1.4.0 文件管理（Stage A）                                       */
/* ------------------------------------------------------------------ */

function hasColumn(table: string, column: string): boolean {
  const rows = db.prepare(`SELECT name FROM pragma_table_info(?)`).all(table) as { name: string }[]
  return rows.some((r) => r.name === column)
}

function addColumn(table: string, col: string, def: string): void {
  if (!hasColumn(table, col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`)
}

// idempotent — safe to re-run
addColumn('docs', 'deletedAt', 'INTEGER')
addColumn('docs', 'folderId', 'TEXT')
addColumn('docs', 'sha256', 'TEXT')
addColumn('docs', 'byteSize', 'INTEGER')
addColumn('assets', 'deletedAt', 'INTEGER')
addColumn('assets', 'folderId', 'TEXT')
addColumn('assets', 'sha256', 'TEXT')
addColumn('assets', 'width', 'INTEGER')
addColumn('assets', 'height', 'INTEGER')
addColumn('assets', 'thumbnail', 'TEXT')
addColumn('assets', 'byteSize', 'INTEGER')

db.exec(`
CREATE TABLE IF NOT EXISTS refs (
  docId      TEXT NOT NULL,
  targetId   TEXT NOT NULL,
  targetKind TEXT DEFAULT '',
  PRIMARY KEY (docId, targetId)
);
CREATE INDEX IF NOT EXISTS idx_docs_deletedAt ON docs(deletedAt);
CREATE INDEX IF NOT EXISTS idx_assets_deletedAt ON assets(deletedAt);
CREATE INDEX IF NOT EXISTS idx_docs_lastOpenedAt ON docs(lastOpenedAt);
CREATE INDEX IF NOT EXISTS idx_assets_sha256 ON assets(sha256);
CREATE INDEX IF NOT EXISTS idx_assets_tag ON assets(tags);
CREATE INDEX IF NOT EXISTS idx_refs_target ON refs(targetId);
`)

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
  'image/svg+xml': 'svg', 'application/json': 'json',
}

function extOf(mime: string, original: string): string {
  return MIME_EXT[mime] ?? (path.extname(original).replace('.', '') || 'bin')
}

function parseJsonSafe(s: any): any {
  if (s == null) return undefined
  if (typeof s !== 'string') return s
  try { return JSON.parse(s) } catch { return undefined }
}

function fileRowToFileItem(row: any, computeRefs = false): any {
  const tags: string[] = typeof row.tags === 'string'
    ? row.tags.split(/[,\s]+/).filter(Boolean)
    : (Array.isArray(row.tags) ? row.tags : [])
  const item: any = {
    id: row.id,
    kind: row.kind,
    name: row.name,
    size: row.size ?? 0,
    mime: row.mime ?? undefined,
    thumbnail: row.thumbnail ?? undefined,
    tags,
    category: row.category ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastOpenedAt: row.lastOpenedAt ?? undefined,
    status: 'saved',
    deletedAt: row.deletedAt ?? undefined,
    pinned: !!row.pinned,
    refs: computeRefs ? getUsedIn(row.id) : [],
    meta: parseJsonSafe(row.meta),
  }
  if (row.width != null || row.height != null) {
    item.width = row.width ?? undefined
    item.height = row.height ?? undefined
    item.meta = { ...(item.meta ?? {}), width: row.width ?? undefined, height: row.height ?? undefined }
  }
  return item
}

export { fileRowToFileItem }

const SORT_MAP: Record<string, string> = {
  name: 'name COLLATE NOCASE ASC',
  size: 'size DESC',
  updatedAt: 'updatedAt DESC',
  lastOpenedAt: 'lastOpenedAt DESC',
}

export interface QueryFilesOpts {
  kind?: string
  q?: string
  sort?: 'name' | 'size' | 'updatedAt' | 'lastOpenedAt'
  filters?: Record<string, any>
  trash?: boolean
  limit?: number
  offset?: number
  minSize?: number
  maxSize?: number
  minDim?: number
  maxDim?: number
  tag?: string
  used?: number
  id?: string
}

/** 统一查询：docs + assets 联合为 FileItem 列表 */
export function queryFiles(opts: QueryFilesOpts = {}): any[] {
  const whereDocs: string[] = []
  const whereAssets: string[] = []
  const params: any[] = []
  const push = (d: string, a: string) => { whereDocs.push(d); whereAssets.push(a) }

  if (opts.trash) push('d.deletedAt IS NOT NULL', 'a.deletedAt IS NOT NULL')
  else push('d.deletedAt IS NULL', 'a.deletedAt IS NULL')

  if (opts.kind && opts.kind !== 'all') {
    if (opts.kind === 'doc') whereAssets.push('0=1')
    else whereDocs.push('0=1')
  }
  if (opts.id) { push('d.id = ?', 'a.id = ?'); params.push(opts.id, opts.id) }
  if (opts.q) { const q = `%${opts.q}%`; push('d.title LIKE ?', 'a.name LIKE ?'); params.push(q, q) }
  if (opts.minSize != null) { push('d.byteSize >= ?', 'a.byteSize >= ?'); params.push(opts.minSize, opts.minSize) }
  if (opts.maxSize != null) { push('d.byteSize <= ?', 'a.byteSize <= ?'); params.push(opts.maxSize, opts.maxSize) }
  if (opts.minDim != null) { whereAssets.push('(a.width*a.height) >= ?'); whereDocs.push('0=1'); params.push(opts.minDim) }
  if (opts.maxDim != null) { whereAssets.push('(a.width*a.height) <= ?'); whereDocs.push('0=1'); params.push(opts.maxDim) }
  if (opts.tag) { whereAssets.push('a.tags LIKE ?'); whereDocs.push('0=1'); params.push(`%${opts.tag}%`) }
  if (opts.used === 0) push('COALESCE(rc.c,0) = 0', 'COALESCE(rc.c,0) = 0')
  else if (opts.used && opts.used > 0) push('COALESCE(rc.c,0) >= 1', 'COALESCE(rc.c,0) >= 1')

  const wd = whereDocs.length ? `WHERE ${whereDocs.join(' AND ')}` : ''
  const wa = whereAssets.length ? `WHERE ${whereAssets.join(' AND ')}` : ''
  const sortKey = SORT_MAP[opts.sort ?? 'updatedAt'] ?? SORT_MAP.updatedAt
  const limit = opts.limit != null ? opts.limit : 200
  const offset = opts.offset ?? 0

  const sql = `
WITH ref_counts AS (SELECT targetId, COUNT(*) c FROM refs GROUP BY targetId)
SELECT d.id, 'doc' AS kind, d.title AS name, NULL AS mime,
       d.byteSize AS size, d.createdAt AS createdAt, d.updatedAt AS updatedAt,
       d.lastOpenedAt AS lastOpenedAt, d.deletedAt AS deletedAt, NULL AS pinned,
       '' AS tags, d.meta AS meta, NULL AS width, NULL AS height, NULL AS thumbnail,
       NULL AS category, COALESCE(rc.c,0) AS usedCount
FROM docs d LEFT JOIN ref_counts rc ON rc.targetId = d.id
${wd}
UNION ALL
SELECT a.id, (CASE WHEN a.kind='gif' THEN 'image' ELSE a.kind END) AS kind, a.name AS name, a.mime AS mime,
       a.byteSize AS size, a.createdAt AS createdAt, a.createdAt AS updatedAt,
       NULL AS lastOpenedAt, a.deletedAt AS deletedAt, NULL AS pinned,
       a.tags AS tags, NULL AS meta, a.width AS width, a.height AS height, a.thumbnail AS thumbnail,
       a.category AS category, COALESCE(rc.c,0) AS usedCount
FROM assets a LEFT JOIN ref_counts rc ON rc.targetId = a.id
${wa}
ORDER BY ${sortKey}
LIMIT ? OFFSET ?`

  params.push(limit, offset)
  const rows = db.prepare(sql).all(...params) as any[]
  const computeRefs = opts.used != null && opts.used > 0
  return rows.map((r) => fileRowToFileItem(r, computeRefs))
}

/** 反向链接：谁在引用 targetId（文档/素材被哪些文档使用） */
export function getUsedIn(targetId: string): { docId: string; docTitle: string }[] {
  return db.prepare(`
    SELECT refs.docId AS docId, docs.title AS docTitle
    FROM refs JOIN docs ON docs.id = refs.docId
    WHERE refs.targetId = ?
    ORDER BY docs.updatedAt DESC
  `).all(targetId) as any
}

export function softDeleteFile(kind: string, id: string): void {
  const table = kind === 'doc' ? 'docs' : 'assets'
  db.prepare(`UPDATE ${table} SET deletedAt = ? WHERE id = ?`).run(Date.now(), id)
}

export function restoreFile(kind: string, id: string): void {
  const table = kind === 'doc' ? 'docs' : 'assets'
  db.prepare(`UPDATE ${table} SET deletedAt = NULL WHERE id = ?`).run(id)
}

export function purgeFile(kind: string, id: string): void {
  if (kind === 'doc') {
    deleteDoc(id)
    db.prepare('DELETE FROM refs WHERE docId = ?').run(id)
    return
  }
  const row = getAsset(id)
  if (!row) return
  db.prepare('DELETE FROM assets WHERE id = ?').run(id)
  db.prepare('DELETE FROM refs WHERE targetId = ?').run(id)
  try {
    const file = path.join(UPLOAD_DIR, path.basename(row.url))
    if (fs.existsSync(file)) fs.unlinkSync(file)
  } catch { /* 文件已不存在 */ }
}

const duplicateDocTxn = db.transaction((srcId: string) => {
  const row = db.prepare('SELECT * FROM docs WHERE id = ?').get(srcId) as any
  if (!row) return null
  const id = `d_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`
  const now = Date.now()
  db.prepare(`INSERT INTO docs (id, title, themeId, data, meta, createdAt, updatedAt, lastOpenedAt, deletedAt, folderId, sha256, byteSize)
    VALUES (@id,@title,@themeId,@data,@meta,@createdAt,@updatedAt, NULL, NULL, NULL, NULL, @byteSize)`).run({
    id,
    title: `${row.title} 副本`,
    themeId: row.themeId,
    data: row.data,
    meta: row.meta,
    createdAt: now,
    updatedAt: now,
    byteSize: row.byteSize ?? null,
  })
  return db.prepare('SELECT * FROM docs WHERE id = ?').get(id) as any
})

/** 原子复制文档（含块数据），返回新 { id, doc } */
export function duplicateDoc(id: string): { id: string; doc: any } {
  const row = duplicateDocTxn(id)
  if (!row) throw new Error('文档不存在')
  return { id: row.id, doc: fileRowToFileItem({ ...row, kind: 'doc', name: row.title, size: row.byteSize, tags: '', meta: row.meta, width: null, height: null, thumbnail: null, category: null, usedCount: 0 }) }
}

/** 生成 240px 缩略图（仅图片类素材），失败返回 null */
export async function getThumb(id: string): Promise<Buffer | null> {
  try {
    const a = getAsset(id)
    if (!a || (a.kind !== 'image' && a.kind !== 'gif')) return null
    const file = path.join(UPLOAD_DIR, path.basename(a.url))
    if (!fs.existsSync(file)) return null
    return await sharp(file).resize(240, 240, { fit: 'inside' }).png().toBuffer()
  } catch { return null }
}

/** 找出所有 sha256 重复的素材组 */
export function dedupFiles(): { sha256: string; ids: string[] }[] {
  const rows = db.prepare(`SELECT sha256, GROUP_CONCAT(id) AS ids FROM assets WHERE sha256 IS NOT NULL GROUP BY sha256 HAVING COUNT(*)>1`).all() as any[]
  return rows.map((r) => ({ sha256: r.sha256, ids: String(r.ids).split(',') }))
}

function replaceInTree(node: any, oldId: string, newId: string, oldUrl: string, newUrl: string): any {
  if (Array.isArray(node)) return node.map((n) => replaceInTree(n, oldId, newId, oldUrl, newUrl))
  if (node && typeof node === 'object') {
    const out: any = {}
    for (const k of Object.keys(node)) {
      const v = node[k]
      if (k === 'assetId' && v === oldId) out[k] = newId
      else if ((k === 'url' || k === 'src') && typeof v === 'string' && v.includes(oldUrl)) out[k] = v.split(oldUrl).join(newUrl)
      else out[k] = replaceInTree(v, oldId, newId, oldUrl, newUrl)
    }
    return out
  }
  return node
}

const replaceAssetTxn = db.transaction((oldId: string, newId: string) => {
  const oldA = getAsset(oldId)
  const newA = getAsset(newId)
  if (!oldA || !newA) return 0
  const oldUrl = oldA.url
  const newUrl = newA.url
  const docs = db.prepare('SELECT * FROM docs').all() as any[]
  let n = 0
  for (const d of docs) {
    let data: any
    try { data = JSON.parse(d.data) } catch { continue }
    const replaced = replaceInTree(data, oldId, newId, oldUrl, newUrl)
    n++
    db.prepare('UPDATE docs SET data = ?, updatedAt = ? WHERE id = ?').run(JSON.stringify(replaced), Date.now(), d.id)
  }
  return n
})

/** 全局替换：把文档里对 oldId 的引用改成 newId（含 url 重写），事务执行 */
export function replaceAsset(oldId: string, newId: string): number {
  return replaceAssetTxn(oldId, newId)
}

function saveBufferLocal(buf: Buffer, ext: string): string {
  const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf)
  return name
}

/** 批量导入素材（Stage A 仅素材；文档导入留待后续分期） */
export async function importFiles(files: { buffer: Buffer; name: string; mime: string }[]): Promise<{ accepted: string[]; rejected: string[] }> {
  const accepted: string[] = []
  const rejected: string[] = []
  for (const f of files) {
    try {
      const mime = f.mime || 'application/octet-stream'
      const ext = extOf(mime, f.name)
      const isImage = /image\//.test(mime) && mime !== 'image/svg+xml'
      const kind = mime === 'image/svg+xml' ? 'svg' : mime === 'application/json' ? 'lottie' : isImage ? 'image' : 'other'
      if (mime.startsWith('text/') || /\.(md|html?|docx?)$/i.test(f.name)) {
        rejected.push(`${f.name}: 暂不支持文档导入（Stage A 仅支持素材）`)
        continue
      }
      const name = saveBufferLocal(f.buffer, ext)
      const id = crypto.randomBytes(6).toString('hex')
      const url = `/uploads/${name}`
      const sha = crypto.createHash('sha256').update(f.buffer).digest('hex')
      let width: number | null = null
      let height: number | null = null
      if (kind === 'image') {
        try { const m = await sharp(f.buffer).metadata(); width = m.width ?? null; height = m.height ?? null } catch { /* ignore */ }
      }
      insertAsset({ id, kind, name: f.name, url, mime, bytes: f.buffer.length, width, height, tags: '', category: '', license: '', createdAt: Date.now(), sha256: sha, byteSize: f.buffer.length })
      accepted.push(id)
    } catch (e: any) {
      rejected.push(`${f.name}: ${e?.message ?? '导入失败'}`)
    }
  }
  return { accepted, rejected }
}

/**
 * 导出选中素材为 zip。archiver 未安装时给出清晰错误（Stage A 未包含该依赖）。
 */
export async function exportFiles(ids: string[], _format: string): Promise<Buffer> {
  const spec = 'archiver'
  let archiverMod: any
  try { archiverMod = await import(spec) } catch { throw new Error('archiver 未安装，无法导出 zip 包（Stage A 未包含该依赖）') }
  const archiver = (archiverMod.default ?? archiverMod) as any
  const archive = archiver('zip', { zlib: { level: 9 } })
  const chunks: Buffer[] = []
  archive.on('data', (c: Buffer) => chunks.push(c))
  const done = new Promise<Buffer>((resolve, reject) => {
    archive.on('end', () => resolve(Buffer.concat(chunks)))
    archive.on('error', reject)
  })
  for (const id of ids) {
    const a = getAsset(id)
    if (!a) continue
    const file = path.join(UPLOAD_DIR, path.basename(a.url))
    if (fs.existsSync(file)) archive.file(file, { name: path.basename(a.url) })
  }
  archive.finalize()
  return done
}

/* ------------------------------------------------------------------ */
/* settings（分组，复用既有 settings 表）                                */
/* ------------------------------------------------------------------ */

const DEFAULT_SETTINGS: Record<string, any> = {
  general: {}, typo: {}, writing: {}, material: {}, export: {}, perf: {}, shortcuts: {}, account: {},
}

export function getSettings(group?: string): any {
  if (group) {
    let v = getSetting(group, undefined)
    if (v === undefined) { v = DEFAULT_SETTINGS[group] ?? {}; setSetting(group, v); return { ...v } }
    return v
  }
  const all: Record<string, any> = {}
  for (const g of Object.keys(DEFAULT_SETTINGS)) all[g] = getSettings(g)
  return all
}

export function updateSettings(group: string, patch: any): any {
  const cur = getSettings(group)
  const merged = { ...cur, ...(patch && typeof patch === 'object' ? patch : {}) }
  setSetting(group, merged)
  return merged
}

export function getWritingSettings(): any { return getSettings('writing') }
export function updateWritingSettings(patch: any): any { return updateSettings('writing', patch) }

/* ------------------------------------------------------------------ */
/* settings                                                            */
/* ------------------------------------------------------------------ */

export function getSetting(key: string, fallback: any = null): any {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  if (!row) return fallback
  try { return JSON.parse(row.value) } catch { return row.value }
}

export function setSetting(key: string, value: any): void {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value))
}

/* ------------------------------------------------------------------ */
/* docs                                                                */
/* ------------------------------------------------------------------ */

export interface DocRow {
  id: string
  title: string
  themeId: string
  data: string
  meta: string
  createdAt: number
  updatedAt: number
}

export function listDocs(): Omit<DocRow, 'data'>[] {
  // 「最近 = 最后活动」：同时按 updatedAt 和 lastOpenedAt 取最大值倒序
  const rows = db.prepare(
    `SELECT id, title, themeId, meta, data, createdAt, updatedAt, lastOpenedAt
     FROM docs
     ORDER BY MAX(COALESCE(lastOpenedAt, 0), updatedAt) DESC`,
  ).all() as (Omit<DocRow, 'data'> & { data: string })[]
  return rows.map((r) => {
    let blockCount = 0
    let wordCount = 0
    try {
      const d = JSON.parse(r.data)
      const blocks: any[] = Array.isArray(d?.blocks) ? d.blocks : []
      blockCount = blocks.length
      for (const b of blocks) {
        const html = String(b?.data?.html ?? b?.data?.code ?? b?.data?.title ?? '')
        wordCount += (html.match(/[\u4e00-\u9fa5]/g) || []).length + (html.match(/[A-Za-z]+/g) || []).length
      }
    } catch {}
    const { data: _d, ...rest } = r
    return { ...rest, blockCount, wordCount }
  })
}

/** 轻量更新 lastOpenedAt（防抖到 setImmediate 即可） */
export function touchDocOpen(id: string): void {
  db.prepare('UPDATE docs SET lastOpenedAt = ? WHERE id = ?').run(Date.now(), id)
}

export function getDocRow(id: string): DocRow | undefined {
  return db.prepare('SELECT * FROM docs WHERE id = ?').get(id) as DocRow | undefined
}

export function upsertDoc(row: DocRow): void {
  db.prepare(`
    INSERT INTO docs (id, title, themeId, data, meta, createdAt, updatedAt)
    VALUES (@id, @title, @themeId, @data, @meta, @createdAt, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title, themeId = excluded.themeId, data = excluded.data,
      meta = excluded.meta, updatedAt = excluded.updatedAt
  `).run(row)
}

export function deleteDoc(id: string): void {
  db.prepare('DELETE FROM docs WHERE id = ?').run(id)
  db.prepare('DELETE FROM history WHERE docId = ?').run(id)
}

export function updateDocMeta(id: string, patch: { title?: string; folderId?: string }): void {
  const cur = getDocRow(id)
  if (!cur) return
  db.prepare('UPDATE docs SET title = ?, folderId = ?, updatedAt = ? WHERE id = ?').run(
    patch.title ?? cur.title,
    patch.folderId !== undefined ? patch.folderId : (cur as any).folderId ?? null,
    Date.now(), id,
  )
}

/* ------------------------------------------------------------------ */
/* history                                                             */
/* ------------------------------------------------------------------ */

export function pushHistory(docId: string, snapshot: string, label = ''): void {
  const id = `${docId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  db.prepare('INSERT INTO history (id, docId, snapshot, label, createdAt) VALUES (?, ?, ?, ?, ?)')
    .run(id, docId, snapshot, label, Date.now())
  // 只保留最近 60 个快照
  db.prepare(`
    DELETE FROM history WHERE docId = ? AND id NOT IN (
      SELECT id FROM history WHERE docId = ? ORDER BY createdAt DESC LIMIT 60
    )
  `).run(docId, docId)
}

export function listHistory(docId: string): { id: string; label: string; createdAt: number }[] {
  return db.prepare('SELECT id, label, createdAt FROM history WHERE docId = ? ORDER BY createdAt DESC LIMIT 60').all(docId) as any
}

export function getHistory(id: string): string | undefined {
  const row = db.prepare('SELECT snapshot FROM history WHERE id = ?').get(id) as { snapshot: string } | undefined
  return row?.snapshot
}

/* ------------------------------------------------------------------ */
/* assets                                                              */
/* ------------------------------------------------------------------ */

export interface AssetRow {
  id: string; kind: string; name: string; url: string; mime: string; bytes: number
  width: number | null; height: number | null; tags: string; category: string; license: string; createdAt: number
  sha256?: string | null; byteSize?: number | null; thumbnail?: string | null; folderId?: string | null; deletedAt?: number | null
}

export function insertAsset(a: AssetRow): void {
  db.prepare(`
    INSERT INTO assets (id, kind, name, url, mime, bytes, width, height, tags, category, license, createdAt, sha256, byteSize, thumbnail, folderId, deletedAt)
    VALUES (@id,@kind,@name,@url,@mime,@bytes,@width,@height,@tags,@category,@license,@createdAt,@sha256,@byteSize,@thumbnail,@folderId,@deletedAt)
  `).run({
    ...a,
    sha256: a.sha256 ?? null,
    byteSize: a.byteSize ?? a.bytes,
    thumbnail: a.thumbnail ?? null,
    folderId: a.folderId ?? null,
    deletedAt: a.deletedAt ?? null,
  })
}

export function listAssets(kind?: string): AssetRow[] {
  if (kind && kind !== 'all') return db.prepare('SELECT * FROM assets WHERE kind = ? ORDER BY createdAt DESC').all(kind) as any
  return db.prepare('SELECT * FROM assets ORDER BY createdAt DESC').all() as any
}

export function getAsset(id: string): AssetRow | undefined {
  return db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as AssetRow | undefined
}

export function deleteAsset(id: string): AssetRow | undefined {
  const row = getAsset(id)
  if (!row) return undefined
  db.prepare('DELETE FROM assets WHERE id = ?').run(id)
  return row
}

export function updateAssetMeta(id: string, patch: { name?: string; tags?: string; category?: string; license?: string; folderId?: string }): void {
  const cur = getAsset(id)
  if (!cur) return
  db.prepare('UPDATE assets SET name=?, tags=?, category=?, license=?, folderId=? WHERE id=?').run(
    patch.name ?? cur.name, patch.tags ?? cur.tags, patch.category ?? cur.category, patch.license ?? cur.license,
    patch.folderId !== undefined ? patch.folderId : (cur as any).folderId ?? null, id,
  )
}

/* ------------------------------------------------------------------ */
/* snippets                                                            */
/* ------------------------------------------------------------------ */

export function listSnippets(): { id: string; name: string; html: string; variables: string; createdAt: number }[] {
  return db.prepare('SELECT * FROM snippets ORDER BY createdAt DESC').all() as any
}

export function insertSnippet(s: { id: string; name: string; html: string; variables: string; createdAt: number }): void {
  db.prepare('INSERT INTO snippets (id,name,html,variables,createdAt) VALUES (@id,@name,@html,@variables,@createdAt)').run(s)
}

export function deleteSnippet(id: string): void {
  db.prepare('DELETE FROM snippets WHERE id = ?').run(id)
}

/* ------------------------------------------------------------------ */
/* templates                                                           */
/* ------------------------------------------------------------------ */

export function listTemplates() {
  return db.prepare('SELECT id,name,grp,themeId,createdAt FROM templates ORDER BY createdAt DESC').all() as any
}

export function getTemplate(id: string) {
  return db.prepare('SELECT * FROM templates WHERE id = ?').get(id) as any
}

export function insertTemplate(t: { id: string; name: string; grp: string; themeId: string; blocks: string; createdAt: number }): void {
  db.prepare('INSERT INTO templates (id,name,grp,themeId,blocks,createdAt) VALUES (@id,@name,@grp,@themeId,@blocks,@createdAt)').run(t)
}

export function deleteTemplate(id: string): void {
  db.prepare('DELETE FROM templates WHERE id = ?').run(id)
}

/* ------------------------------------------------------------------ */
/* accounts                                                            */
/* ------------------------------------------------------------------ */

export function listAccounts() {
  return db.prepare('SELECT id,name,appId,createdAt FROM accounts ORDER BY createdAt DESC').all() as any
}

export function insertAccount(a: { id: string; name: string; appId: string; appSecret: string; createdAt: number }): void {
  db.prepare('INSERT INTO accounts (id,name,appId,appSecret,createdAt) VALUES (@id,@name,@appId,@appSecret,@createdAt)').run(a)
}

export function getAccount(id: string) {
  return db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as any
}

export function deleteAccount(id: string): void {
  db.prepare('DELETE FROM accounts WHERE id = ?').run(id)
}
