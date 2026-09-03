import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
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

db.exec(`
CREATE TABLE IF NOT EXISTS docs (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL DEFAULT '',
  themeId     TEXT NOT NULL DEFAULT 'clean',
  data        TEXT NOT NULL,
  meta        TEXT NOT NULL DEFAULT '{}',
  createdAt   INTEGER NOT NULL,
  updatedAt   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_docs_updated ON docs(updatedAt DESC);

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
  const rows = db.prepare('SELECT id, title, themeId, meta, data, createdAt, updatedAt FROM docs ORDER BY updatedAt DESC').all() as (Omit<DocRow, 'data'> & { data: string })[]
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
}

export function insertAsset(a: AssetRow): void {
  db.prepare(`
    INSERT INTO assets (id, kind, name, url, mime, bytes, width, height, tags, category, license, createdAt)
    VALUES (@id,@kind,@name,@url,@mime,@bytes,@width,@height,@tags,@category,@license,@createdAt)
  `).run(a)
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

export function updateAssetMeta(id: string, patch: { name?: string; tags?: string; category?: string; license?: string }): void {
  const cur = getAsset(id)
  if (!cur) return
  db.prepare('UPDATE assets SET name=?, tags=?, category=?, license=? WHERE id=?').run(
    patch.name ?? cur.name, patch.tags ?? cur.tags, patch.category ?? cur.category, patch.license ?? cur.license, id,
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
