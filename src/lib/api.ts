export const API = '/api'

async function request<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API + path, {
    ...init,
    headers: init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json', ...init?.headers },
  })
  const text = await res.text()
  let json: any
  try { json = JSON.parse(text) } catch { json = { ok: false, message: text.slice(0, 200) } }
  if (!res.ok || json.ok === false) throw new Error(json.message ?? `请求失败 (${res.status})`)
  return json as T
}

export const api = {
  get: <T = any>(p: string) => request<T>(p),
  post: <T = any>(p: string, body?: any) => request<T>(p, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: <T = any>(p: string, body?: any) => request<T>(p, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  del: <T = any>(p: string) => request<T>(p, { method: 'DELETE' }),
  upload: async <T = any>(p: string, file: File | Blob, filename = 'file'): Promise<T> => {
    const fd = new FormData()
    fd.append('file', file, filename)
    const res = await fetch(API + p, { method: 'POST', body: fd })
    // 后端在 multer 等错误时可能吐 HTML / 空响应，先按 text 读再安全 parse，避免上游 SyntaxError
    const text = await res.text()
    let json: any
    try { json = text ? JSON.parse(text) : { ok: false, message: '空响应' } }
    catch { json = { ok: false, message: text.slice(0, 200) || `HTTP ${res.status}` } }
    if (!res.ok || json.ok === false) throw new Error(json.message ?? `上传失败 (HTTP ${res.status})`)
    return json as T
  },
  /** 返回二进制（如导出 zip），不解析 JSON */
  download: async (p: string, body?: any): Promise<Blob> => {
    const res = await fetch(API + p, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    })
    if (!res.ok) throw new Error(`导出失败 (HTTP ${res.status})`)
    return res.blob()
  },
}

/* ------------------------------------------------------------------ */
/* 分组 API                                                             */
/* ------------------------------------------------------------------ */

export const docsApi = {
  list: () => api.get('/docs'),
  get: (id: string) => api.get(`/docs/${id}`),
  save: (doc: any) => api.post('/docs', { doc }),
  snapshot: (doc: any, label?: string) => api.post(`/docs/${doc.id}/snapshot`, { doc, label }),
  remove: (id: string) => api.del(`/docs/${id}`),
  patch: (id: string, body: any) => api.patch(`/docs/${id}`, body),
  history: (id: string) => api.get(`/docs/${id}/history`),
  historyGet: (hid: string) => api.get(`/history/${hid}`),
  /** 文件锁持久化（设计 §13.2.2）：返回 423 表示被他人锁定 */
  lock: (id: string, lock: { locked: boolean; lockedBy?: string }) => api.patch(`/docs/${id}/lock`, lock),
}

export const compileApi = {
  compile: (doc: any, opts: any = {}) => api.post('/compile', { doc, ...opts }),
  blocks: (blocks: any[], themeId: string, opts: any = {}) => api.post('/compile/blocks', { blocks, themeId, ...opts }),
  validate: (doc: any, opts: any = {}) => api.post('/validate', { doc, ...opts }),
  exportHtml: (doc: any, opts: any = {}) => api.post('/export/html', { doc, ...opts }),
  exportMd: (doc: any, opts: any = {}) => api.post('/export/markdown', { doc, ...opts }),
  exportJson: (doc: any) => api.post('/export/json', { doc }),
  exportText: (doc: any, opts: any = {}) => api.post('/export/plaintext', { doc, ...opts }),
}

export const assetsApi = {
  list: (kind = 'all') => api.get(`/assets?kind=${kind}`),
  upload: (file: File) => api.upload('/assets/upload', file, file.name),
  fetchUrl: (url: string) => api.post('/assets/fetch-url', { url }),
  remove: (id: string) => api.del(`/assets/${id}`),
  patch: (id: string, body: any) => api.patch(`/assets/${id}`, body),
  process: (body: any) => api.post('/image/process', body),
  preview: (body: any) => api.post('/image/preview', body),
  gifCheck: (url: string) => api.post('/image/gif-check', { url }),
  gifReduce: (url: string, maxFrames = 300) => api.post('/image/gif-reduce', { url, maxFrames }),
  info: (url: string) => api.post('/image/info', { url }),
  placeholder: (w: number, h: number, color?: string, text?: string) => api.post('/image/placeholder', { width: w, height: h, color, text }),
  batchCompress: (ids: string[], quality = 80, maxWidth = 1080) => api.post('/image/batch-compress', { ids, quality, maxWidth }),
}

export const mediaApi = {
  svgIngest: (svg: string) => api.post('/svg/ingest', { svg }),
  svgOptimize: (svg: string) => api.post('/svg/optimize', { svg }),
  svgElements: (svg: string) => api.post('/svg/elements', { svg }),
  svgAnimate: (svg: string, anim: any) => api.post('/svg/animate', { svg, anim }),
  svgStrip: (svg: string) => api.post('/svg/strip-animation', { svg }),
  pathInfo: (d: string, samples = 24) => api.post('/svg/path-info', { d, samples }),
  boolean: (a: string, b: string, op: string) => api.post('/svg/boolean', { a, b, op }),
  lottieProbe: (json: any) => api.post('/lottie/probe', { json }),
  lottieConvert: (json: any, mode = 'auto', opts: any = {}) => api.post('/lottie/convert', { json, mode, ...opts }),
  lottieRender: (json: any, level: string, opts: any = {}) => api.post('/lottie/render', { json, level, ...opts }),
  highlight: (body: any) => api.post('/code/highlight', body),
  highlightPreview: (code: string, lang: string, theme: string) => api.post('/code/preview', { code, lang, theme }),
  codeMeta: () => api.get('/code/langs'),
  qrcode: (content: string, size = 240, fg?: string, bg?: string) => api.post('/qrcode', { content, size, fg, bg }),
}

export const convertApi = {
  md2html: (md: string) => api.post('/convert/md2html', { md }),
  html2md: (html: string) => api.post('/convert/html2md', { html }),
  html2blocks: (html: string) => api.post('/convert/html2blocks', { html }),
  md2blocks: (md: string) => api.post('/convert/md2blocks', { md }),
  blocks2md: (blocks: any[], themeId: string) => api.post('/convert/blocks2md', { blocks, themeId }),
  docx: (file: File) => api.upload('/convert/docx', file, file.name),
  xlsx: (file: File) => api.upload('/convert/xlsx', file, file.name),
  tsv: (text: string, delimiter = '\t') => api.post('/convert/tsv', { text, delimiter }),
}

export const toolsApi = {
  typeset: (html: string, opts: any) => api.post('/tools/typeset', { html, ...opts }),
  check: (text: string, digestLength = 100) => api.post('/tools/check', { text, digestLength }),
  case: (text: string, mode: string) => api.post('/tools/case', { text, mode }),
  quote: (html: string, mode: string) => api.post('/tools/quote', { html, mode }),
  spacing: (text: string) => api.post('/tools/spacing', { text }),
  width: (text: string, mode: string) => api.post('/tools/width', { text, mode }),
  orphan: (text: string) => api.post('/tools/orphan', { text }),
  palette: (html: string) => api.post('/tools/palette', { html }),
  contrast: (fg: string, bg: string) => api.post('/tools/contrast', { fg, bg }),
  colorScheme: (base: string) => api.post('/tools/color-scheme', { base }),
  wordlists: () => api.get('/tools/wordlists'),
}

export const libraryApi = {
  snippets: () => api.get('/snippets'),
  addSnippet: (name: string, html: string) => api.post('/snippets', { name, html }),
  renderSnippet: (html: string, vars: Record<string, string>) => api.post('/snippets/render', { html, vars }),
  delSnippet: (id: string) => api.del(`/snippets/${id}`),
  templates: () => api.get('/templates'),
  addTemplate: (name: string, group: string, themeId: string, blocks: any[]) => api.post('/templates', { name, group, themeId, blocks }),
  getTemplate: (id: string) => api.get(`/templates/${id}`),
  delTemplate: (id: string) => api.del(`/templates/${id}`),
  accounts: () => api.get('/accounts'),
  addAccount: (name: string, appId: string, appSecret: string) => api.post('/accounts', { name, appId, appSecret }),
  updateAccount: (id: string, patch: { name?: string; appId?: string; appSecret?: string }) => api.patch(`/accounts/${id}`, patch),
  delAccount: (id: string) => api.del(`/accounts/${id}`),
}


export const wechatApi = {
  diagnose: (accountId: string) => api.post('/wechat/diagnose', { accountId }),
  check: (accountId: string) => api.post('/wechat/check', { accountId }),
  materials: (accountId: string, type = 'image', offset = 0, count = 20) =>
    api.get(`/wechat/materials?accountId=${accountId}&type=${type}&offset=${offset}&count=${count}`),
  uploadThumb: (accountId: string, assetId: string) => api.post('/wechat/upload-thumb', { accountId, assetId }),
  uploadImages: (accountId: string, urls: string[]) => api.post('/wechat/upload-images', { accountId, urls }),
  draft: (payload: any) => api.post('/wechat/draft', payload),
  draftUpdate: (payload: any) => api.post('/wechat/draft/update', payload),
  drafts: (accountId: string) => api.get(`/wechat/drafts?accountId=${accountId}`),
  draftGet: (accountId: string, mediaId: string) => api.get(`/wechat/draft/${mediaId}?accountId=${accountId}`),
  draftDelete: (accountId: string, mediaId: string) => api.del(`/wechat/draft/${mediaId}?accountId=${accountId}`),
  preview: (accountId: string, mediaId: string, wxName: string) => api.post('/wechat/preview', { accountId, mediaId, wxName }),
  fetchArticle: (url: string) => api.post('/wechat/fetch-article', { url }),
}

export const metaApi = {
  get: () => api.get('/meta'),
}

/** 统一文件查询 / 管理（文件管理模块 Stage A 后端提供，前端做容错） */
export const filesApi = {
  list: (facet = 'all', q = '') => api.get(`/files?facet=${encodeURIComponent(facet)}&q=${encodeURIComponent(q)}`),
  get: (id: string) => api.get(`/files/${id}`),
  patch: (id: string, body: any) => api.patch(`/files/${id}`, body),
  /** 删除：purge=true 物理删除，否则软删（进回收站） */
  del: (id: string, purge = false) => api.del(`/files/${id}${purge ? '?purge=1' : ''}`),
  /** 从回收站恢复（POST /files/:id/restore） */
  restore: (id: string) => api.post(`/files/${id}/restore`),
  import: (file: File, meta: any = {}) => api.upload('/files/import', file, file.name),
  importUrls: (urls: string[]) => api.post('/files/import-urls', { urls }),
  /** 导出选中为 zip（返回 Blob） */
  exportFiles: (ids: string[], format = 'zip') => api.download('/files/export', { ids, format }),
  /** 去重扫描（按 sha256） */
  dedup: () => api.post('/files/dedup'),
  /** 全局替换素材引用（事务） */
  replace: (oldId: string, newId: string) => api.post(`/files/${oldId}/replace`, { newId }),
  /** 反查谁在引用（refs 表） */
  usedIn: (id: string) => api.get(`/files/${id}/used-in`),
  /** 缩略图（PNG） */
  thumb: (id: string) => api.get(`/files/${id}/thumb`),
}

export const onlineApi = {
  photos: (q: string, page = 1, per = 24, provider = 'auto') =>
    api.get(`/online/photos?q=${encodeURIComponent(q)}&page=${page}&per=${per}&provider=${provider}`),
  randomPhotos: (seed: string, count = 12, cat = '') =>
    api.get(`/online/photos/random?seed=${encodeURIComponent(seed)}&count=${count}${cat ? `&cat=${encodeURIComponent(cat)}` : ''}`),
  icons: (q: string, limit = 60) =>
    api.get(`/online/icons?q=${encodeURIComponent(q)}&limit=${limit}`),
  iconSvg: (name: string, color?: string, height = 48) =>
    api.get(`/online/icon?name=${encodeURIComponent(name)}${color ? `&color=${encodeURIComponent(color)}` : ''}&height=${height}`),
}
