import { useFileStore, type Facet } from './useFileStore.js'

export { default as FileManager } from './FileManager.js'
export { FacetTree } from './FacetTree.js'
export { Toolbar } from './Toolbar.js'
export { FilterBar } from './FilterBar.js'
export { BatchBar } from './BatchBar.js'
export { FileGrid } from './FileGrid.js'
export { FileList } from './FileList.js'
export { ContextMenu } from './ContextMenu.js'
export { PreviewPanel } from './PreviewPanel.js'
export { applyFilters, sortItems, type FMFilters } from './filtering.js'
export { iconFor } from './icons.js'

/** 打开文件管理器（可选指定初始分面）。 */
export function openFileManager(facet?: Facet) {
  useFileStore.getState().openManager(facet)
}

/** 关闭文件管理器。 */
export function closeFileManager() {
  useFileStore.getState().closeManager()
}
