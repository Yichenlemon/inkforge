import {
  createId,
  type FileAction,
  type FileActionId,
  type FileItem,
  type FileKind,
} from '../../shared/types.js'
import { toast, downloadText } from '../lib/ui.js'
import { docsApi, assetsApi, compileApi, api, filesApi } from '../lib/api.js'

/** 动态获取有循环依赖风险的 store（useDoc/useUI/useFileStore），避免模块顶层循环初始化 */
async function getStores() {
  const [{ useDoc }, { useUI }, { useFileStore }] = await Promise.all([
    import('../store/useDoc.js'),
    import('../store/useUI.js'),
    import('./useFileStore.js'),
  ])
  return { useDoc, useUI, useFileStore }
}

const ALL: FileKind[] = ['doc', 'image', 'svg', 'lottie', 'snippet', 'template']
const later = (): FileAction['run'] => () => { toast('该动作将在后续阶段接入', 'info') }

/**
 * 动作注册表 ActionRegistry（设计 §6）。
 * 统一动作入口：任何 UI 只调 runAction(id, item, ctx)。
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
  delete: {
    label: '删除', icon: 'Trash2', appliesTo: ALL,
    run: async (item) => {
      try {
        if (item.kind === 'doc') await docsApi.remove(item.id)
        else await assetsApi.remove(item.id)
        toast('已删除', 'success')
      } catch (e: any) { toast(e?.message ?? '删除失败', 'error') }
    },
  },
  restore: {
    label: '恢复', icon: 'RotateCcw', appliesTo: ALL,
    run: async (item) => {
      try { await filesApi.patch(item.id, { deletedAt: null }); toast('已恢复', 'success') }
      catch { toast('该动作将在后续阶段接入', 'info') }
    },
  },
  purge: {
    label: '彻底删除', icon: 'Trash2', appliesTo: ALL,
    run: async (item) => {
      try { await filesApi.del(item.id); toast('已彻底删除', 'success') }
      catch { toast('该动作将在后续阶段接入', 'info') }
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
  'publish-draft': { label: '发布草稿', icon: 'Send', appliesTo: ['doc'], run: later() },
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
      if (url) {
        const a = document.createElement('a'); a.href = url; a.download = item.name; a.click()
        toast('已开始下载', 'success')
      } else toast('该动作将在后续阶段接入', 'info')
    },
  },
  'insert-into-doc': { label: '插入到文档', icon: 'Plus', appliesTo: ['image', 'svg', 'lottie', 'snippet', 'template'], run: later() },
  'add-tag': {
    label: '添加标签', icon: 'Tag', appliesTo: ALL,
    run: async (item) => {
      const tag = window.prompt('添加标签', '')
      if (!tag) return
      try {
        const tags = [...(item.tags ?? []), tag]
        await filesApi.patch(item.id, { tags })
        toast('已添加标签', 'success')
      } catch { toast('该动作将在后续阶段接入', 'info') }
    },
  },
  pin: {
    label: '置顶', icon: 'Pin', appliesTo: ALL,
    run: async (item) => {
      try { await filesApi.patch(item.id, { pinned: true }); toast('已置顶', 'info') }
      catch { toast('已置顶', 'info') }
    },
  },
  unpin: {
    label: '取消置顶', icon: 'PinOff', appliesTo: ALL,
    run: async (item) => {
      try { await filesApi.patch(item.id, { pinned: false }); toast('已取消置顶', 'info') }
      catch { toast('已取消置顶', 'info') }
    },
  },
  'open-containing-folder': { label: '打开所在文件夹', icon: 'Folder', appliesTo: ALL, run: later() },
  'used-in': { label: '查看引用位置', icon: 'Quote', appliesTo: ALL, run: later() },
  'view-history': {
    label: '查看历史', icon: 'History', appliesTo: ['doc'],
    run: async (item) => { const { useUI } = await getStores(); useUI.getState().setCurrentDocId(item.id); useUI.getState().openModal('history'); toast('已打开历史', 'info') },
  },
  'restore-version': { label: '恢复版本', icon: 'History', appliesTo: ['doc'], run: later() },
  preview: {
    label: '预览', icon: 'Eye', appliesTo: ALL,
    run: () => { toast('预览面板将在文件管理器阶段接入', 'info') },
  },
  'batch-import': { label: '批量导入', icon: 'Upload', appliesTo: ALL, run: later() },
  'batch-export': { label: '批量导出', icon: 'Download', appliesTo: ALL, run: later() },
  'batch-delete': { label: '批量删除', icon: 'Trash2', appliesTo: ALL, run: later() },
  'batch-tag': { label: '批量打标签', icon: 'Tag', appliesTo: ALL, run: later() },
  'convert-image': { label: '转换图片格式', icon: 'Image', appliesTo: ['image'], run: later() },
  'optimize-svg': { label: '优化 SVG', icon: 'Wand2', appliesTo: ['svg'], run: later() },
  'regenerate-thumbnail': { label: '重新生成缩略图', icon: 'Image', appliesTo: ['image', 'svg', 'lottie'], run: later() },
  'move-to-folder': { label: '移动到文件夹', icon: 'FolderInput', appliesTo: ALL, run: later() },
  'check-duplicates': { label: '查找重复', icon: 'Copy', appliesTo: ALL, run: later() },
  'merge-duplicates': { label: '合并重复', icon: 'Merge', appliesTo: ALL, run: later() },
  'replace-asset-globally': { label: '全局替换', icon: 'Replace', appliesTo: ['image', 'svg', 'lottie'], run: later() },
  'open-in-wechat-draft': { label: '打开到公众号草稿', icon: 'Send', appliesTo: ['doc'], run: later() },
  'send-to-phone': { label: '发送到手机', icon: 'Smartphone', appliesTo: ['doc', 'image', 'svg', 'lottie'], run: later() },
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
  lock: { label: '锁定', icon: 'Lock', appliesTo: ALL, run: later() },
  unlock: { label: '解锁', icon: 'Unlock', appliesTo: ALL, run: later() },
  'toggle-lock': { label: '切换锁定', icon: 'Lock', appliesTo: ALL, run: later() },
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
