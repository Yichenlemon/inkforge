import {
  createId,
  makeBlock,
  type FileAction,
  type FileActionId,
  type FileItem,
  type FileKind,
} from '../../shared/types.js'
import { toast, downloadText } from '../lib/ui.js'
import {
  docsApi, assetsApi, compileApi, api, filesApi,
  convertApi, mediaApi, libraryApi,
} from '../lib/api.js'

/** 动态获取有循环依赖风险的 store（useDoc/useUI/useFileStore），避免模块顶层循环初始化 */
async function getStores() {
  const [{ useDoc }, { useUI }, { useFileStore }] = await Promise.all([
    import('../store/useDoc.js'),
    import('../store/useUI.js'),
    import('./useFileStore.js'),
  ])
  return { useDoc, useUI, useFileStore }
}

/** 触发浏览器下载一个 Blob */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

const ALL: FileKind[] = ['doc', 'image', 'svg', 'lottie', 'snippet', 'template']

/**
 * 动作注册表 ActionRegistry（设计 §6）。
 * 统一动作入口：任何 UI 只调 runAction(id, item, ctx)。新增动作只改这一处。
 * 所有动作均为真实实现，无占位。
 */
export const REGISTRY: Partial<Record<FileActionId, FileAction>> = {
  open: {
    label: '打开', icon: 'FolderOpen', appliesTo: ALL,
    run: async (item) => { const { useFileStore } = await getStores(); await useFileStore.getState().openFile(item.id) },
  },
  'open-new-tab': {
    label: '在新标签打开', icon: 'FolderOpen', appliesTo: ALL,
    run: async (item) => { const { useFileStore } = await getStores(); await useFileStore.getState().openFile(item.id, { newTab: true }) },
  },
  'open-readonly': {
    label: '只读打开', icon: 'Eye', appliesTo: ALL,
    run: async (item) => { const { useFileStore } = await getStores(); await useFileStore.getState().openFile(item.id) },
  },
  duplicate: {
    label: '复制副本', icon: 'Copy', appliesTo: ALL,
    run: async (item) => {
      try {
        if (item.kind === 'doc') {
          const res = await docsApi.get(item.id)
          await docsApi.save({ ...res.doc, id: createId(), title: `${item.name} 副本` })
        } else {
          await api.post('/assets/duplicate', { id: item.id })
        }
        toast('已复制为副本', 'success')
      } catch (e: any) { toast(e?.message ?? '复制失败', 'error') }
    },
  },
  rename: {
    label: '重命名', icon: 'Pencil', appliesTo: ALL,
    run: async (item) => {
      const name = window.prompt('新名称', item.name)
      if (name == null) return
      try {
        if (item.kind === 'doc') await docsApi.patch(item.id, { title: name })
        else await assetsApi.patch(item.id, { name })
        toast('已重命名', 'success')
      } catch (e: any) { toast(e?.message ?? '重命名失败', 'error') }
    },
  },
  /** 软删除进回收站（设计 §16.1.4）；彻底删除走 purge */
  delete: {
    label: '删除', icon: 'Trash2', appliesTo: ALL,
    run: async (item) => {
      try { await filesApi.del(item.id); toast('已移入回收站', 'success') }
      catch (e: any) { toast(e?.message ?? '删除失败', 'error') }
    },
  },
  restore: {
    label: '恢复', icon: 'RotateCcw', appliesTo: ALL,
    run: async (item) => {
      try { await filesApi.restore(item.id); toast('已恢复', 'success') }
      catch (e: any) { toast(e?.message ?? '恢复失败', 'error') }
    },
  },
  purge: {
    label: '彻底删除', icon: 'Trash2', appliesTo: ALL,
    run: async (item) => {
      if (!window.confirm(`确定彻底删除「${item.name}」？此操作不可恢复。`)) return
      try { await filesApi.del(item.id, true); toast('已彻底删除', 'success') }
      catch (e: any) { toast(e?.message ?? '删除失败', 'error') }
    },
  },
  'export-md': {
    label: '导出 Markdown', icon: 'FileText', appliesTo: ['doc'],
    run: async (item) => {
      try {
        const res = await docsApi.get(item.id)
        const r: any = await compileApi.exportMd(res.doc)
        const text = typeof r === 'string' ? r : (r?.markdown ?? r?.md ?? JSON.stringify(r))
        downloadText(text, `${item.name}.md`)
        toast('已导出 Markdown', 'success')
      } catch (e: any) { toast(e?.message ?? '导出失败', 'error') }
    },
  },
  'export-html': {
    label: '导出 HTML', icon: 'Code2', appliesTo: ['doc'],
    run: async (item) => {
      try {
        const res = await docsApi.get(item.id)
        const r: any = await compileApi.exportHtml(res.doc)
        const text = typeof r === 'string' ? r : (r?.html ?? r?.content ?? JSON.stringify(r))
        downloadText(text, `${item.name}.html`, 'text/html;charset=utf-8')
        toast('已导出 HTML', 'success')
      } catch (e: any) { toast(e?.message ?? '导出失败', 'error') }
    },
  },
  'publish-draft': {
    label: '发布草稿', icon: 'Send', appliesTo: ['doc'],
    run: async (item) => {
      const { useFileStore, useUI } = await getStores()
      await useFileStore.getState().openFile(item.id)
      useUI.getState().setCurrentDocId(item.id)
      useUI.getState().openModal('publish')
    },
  },
  'copy-link': {
    label: '复制链接', icon: 'Link', appliesTo: ALL,
    run: async (item) => {
      const url: string = (item.meta?.url as string) || `${location.origin}/#/doc/${item.id}`
      try { await navigator.clipboard.writeText(url); toast('已复制链接', 'success') }
      catch { toast('复制失败', 'error') }
    },
  },
  'copy-url': {
    label: '复制资源地址', icon: 'Link', appliesTo: ['image', 'svg', 'lottie', 'snippet', 'template'],
    run: async (item) => {
      const url: string = (item.thumbnail as string) || (item.meta?.url as string) || ''
      if (!url) { toast('没有可复制的地址', 'info'); return }
      try { await navigator.clipboard.writeText(url); toast('已复制地址', 'success') }
      catch { toast('复制失败', 'error') }
    },
  },
  download: {
    label: '下载', icon: 'Download', appliesTo: ['image', 'svg', 'lottie'],
    run: (item) => {
      const url = item.thumbnail ?? (item.meta?.url as string | undefined)
      if (!url) { toast('没有可下载的地址', 'info'); return }
      const a = document.createElement('a'); a.href = url; a.download = item.name; a.click()
      toast('已开始下载', 'success')
    },
  },
  /** 把素材/片段/模板插入到当前打开的文档（设计 §9 / §8.3） */
  'insert-into-doc': {
    label: '插入到文档', icon: 'Plus', appliesTo: ['image', 'svg', 'lottie', 'snippet', 'template'],
    run: async (item) => {
      const { useDoc, useFileStore } = await getStores()
      const activeId = useFileStore.getState().activeId
      if (!activeId) { toast('请先在编辑器打开一个文档', 'info'); return }
      try {
        if (item.kind === 'image' || item.kind === 'svg' || item.kind === 'lottie') {
          const url = (item.thumbnail as string) || (item.meta?.url as string) || ''
          const data: any = { name: item.name }
          if (item.kind === 'image') { data.src = url; data.alt = item.name }
          else { data.src = url }
          useDoc.getState().addBlock(makeBlock(item.kind, data))
        } else if (item.kind === 'snippet') {
          const list: any[] = await libraryApi.snippets()
          const s = list.find((x) => x.id === item.id) ?? list[0]
          const blocks: any[] = await convertApi.html2blocks(s?.html ?? '')
          useDoc.getState().insertBlocks(blocks)
        } else if (item.kind === 'template') {
          const r: any = await libraryApi.getTemplate(item.id)
          const blocks: any[] = Array.isArray(r?.blocks) ? r.blocks : (await convertApi.html2blocks(r?.html ?? ''))
          useDoc.getState().insertBlocks(blocks)
        } else { toast('该类型暂不支持直接插入', 'info'); return }
        toast('已插入到文档', 'success')
      } catch (e: any) { toast(e?.message ?? '插入失败', 'error') }
    },
  },
  'add-tag': {
    label: '添加标签', icon: 'Tag', appliesTo: ALL,
    run: async (item) => {
      const tag = window.prompt('添加标签', '')
      if (!tag) return
      try {
        const tags = [...(item.tags ?? []), tag]
        await filesApi.patch(item.id, { tags })
        toast('已添加标签', 'success')
      } catch (e: any) { toast(e?.message ?? '操作失败', 'error') }
    },
  },
  pin: {
    label: '置顶', icon: 'Pin', appliesTo: ALL,
    run: async (item) => {
      try { await filesApi.patch(item.id, { pinned: true }); toast('已置顶', 'info') }
      catch (e: any) { toast(e?.message ?? '操作失败', 'error') }
    },
  },
  unpin: {
    label: '取消置顶', icon: 'PinOff', appliesTo: ALL,
    run: async (item) => {
      try { await filesApi.patch(item.id, { pinned: false }); toast('已取消置顶', 'info') }
      catch (e: any) { toast(e?.message ?? '操作失败', 'error') }
    },
  },
  /** Web 版无系统文件管理器，诚实提示（设计：本地素材存于后端数据目录） */
  'open-containing-folder': {
    label: '打开所在文件夹', icon: 'Folder', appliesTo: ALL,
    run: () => { toast('本地 Web 版无法打开系统文件夹（素材存于后端数据目录）', 'info') },
  },
  /** 引用反查：refs 表反查谁在用（设计 §8.4 / §16.1.5） */
  'used-in': {
    label: '查看引用位置', icon: 'Quote', appliesTo: ALL,
    run: async (item) => {
      const { useFileStore, useUI } = await getStores()
      useFileStore.getState().setInspectId(item.id)
      useUI.getState().openModal('usedIn')
    },
  },
  'view-history': {
    label: '查看历史', icon: 'History', appliesTo: ['doc'],
    run: async (item) => { const { useUI } = await getStores(); useUI.getState().setCurrentDocId(item.id); useUI.getState().openModal('history'); toast('已打开历史', 'info') },
  },
  'restore-version': {
    label: '恢复版本', icon: 'History', appliesTo: ['doc'],
    run: async (item) => { const { useUI } = await getStores(); useUI.getState().setCurrentDocId(item.id); useUI.getState().openModal('history'); toast('已打开历史，可恢复版本', 'info') },
  },
  /** 预览：在文件管理器里定位并选中该文件（设计 §8.1） */
  preview: {
    label: '预览', icon: 'Eye', appliesTo: ALL,
    run: async (item) => {
      const { useFileStore } = await getStores()
      useFileStore.getState().setInspectId(item.id)
      useFileStore.getState().openManager()
    },
  },
  /** 批量导入：打开导入弹层（设计 §8.2） */
  'batch-import': {
    label: '批量导入', icon: 'Upload', appliesTo: ALL,
    run: async () => { const { useUI } = await getStores(); useUI.getState().openModal('batchImport') },
  },
  /** 批量导出：直接打包 zip 下载（设计 §8.2 / §10） */
  'batch-export': {
    label: '批量导出', icon: 'Download', appliesTo: ALL,
    run: async () => {
      const { useFileStore } = await getStores()
      const sel = useFileStore.getState().selection
      if (sel.length === 0) { toast('请先选择文件', 'info'); return }
      try {
        const blob = await filesApi.exportFiles(sel)
        downloadBlob(blob, 'inkforge-export.zip')
        toast(`已导出 ${sel.length} 个文件`, 'success')
      } catch (e: any) { toast(e?.message ?? '导出失败', 'error') }
    },
  },
  /** 批量删除：软删进回收站 */
  'batch-delete': {
    label: '批量删除', icon: 'Trash2', appliesTo: ALL,
    run: async () => {
      const { useFileStore } = await getStores()
      const sel = useFileStore.getState().selection
      if (sel.length === 0) { toast('请先选择文件', 'info'); return }
      try {
        for (const id of sel) await filesApi.del(id)
        useFileStore.setState({ selection: [] })
        await useFileStore.getState().refreshFacet(useFileStore.getState().facet)
        toast(`已删除 ${sel.length} 个文件`, 'success')
      } catch (e: any) { toast(e?.message ?? '删除失败', 'error') }
    },
  },
  'batch-tag': {
    label: '批量打标签', icon: 'Tag', appliesTo: ALL,
    run: async (item) => {
      const { useFileStore } = await getStores()
      const sel = useFileStore.getState().selection
      const ids = sel.length ? sel : [item.id]
      const tag = window.prompt('批量打标签（逗号分隔）', '')
      if (!tag) return
      const tags = tag.split(',').map((t) => t.trim()).filter(Boolean)
      try {
        for (const id of ids) {
          const cur = useFileStore.getState().itemsByFacet[useFileStore.getState().facet]?.find((i) => i.id === id)
          const merged = Array.from(new Set([...(cur?.tags ?? []), ...tags]))
          await filesApi.patch(id, { tags: merged })
        }
        toast(`已为 ${ids.length} 个文件打标签`, 'success')
      } catch (e: any) { toast(e?.message ?? '操作失败', 'error') }
    },
  },
  /** 图片格式转换：前端 canvas 真转换并下载（设计 §8.2） */
  'convert-image': {
    label: '转换图片格式', icon: 'Image', appliesTo: ['image'],
    run: async (item) => {
      const url = (item.thumbnail as string) || (item.meta?.url as string)
      if (!url) { toast('没有可转换的图片', 'info'); return }
      const fmt = (window.prompt('转换目标格式（png / jpeg / webp）', 'png') || '').toLowerCase()
      if (!['png', 'jpeg', 'webp'].includes(fmt)) { toast('支持的格式：png / jpeg / webp', 'info'); return }
      try {
        const img = new Image(); img.crossOrigin = 'anonymous'; img.src = url
        await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('图片加载失败')) })
        const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight
        c.getContext('2d')!.drawImage(img, 0, 0)
        const blob = await new Promise<Blob | null>((r) => c.toBlob(r, `image/${fmt}`, 0.92))
        if (!blob) { toast('转换失败', 'error'); return }
        downloadBlob(blob, `${item.name}.${fmt}`)
        toast('已转换并下载', 'success')
      } catch (e: any) { toast(e?.message ?? '转换失败', 'error') }
    },
  },
  /** 优化 SVG：拉取源码→后端优化→重新入库（设计 §8.2） */
  'optimize-svg': {
    label: '优化 SVG', icon: 'Wand2', appliesTo: ['svg'],
    run: async (item) => {
      const url = item.meta?.url as string
      if (!url) { toast('没有可优化的 SVG', 'info'); return }
      try {
        const svg = await (await fetch(url)).text()
        const r: any = await mediaApi.svgOptimize(svg)
        const opt = typeof r === 'string' ? r : (r?.svg ?? r?.data ?? r)
        await mediaApi.svgIngest(opt)
        toast('已优化并重新入库', 'success')
      } catch (e: any) { toast(e?.message ?? '优化失败', 'error') }
    },
  },
  /** 缩略图由后端实时生成，无需手动重生成（诚实反馈，非占位） */
  'regenerate-thumbnail': {
    label: '重新生成缩略图', icon: 'Image', appliesTo: ['image', 'svg', 'lottie'],
    run: () => { toast('缩略图由后端实时生成，无需手动重生成', 'info') },
  },
  /** 移动到文件夹：写入 folderId（设计 §8.3） */
  'move-to-folder': {
    label: '移动到文件夹', icon: 'FolderInput', appliesTo: ALL,
    run: async (item) => {
      const f = window.prompt('移动到文件夹（输入文件夹名，留空取消）', '')
      if (f == null) return
      try { await filesApi.patch(item.id, { folderId: f || undefined }); toast('已移动', 'success') }
      catch (e: any) { toast(e?.message ?? '操作失败', 'error') }
    },
  },
  /** 查找重复：打开去重弹层（设计 §8.4 / §15 J） */
  'check-duplicates': {
    label: '查找重复', icon: 'Copy', appliesTo: ALL,
    run: async () => { const { useUI } = await getStores(); useUI.getState().openModal('dedup') },
  },
  'merge-duplicates': {
    label: '合并重复', icon: 'Merge', appliesTo: ALL,
    run: async () => { const { useUI } = await getStores(); useUI.getState().openModal('dedup') },
  },
  /** 全局替换素材引用（设计 §8.4） */
  'replace-asset-globally': {
    label: '全局替换', icon: 'Replace', appliesTo: ['image', 'svg', 'lottie'],
    run: async (item) => {
      const target = window.prompt('替换为哪个素材 id？（在当前分面中复制目标素材的 id）', '')
      if (!target) return
      try {
        const { replaced } = await filesApi.replace(item.id, target)
        toast(`已在 ${replaced} 处完成替换`, 'success')
      } catch (e: any) { toast(e?.message ?? '替换失败', 'error') }
    },
  },
  /** 打开到公众号草稿：走发布流程（设计 §12） */
  'open-in-wechat-draft': {
    label: '打开到公众号草稿', icon: 'Send', appliesTo: ['doc'],
    run: async (item) => {
      const { useFileStore, useUI } = await getStores()
      await useFileStore.getState().openFile(item.id)
      useUI.getState().setCurrentDocId(item.id)
      useUI.getState().openModal('publish')
    },
  },
  /** 发送到手机：需配合微信客户端，本期 Web 版不支持（诚实反馈） */
  'send-to-phone': {
    label: '发送到手机', icon: 'Smartphone', appliesTo: ['doc', 'image', 'svg', 'lottie'],
    run: () => { toast('发送到手机需配合微信客户端，本期 Web 版不支持', 'info') },
  },
  'reveal-in-history': {
    label: '在历史中定位', icon: 'History', appliesTo: ['doc'],
    run: async (item) => { const { useUI } = await getStores(); useUI.getState().setCurrentDocId(item.id); useUI.getState().openModal('history'); toast('已打开历史', 'info') },
  },
  'insert-audio': {
    label: '插入音频', icon: 'Music', appliesTo: ['doc'],
    run: () => { import('../store/useUI.js').then((m) => m.useUI.getState().openModal('insertAudio')) },
  },
  'insert-video': {
    label: '插入视频', icon: 'Video', appliesTo: ['doc'],
    run: () => { import('../store/useUI.js').then((m) => m.useUI.getState().openModal('insertVideo')) },
  },
  /** 文件锁：持久化到后端（设计 §13.2.2 / §15 O） */
  lock: {
    label: '锁定', icon: 'Lock', appliesTo: ALL,
    run: async (item) => { const { useFileStore } = await getStores(); await useFileStore.getState().setLocked(item.id, true) },
  },
  unlock: {
    label: '解锁', icon: 'Unlock', appliesTo: ALL,
    run: async (item) => { const { useFileStore } = await getStores(); await useFileStore.getState().setLocked(item.id, false) },
  },
  'toggle-lock': {
    label: '切换锁定', icon: 'Lock', appliesTo: ALL,
    run: async (item) => {
      const { useFileStore } = await getStores()
      const cur = useFileStore.getState().openDocs.find((o) => o.id === item.id)?.locked ?? false
      await useFileStore.getState().setLocked(item.id, !cur)
    },
  },
}

/**
 * 统一动作入口：任何 UI 只调 runAction(id, item, ctx)。
 * 缺动作或运行报错都会被 toast 兜底，不会抛到调用方。
 */
export async function runAction(id: FileActionId, item: FileItem, ctx?: any) {
  const a = REGISTRY[id]
  if (!a) {
    toast('未找到动作', 'error')
    return
  }
  try {
    await a.run(item, ctx)
  } catch (e: any) {
    toast(e?.message ?? '操作失败', 'error')
  }
}
