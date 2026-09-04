import { REGISTRY, type FileActionId, type FileItem } from '../../shared/types.js'
import { toast } from '../lib/ui.js'

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

export { REGISTRY }
