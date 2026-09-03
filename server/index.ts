import express from 'express'
import cors from 'cors'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DATA_DIR, UPLOAD_DIR, OUT_DIR } from './db.js'
import { errorMiddleware, ok, asyncHandler } from './lib/http.js'
import { docsRouter } from './routes/docs.js'
import { assetsRouter } from './routes/assets.js'
import { mediaRouter } from './routes/media.js'
import { compileRouter } from './routes/compile.js'
import { convertRouter } from './routes/convert.js'
import { toolsRouter } from './routes/tools.js'
import { libraryRouter } from './routes/library.js'
import { wechatRouter } from './routes/wechat.js'
import { onlineRouter } from './routes/online.js'
import { THEMES } from '../shared/themes.js'
import { SCHEMA_VERSION } from '../shared/types.js'
import { getHighlighter } from './lib/shiki.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()

app.use(cors())
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

/* 静态资源 */
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d' }))
app.use('/out', express.static(OUT_DIR, { maxAge: '7d' }))

// 生产模式下托管前端构建产物
const distDir = path.resolve(__dirname, '../dist')
app.use(express.static(distDir, { index: false, maxAge: '1h' }))

/* 健康检查 */
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, version: SCHEMA_VERSION, uptime: process.uptime() })
})

app.get('/api/meta', asyncHandler(async (_req, res) => {
  const hl = await getHighlighter()
  return ok(res, {
    themes: THEMES,
    langs: hl.getLoadedLanguages(),
    schemaVersion: SCHEMA_VERSION,
    dataDir: DATA_DIR,
  })
}))

/* 业务路由 */
app.use('/api', docsRouter)
app.use('/api', assetsRouter)
app.use('/api', mediaRouter)
app.use('/api', compileRouter)
app.use('/api', convertRouter)
app.use('/api', toolsRouter)
app.use('/api', libraryRouter)
app.use('/api', wechatRouter)
app.use('/api/online', onlineRouter)

/* SPA fallback（开发模式下交给 Vite） */
app.get(/^\/(?!api|uploads|out).*/, (_req, res, next) => {
  const indexFile = path.join(distDir, 'index.html')
  res.sendFile(indexFile, (err) => { if (err) next() })
})

app.use(errorMiddleware)

const PORT = Number(process.env.PORT ?? 5177)

/** 预热：shiki 首次加载较慢，提前初始化 */
getHighlighter().then(() => console.log('[inkforge] shiki 高亮器就绪'))

app.listen(PORT, () => {
  console.log(`[inkforge] API 已启动: http://localhost:${PORT}`)
  console.log(`[inkforge] 数据目录: ${DATA_DIR}`)
})

export default app
