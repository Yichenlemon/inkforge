import React, { useMemo, useState } from 'react'
import { Replace, ArrowDownUp, CheckCheck } from 'lucide-react'
import { Modal, toast, Field, Toggle } from '../lib/ui.js'
import { useDoc } from '../store/useDoc.js'
import { useUI } from '../store/useUI.js'
import type { Block } from '../../shared/types.js'

/**
 * 查找替换（跨块、支持正则、批量替换）—— 规格 #48 / M16 #404
 * 遍历所有文本型字段：html / title / footer / text / rows / items / columns / panels
 */

interface Hit { blockId: string; label: string; snippet: string; count: number }

/** 收集 block 内可替换的字符串字段引用路径 */
function textFields(b: Block): { get: (d: any) => string | undefined; set: (d: any, v: string) => void; label: string }[] {
  const d = b.data as any
  const out: { get: (d: any) => string | undefined; set: (d: any, v: string) => void; label: string }[] = []
  const f = (key: string, label: string) => out.push({
    get: (x) => (typeof x[key] === 'string' ? x[key] : undefined),
    set: (x, v) => { x[key] = v },
    label,
  })
  switch (b.type) {
    case 'paragraph': case 'heading': case 'quote': case 'list': case 'html': f('html', '内容'); break
    case 'card': f('title', '标题'); f('html', '内容'); f('footer', '脚注'); break
    case 'callout': f('title', '标题'); f('html', '内容'); break
    case 'button': f('text', '按钮文字'); break
    case 'table':
      out.push({
        get: (x) => (x.rows ?? []).map((r: string[]) => r.join('\u0000')).join('\u0001'),
        set: (x, v) => { x.rows = v.split('\u0001').map((r: string) => r.split('\u0000')) },
        label: '表格',
      })
      break
    case 'timeline': case 'steps': case 'accordion':
      out.push({
        get: (x) => (x.items ?? []).map((i: any) => [i.title, i.html].filter(Boolean).join('\u0000')).join('\u0001'),
        set: (x, v) => {
          const src = (x.items ?? [])
          x.items = v.split('\u0001').map((s: string, i: number) => {
            const [t, h] = s.split('\u0000')
            return { ...src[i], ...(t !== undefined ? { title: t } : {}), ...(h !== undefined ? { html: h } : {}) }
          })
        },
        label: '条目',
      })
      break
    case 'columns':
      out.push({
        get: (x) => (x.columns ?? []).map((c: any) => c.html ?? '').join('\u0001'),
        set: (x, v) => { x.columns = v.split('\u0001').map((s: string, i: number) => ({ ...(x.columns?.[i] ?? {}), html: s })) },
        label: '分栏',
      })
      break
    case 'interactive':
      out.push({
        get: (x) => (x.panels ?? []).map((p: any) => [p.title, p.html].filter(Boolean).join('\u0000')).join('\u0001'),
        set: (x, v) => {
          const src = x.panels ?? []
          x.panels = v.split('\u0001').map((s: string, i: number) => {
            const [t, h] = s.split('\u0000')
            return { ...src[i], ...(t !== undefined ? { title: t } : {}), ...(h !== undefined ? { html: h } : {}) }
          })
        },
        label: '面板',
      })
      break
    default: break
  }
  return out.filter((x) => x.get(d) !== undefined)
}

export function FindReplaceDialog() {
  const open = useUI((s) => s.modals.findReplace)
  const close = useUI((s) => s.closeModal)
  const doc = useDoc((s) => s.doc)
  const replaceBlocks = useDoc((s) => s.replaceBlocks)
  const select = useUI((s) => s.select)

  const [find, setFind] = useState('')
  const [replace, setReplace] = useState('')
  const [useRegex, setUseRegex] = useState(false)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [applied, setApplied] = useState(0)

  const matcher = useMemo(() => {
    if (!find) return null
    try {
      const flags = `g${caseSensitive ? '' : 'i'}${useRegex ? '' : ''}`
      const source = useRegex ? find : find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return new RegExp(source, flags)
    } catch { return null }
  }, [find, useRegex, caseSensitive])

  const hits = useMemo<Hit[]>(() => {
    if (!matcher) return []
    const out: Hit[] = []
    const plain = (s: string) => s.replace(/<[^>]+>/g, '')
    for (const b of doc.blocks) {
      let count = 0
      let snippet = ''
      for (const tf of textFields(b)) {
        const v = tf.get(b.data as any)
        if (!v) continue
        const matches = plain(v).match(matcher)
        if (matches?.length) {
          count += matches.length
          if (!snippet) {
            const m = matcher.exec(plain(v))
            if (m) {
              const s = Math.max(0, m.index - 14)
              snippet = plain(v).slice(s, m.index + m[0].length + 18)
            }
            matcher.lastIndex = 0
          }
        }
      }
      if (count) out.push({ blockId: b.id, label: blockLabel(b), snippet: snippet || '…', count })
    }
    return out
  }, [matcher, doc.blocks])

  const total = hits.reduce((a, h) => a + h.count, 0)

  const doReplace = (all: boolean) => {
    if (!matcher || !find) return
    let n = 0
    const next = doc.blocks.map((b) => {
      const fields = textFields(b)
      if (!fields.length) return b
      const d: any = JSON.parse(JSON.stringify(b.data))
      let touched = false
      for (const tf of fields) {
        const v = tf.get(d)
        if (!v) continue
        const replaced = v.replace(matcher, (m, ...args) => {
          if (all || (args[args.length - 1] as number) < 1) { n++; return replace }
          return m
        })
        if (replaced !== v) { tf.set(d, replaced); touched = true }
      }
      return touched ? { ...b, data: d } : b
    })
    if (!n) { toast('没有可替换的匹配', 'error'); return }
    replaceBlocks(next)
    setApplied(n)
    toast(all ? `已替换 ${n} 处` : `已替换 1 处`, 'success')
  }

  const jump = (blockId: string) => {
    select(blockId)
    setTimeout(() => {
      document.querySelector(`[data-block-id="${blockId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 60)
  }

  return (
    <Modal open={open} onClose={() => close('findReplace')} title="查找与替换" width={620}>
      <div className="space-y-2.5">
        <Field label="查找">
          <input className="input font-mono" autoFocus placeholder={useRegex ? '正则表达式，如 \\d+ 章' : '输入要查找的文字…'}
            value={find} onChange={(e) => { setFind(e.target.value); setApplied(0) }} />
        </Field>
        <Field label="替换为">
          <input className="input font-mono" placeholder="留空则删除匹配内容"
            value={replace} onChange={(e) => { setReplace(e.target.value); setApplied(0) }} />
        </Field>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 text-[12px] cursor-pointer">
            <Toggle value={useRegex} onChange={(v) => setUseRegex(v)} /> 正则表达式
          </label>
          <label className="flex items-center gap-1.5 text-[12px] cursor-pointer">
            <Toggle value={caseSensitive} onChange={(v) => setCaseSensitive(v)} /> 区分大小写
          </label>
          <div className="flex-1" />
          <span className="text-[12px] text-ink-text-3 tabular-nums">
            {matcher ? `匹配 ${total} 处 · ${hits.length} 个区块` : '输入以开始查找'}
          </span>
        </div>

        {applied > 0 && (
          <div className="rounded-lg bg-[#EDF7F2] px-3 py-2 text-[12px] text-[#14543F]">本次已替换 {applied} 处</div>
        )}

        <div className="flex gap-2">
          <button className="btn btn-soft flex-1" disabled={!total} onClick={() => doReplace(false)}>
            <Replace size={13} /> 替换第一处
          </button>
          <button className="btn btn-primary flex-1" disabled={!total} onClick={() => doReplace(true)}>
            <CheckCheck size={13} /> 全部替换
          </button>
        </div>

        {hits.length > 0 && (
          <div className="max-h-56 overflow-y-auto border border-ink-line rounded-lg divide-y divide-ink-line">
            {hits.map((h) => (
              <button key={h.blockId} onClick={() => jump(h.blockId)}
                className="w-full text-left px-3 py-2 hover:bg-black/[0.03] flex items-center gap-2">
                <span className="chip bg-black/[0.05] text-ink-text-3 shrink-0">{h.label}</span>
                <span className="text-[12px] flex-1 truncate text-ink-text-2">…{h.snippet}…</span>
                <span className="text-[11px] text-ink-text-3 shrink-0 flex items-center gap-0.5"><ArrowDownUp size={10} /> {h.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}

function blockLabel(b: Block): string {
  const map: Record<string, string> = {
    paragraph: '段落', heading: '标题', quote: '引用', list: '列表', card: '卡片', callout: '标注',
    table: '表格', timeline: '时间轴', steps: '步骤', accordion: '折叠', columns: '分栏',
    interactive: '交互', button: '按钮', html: 'HTML',
  }
  return map[b.type] ?? b.type
}
