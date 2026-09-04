import type { FileItem, FileKind } from '../../shared/types.js'

/* ------------------------------------------------------------------ */
/* 7 维素材筛选                                                         */
/* ------------------------------------------------------------------ */

export interface FMFilters {
  /** 类型（多选） */
  kinds?: FileKind[]
  /** 大小桶：a <50KB / b 50–500KB / c 0.5–2MB / d 2–10MB / e >10MB */
  size?: string[]
  /** 尺寸：480 / 720 / 1080 / 2k / 4k（按 meta.width/height 推导，缺失则不过滤） */
  dims?: string[]
  /** 上传时间：today / 7 / 30 / 90 / year / all */
  uploaded?: string
  /** 用量：none / 1 / 2-5 / 5+（按 item.refs?.length 推导） */
  usage?: string
  /** 标签（多选） */
  tags?: string[]
  /** 状态：animated / pinned / deleted */
  status?: string[]
}

const KB = 1024
const MB = 1024 * 1024

function inSizeBucket(size: number | undefined, bucket: string): boolean {
  if (size == null) return false
  switch (bucket) {
    case 'a': return size < 50 * KB
    case 'b': return size >= 50 * KB && size < 500 * KB
    case 'c': return size >= 500 * KB && size < 2 * MB
    case 'd': return size >= 2 * MB && size < 10 * MB
    case 'e': return size >= 10 * MB
    default: return false
  }
}

function inDimBucket(item: FileItem, bucket: string): boolean {
  const w = item.meta?.width as number | undefined
  const h = item.meta?.height as number | undefined
  const max = Math.max(w ?? 0, h ?? 0)
  if (!max) return false
  switch (bucket) {
    case '480': return max <= 480
    case '720': return max > 480 && max <= 720
    case '1080': return max > 720 && max <= 1080
    case '2k': return max > 1080 && max <= 2560
    case '4k': return max > 2560
    default: return false
  }
}

function inUploadedBucket(ts: number, bucket: string): boolean {
  const now = Date.now()
  const day = 86400000
  switch (bucket) {
    case 'today': return now - ts < day
    case '7': return now - ts < 7 * day
    case '30': return now - ts < 30 * day
    case '90': return now - ts < 90 * day
    case 'year': return now - ts < 365 * day
    case 'all': return true
    default: return true
  }
}

function usageBucket(item: FileItem): string {
  const n = item.refs?.length ?? 0
  if (n === 0) return 'none'
  if (n === 1) return '1'
  if (n <= 5) return '2-5'
  return '5+'
}

export function isAnimated(item: FileItem): boolean {
  if (item.kind === 'lottie') return true
  if (item.kind === 'svg') return Boolean(item.meta?.animated)
  if (item.kind === 'image') return /gif|apng|webp/i.test(item.mime ?? '') || Boolean(item.meta?.animated)
  return false
}

/** 同时满足 关键词(名称/标签) + 7 维筛选条件。 */
export function applyFilters(items: FileItem[], query: string, filters: FMFilters): FileItem[] {
  const q = query.trim().toLowerCase()
  const out: FileItem[] = []
  for (const it of items) {
    if (q) {
      const hay = [it.name, ...(it.tags ?? [])].join(' ').toLowerCase()
      if (!hay.includes(q)) continue
    }
    if (filters.kinds?.length && !filters.kinds.includes(it.kind)) continue
    if (filters.size?.length && !filters.size.some((b) => inSizeBucket(it.size, b))) continue
    if (filters.dims?.length && !filters.dims.some((b) => inDimBucket(it, b))) continue
    if (filters.uploaded && filters.uploaded !== 'all' && !inUploadedBucket(it.createdAt, filters.uploaded)) continue
    if (filters.usage && filters.usage !== 'all') {
      const u = usageBucket(it)
      if (filters.usage !== u) continue
    }
    if (filters.tags?.length) {
      const tags = it.tags ?? []
      if (!filters.tags.some((t) => tags.includes(t))) continue
    }
    if (filters.status?.length) {
      const ok = filters.status.some((s) => {
        if (s === 'animated') return isAnimated(it)
        if (s === 'pinned') return Boolean(it.pinned)
        if (s === 'deleted') return Boolean(it.deletedAt)
        return false
      })
      if (!ok) continue
    }
    out.push(it)
  }
  return out
}

/** 排序：recent / size / name / updatedAt */
export function sortItems(items: FileItem[], sort: string): FileItem[] {
  const arr = items.slice()
  switch (sort) {
    case 'size':
      arr.sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
      break
    case 'name':
      arr.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
      break
    case 'updatedAt':
      arr.sort((a, b) => b.updatedAt - a.updatedAt)
      break
    case 'recent':
    default:
      arr.sort((a, b) => (b.lastOpenedAt ?? b.updatedAt) - (a.lastOpenedAt ?? a.updatedAt))
      break
  }
  return arr
}

/** 从一组 items 里抽出去重后的全部标签，供筛选栏展示。 */
export function collectTags(items: FileItem[]): string[] {
  const set = new Set<string>()
  for (const it of items) (it.tags ?? []).forEach((t) => set.add(t))
  return Array.from(set).sort()
}
