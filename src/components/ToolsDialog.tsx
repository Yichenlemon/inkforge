import React, { useMemo, useState } from 'react'
import { SpellCheck2, Type, Palette, ShieldCheck, Loader2, Wand2, Check, AlertTriangle } from 'lucide-react'
import { toolsApi } from '../lib/api.js'
import { useDoc } from '../store/useDoc.js'
import { useUI } from '../store/useUI.js'
import { Modal, toast, Tabs, Toggle, Field, NumberInput, ColorField, Spinner, useAsync, copyText } from '../lib/ui.js'
import type { Block } from '../../shared/types.js'

type Tab = 'typeset' | 'check' | 'color'

export function ToolsDialog() {
  const open = useUI((s) => s.modals.tools)
  const close = useUI((s) => s.closeModal)
  const [tab, setTab] = useState<Tab>('typeset')
  const doc = useDoc((s) => s.doc)
  const replaceBlocks = useDoc((s) => s.replaceBlocks)

  const plainText = useMemo(() => collectText(doc.blocks), [doc.blocks])

  return (
    <Modal open={open} onClose={() => close('tools')} title="排版与质检" width={760}>
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'typeset', label: '中文排版' },
        { value: 'check', label: '内容质检' },
        { value: 'color', label: '配色' },
      ]} />
      <div className="pt-3">
        {tab === 'typeset' && <TypesetTab blocks={doc.blocks} onApply={replaceBlocks} />}
        {tab === 'check' && <CheckTab text={plainText} />}
        {tab === 'color' && <ColorTab />}
      </div>
    </Modal>
  )
}

function collectText(blocks: Block[]): string {
  return blocks.map((b) => {
    const d = b.data as any
    switch (b.type) {
      case 'paragraph': case 'heading': case 'quote': case 'list': return strip(d.html)
      case 'card': return [d.title, d.html, d.footer].filter(Boolean).map(strip).join('\n')
      case 'callout': return [d.title, d.html].filter(Boolean).map(strip).join('\n')
      case 'table': return (d.rows ?? []).map((r: string[]) => r.join(' ')).join('\n')
      case 'timeline': case 'steps': return (d.items ?? []).map((i: any) => [i.title, i.html].filter(Boolean).join(' ')).join('\n')
      case 'accordion': return (d.items ?? []).map((i: any) => [i.title, i.html].filter(Boolean).join(' ')).join('\n')
      case 'columns': return (d.columns ?? []).map((c: any) => strip(c.html)).join('\n')
      case 'interactive': return (d.panels ?? []).map((p: any) => [p.title, p.html].filter(Boolean).join(' ')).join('\n')
      case 'button': return strip(d.text)
      default: return ''
    }
  }).filter(Boolean).join('\n\n')
}

const strip = (s: string) => (s ?? '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/g, ' ')

/* ------------------------------------------------------------------ */
/* 中文排版                                                             */
/* ------------------------------------------------------------------ */

function TypesetTab({ blocks, onApply }: { blocks: Block[]; onApply: (b: Block[]) => void }) {
  const [autoSpacing, setAutoSpacing] = useState(true)
  const [dedupe, setDedupe] = useState(true)
  const [halfWidth, setHalfWidth] = useState(false)
  const [terms, setTerms] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ changes: string[] } | null>(null)
  const [preview, setPreview] = useState('')

  const apply = async (commit: boolean, override?: { autoSpacing?: boolean; dedupe?: boolean; halfWidth?: boolean }) => {
    const cfg = {
      autoSpacing: override?.autoSpacing ?? autoSpacing,
      dedupe: override?.dedupe ?? dedupe,
      halfWidth: override?.halfWidth ?? halfWidth,
    }
    setBusy(true)
    try {
      const next: Block[] = []
      const allChanges = new Set<string>()
      for (const b of blocks) {
        const d = b.data as any
        const fields: string[] = []
        switch (b.type) {
          case 'paragraph': case 'heading': case 'quote': case 'list': fields.push('html'); break
          case 'card': fields.push('title', 'html', 'footer'); break
          case 'callout': fields.push('title', 'html'); break
          case 'columns': break
          case 'timeline': case 'steps': case 'accordion': break
          case 'interactive': break
          default: break
        }
        if (!fields.length) { next.push(b); continue }
        const patched: any = { ...d }
        for (const f of fields) {
          if (!d[f]) continue
          const r = await toolsApi.typeset(d[f], {
            autoSpacing: cfg.autoSpacing, dedupePunctuation: cfg.dedupe, halfWidthAlnum: cfg.halfWidth,
            terms: terms.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
              const [from, to] = l.split(/[=→:]/).map((x) => x.trim())
              return { from, to }
            }).filter((x) => x.from && x.to),
          })
          patched[f] = r.html
          r.changes?.forEach((c: string) => allChanges.add(c))
        }
        next.push({ ...b, data: patched })
      }

      // 嵌套结构（时间轴 / 步骤 / 折叠 / 分栏 / 交互）
      for (let i = 0; i < next.length; i++) {
        const b = next[i]
        const d = b.data as any
        if (d.items) {
          d.items = await Promise.all(d.items.map(async (it: any) => {
            const o = { ...it }
            if (it.title) { const r = await toolsApi.typeset(it.title, { autoSpacing: cfg.autoSpacing, dedupePunctuation: cfg.dedupe, halfWidthAlnum: cfg.halfWidth }); o.title = r.html; r.changes?.forEach((c: string) => allChanges.add(c)) }
            if (it.html) { const r = await toolsApi.typeset(it.html, { autoSpacing: cfg.autoSpacing, dedupePunctuation: cfg.dedupe, halfWidthAlnum: cfg.halfWidth }); o.html = r.html; r.changes?.forEach((c: string) => allChanges.add(c)) }
            return o
          }))
        }
        if (d.columns) {
          d.columns = await Promise.all(d.columns.map(async (c: any) => {
            const r = await toolsApi.typeset(c.html ?? '', { autoSpacing: cfg.autoSpacing, dedupePunctuation: cfg.dedupe, halfWidthAlnum: cfg.halfWidth })
            r.changes?.forEach((c2: string) => allChanges.add(c2))
            return { ...c, html: r.html }
          }))
        }
        if (d.panels) {
          d.panels = await Promise.all(d.panels.map(async (p: any) => {
            const o = { ...p }
            if (p.title) o.title = (await toolsApi.typeset(p.title, { autoSpacing: cfg.autoSpacing, dedupePunctuation: cfg.dedupe, halfWidthAlnum: cfg.halfWidth })).html
            if (p.html) o.html = (await toolsApi.typeset(p.html, { autoSpacing: cfg.autoSpacing, dedupePunctuation: cfg.dedupe, halfWidthAlnum: cfg.halfWidth })).html
            return o
          }))
        }
      }

      setResult({ changes: Array.from(allChanges) })
      if (commit) { onApply(next); toast('排版已应用', 'success') }
      else {
        const first = next.find((b) => (b.data as any).html)
        setPreview((first?.data as any)?.html ?? '')
      }
    } catch (e: any) { toast(e?.message ?? '处理失败', 'error') }
    finally { setBusy(false) }
  }

  /** 一键排版：推荐配置（中西文空格 + 合并标点）整篇直接应用 */
  const oneClick = () => apply(true, { autoSpacing: true, dedupe: true, halfWidth: false })

  return (
    <div className="grid grid-cols-[1fr_280px] gap-4">
      <div>
        <div className="space-y-1.5">
          <CheckRow checked={autoSpacing} onChange={setAutoSpacing}
            title="中西文自动空格" desc="中文与英文/数字之间补半角空格，中文排版的基本规范" />
          <CheckRow checked={dedupe} onChange={setDedupe}
            title="合并重复标点" desc="把「。。。」合并为「。」，并规范省略号" />
          <CheckRow checked={halfWidth} onChange={setHalfWidth}
            title="全角英数转半角" desc="把１２３转成 123，注意会一并处理英文单词" />
        </div>

        <div className="mt-3">
          <div className="label mb-1">术语统一（每行一条：原词=目标词）</div>
          <textarea className="textarea font-mono text-[12px]" rows={4}
            placeholder={'微信=公众号\nInkForge=墨锻'}
            value={terms} onChange={(e) => setTerms(e.target.value)} />
        </div>

        <div className="flex items-center gap-2 mt-3">
          <button className="btn btn-primary flex-1" disabled={busy} onClick={oneClick}>
            <Wand2 size={13} /> ⚡ 一键排版（推荐配置，整篇生效）
          </button>
          <button className="btn btn-soft" disabled={busy} onClick={() => apply(false)}>
            {busy && <Loader2 size={13} className="animate-spin" />} 预览效果
          </button>
          <button className="btn btn-soft" disabled={busy} onClick={() => apply(true)}>
            按当前勾选应用
          </button>
        </div>
        <div className="text-[11px] text-ink-text-3 mt-1">一键排版 = 中西文自动空格 + 合并重复标点，跳过全角转换（安全默认）。</div>

        {result && (
          <div className="mt-3 rounded-lg bg-[#EDF7F2] px-3 py-2">
            <div className="text-[12px] text-[#14543F] mb-1">本次改动：</div>
            {result.changes.length
              ? result.changes.map((c) => <div key={c} className="text-[11.5px] text-[#14543F]">· {c}</div>)
              : <div className="text-[11.5px] text-[#14543F]">· 没有需要改动的地方</div>}
          </div>
        )}
      </div>

      <div className="border-l border-ink-line pl-4">
        <div className="label mb-1.5">繁简转换</div>
        <div className="grid grid-cols-2 gap-1.5 mb-4">
          {([['s2t', '简→繁'], ['t2s', '繁→简'], ['s2tw', '简→台'], ['tw2s', '台→简']] as const).map(([m, label]) => (
            <button key={m} className="btn btn-soft btn-sm" disabled={busy} onClick={async () => {
              setBusy(true)
              try {
                const next = await Promise.all(blocks.map(async (b) => {
                  const d = b.data as any
                  const map: any = { ...d }
                  for (const f of ['html', 'title', 'footer', 'text']) {
                    if (typeof map[f] === 'string' && map[f]) {
                      map[f] = (await toolsApi.case(strip(map[f]), m)).text
                    }
                  }
                  return { ...b, data: map }
                }))
                onApply(next)
                toast('转换完成', 'success')
              } catch (e: any) { toast(e?.message ?? '转换失败', 'error') }
              finally { setBusy(false) }
            }}>{label}</button>
          ))}
        </div>

        <div className="label mb-1.5">引号规范化</div>
        <div className="grid grid-cols-3 gap-1.5 mb-4">
          {([['corner', '直角「」'], ['curly', '弯引号“”'], ['straight', '直引号"'] ] as const).map(([m, label]) => (
            <button key={m} className="btn btn-soft btn-sm" disabled={busy} onClick={async () => {
              setBusy(true)
              try {
                const next = await Promise.all(blocks.map(async (b) => {
                  const d = b.data as any
                  const map: any = { ...d }
                  for (const f of ['html', 'title', 'footer']) {
                    if (typeof map[f] === 'string' && map[f]) {
                      map[f] = (await toolsApi.quote(map[f], m)).html
                    }
                  }
                  return { ...b, data: map }
                }))
                onApply(next)
                toast('引号已规范', 'success')
              } catch (e: any) { toast(e?.message ?? '处理失败', 'error') }
              finally { setBusy(false) }
            }}>{label}</button>
          ))}
        </div>

        <div className="label mb-1.5">预览（第一个文本块）</div>
        <div className="rounded-lg border border-ink-line p-2.5 text-[12.5px] min-h-[120px] leading-relaxed"
          dangerouslySetInnerHTML={{ __html: preview || '<span style="color:#999">点「预览效果」后显示</span>' }} />
      </div>
    </div>
  )
}

function CheckRow({ checked, onChange, title, desc }: { checked: boolean; onChange: (v: boolean) => void; title: string; desc: string }) {
  return (
    <label className="flex items-start gap-2 rounded-lg border border-ink-line px-2.5 py-2 cursor-pointer hover:bg-black/[0.02]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 accent-[#2C6BED]" />
      <div>
        <div className="text-[12.5px] font-medium">{title}</div>
        <div className="text-[11px] text-ink-text-3 leading-snug">{desc}</div>
      </div>
    </label>
  )
}

/* ------------------------------------------------------------------ */
/* 内容质检                                                             */
/* ------------------------------------------------------------------ */

function CheckTab({ text }: { text: string }) {
  const { data, loading } = useAsync(() => toolsApi.check(text), [text])
  if (loading || !data) return <div className="py-10 flex justify-center"><Spinner size={22} /></div>

  const r = data as any
  const score = r.readability?.score ?? 0
  const scoreColor = score >= 80 ? '#1D9E75' : score >= 60 ? '#E8A33D' : '#D64545'

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-2">
        <Metric label="字数" value={String(r.count?.chars ?? 0)} />
        <Metric label="句数" value={String(r.readability?.sentences ?? 0)} />
        <Metric label="段落" value={String(r.readability?.paragraphs ?? 0)} />
        <Metric label="阅读" value={`${r.count?.readMinutes ?? 1} 分钟`} />
      </div>

      <div className="rounded-lg border border-ink-line p-3">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-[13px] font-semibold">可读性评分</span>
          <span className="text-[22px] font-bold tabular-nums" style={{ color: scoreColor }}>{score}</span>
          <div className="flex-1 h-2 rounded-full bg-black/[0.06] overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${score}%`, background: scoreColor }} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-[11.5px] text-ink-text-2">
          <span>平均句长 {r.readability?.avgSentenceLen} 字</span>
          <span>平均段长 {r.readability?.avgParagraphLen} 字</span>
          <span>长句占比 {Math.round((r.readability?.longSentenceRatio ?? 0) * 100)}%</span>
        </div>
        {r.readability?.advice?.length > 0 && (
          <div className="mt-2 space-y-0.5">
            {r.readability.advice.map((a: string, i: number) => (
              <div key={i} className="text-[11.5px] text-[#B7791F]">· {a}</div>
            ))}
          </div>
        )}
      </div>

      {r.risks?.length > 0 && (
        <div>
          <div className="label mb-1.5 flex items-center gap-1.5">
            <ShieldCheck size={13} /> 合规风险（{r.risks.length}）
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {r.risks.map((h: any, i: number) => (
              <div key={i} className="flex items-start gap-2 rounded-lg bg-[#FDEDED] px-2.5 py-1.5">
                <span className="chip bg-[#D64545] text-white shrink-0">{h.category}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px]">“{h.word}”</div>
                  <div className="text-[10.5px] text-ink-text-3">{h.suggestion}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {r.typos?.length > 0 && (
        <div>
          <div className="label mb-1.5 flex items-center gap-1.5">
            <SpellCheck2 size={13} /> 疑似错别字（{r.typos.length}）
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {r.typos.map((t: any, i: number) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-[#FFF7E6] px-2.5 py-1.5 text-[12px]">
                <span className="line-through text-ink-text-3">{t.wrong}</span>
                <span>→</span>
                <span className="font-medium text-[#1D9E75]">{t.right}</span>
                <div className="flex-1" />
                <button className="btn btn-ghost btn-xs" onClick={() => copyText(t.right)}>复制</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!r.risks?.length && !r.typos?.length && (
        <div className="flex items-center gap-2 text-[#1D9E75] text-[13px]">
          <Check size={15} /> 没有发现合规风险与常见错别字
        </div>
      )}

      <div>
        <div className="label mb-1.5">自动摘要</div>
        <div className="rounded-lg border border-ink-line px-2.5 py-2 text-[12.5px] text-ink-text-2 leading-relaxed">
          {r.digest || '（暂无内容）'}
        </div>
        <button className="btn btn-soft btn-sm mt-1.5" onClick={() => {
          useDoc.getState().setMeta({ digest: r.digest })
          toast('已写入文章摘要', 'success')
        }}>用作文章摘要</button>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink-line px-2.5 py-2 text-center">
      <div className="text-[16px] font-semibold tabular-nums">{value}</div>
      <div className="text-[10.5px] text-ink-text-3">{label}</div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 配色                                                                 */
/* ------------------------------------------------------------------ */

function ColorTab() {
  const [base, setBase] = useState('#2C6BED')
  const [fg, setFg] = useState('#3F3F3F')
  const [bg, setBg] = useState('#FFFFFF')
  const [scheme, setScheme] = useState<any>(null)
  const [contrast, setContrast] = useState<any>(null)
  const [fromColor, setFromColor] = useState('#B08A4A')
  const [toColor, setToColor] = useState('#2C6BED')
  const setToken = useDoc((s) => s.setToken)
  const doc = useDoc((s) => s.doc)
  const replaceBlocks = useDoc((s) => s.replaceBlocks)

  /** 全篇颜色替换（M16 #405）：把文档里所有等于 from 的颜色换成 to */
  const applyRecolor = () => {
    const norm = (c: string): string | null => {
      const s = c.trim().toLowerCase()
      const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/)
      if (hex) {
        let h = hex[1]
        if (h.length === 3) h = h.split('').map((x) => x + x).join('')
        return '#' + h
      }
      const rgb = s.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/)
      if (rgb) return '#' + [1, 2, 3].map((i) => Number(rgb[i]).toString(16).padStart(2, '0')).join('')
      return null
    }
    const fromN = norm(fromColor)
    const toN = norm(toColor)
    if (!fromN || !toN) { toast('颜色格式无效', 'error'); return }
    const re = /(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8}|rgba?\([^)]*\))/g
    let n = 0
    const swap = (str: string) => str.replace(re, (m) => (norm(m) === fromN ? (n++, toN) : m))
    const walk = (v: any): any => {
      if (typeof v === 'string') return swap(v)
      if (Array.isArray(v)) return v.map(walk)
      if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
      return v
    }
    const next = doc.blocks.map((b) => {
      const nd = walk(JSON.parse(JSON.stringify(b.data)))
      return nd === b.data ? b : { ...b, data: nd }
    })
    replaceBlocks(next)
    toast(n ? `已替换 ${n} 处颜色` : '没有找到匹配的颜色', n ? 'success' : 'error')
  }

  const refresh = async () => {
    const [s, c] = await Promise.all([toolsApi.colorScheme(base), toolsApi.contrast(fg, bg)])
    setScheme(s); setContrast(c)
  }

  return (
    <div className="grid grid-cols-[1fr_300px] gap-4">
      <div>
        <div className="rounded-lg border border-ink-line p-3 mb-4">
          <div className="text-[13px] font-semibold mb-2">全篇颜色替换</div>
          <div className="flex items-end gap-2">
            <Field label="原颜色"><ColorField value={fromColor} onChange={(v) => v && setFromColor(v)} /></Field>
            <div className="pb-2 text-ink-text-3">→</div>
            <Field label="新颜色"><ColorField value={toColor} onChange={(v) => v && setToColor(v)} /></Field>
            <button className="btn btn-primary btn-sm mb-0.5" onClick={applyRecolor}>应用到全篇</button>
          </div>
          <div className="text-[11px] text-ink-text-3 mt-1.5">把全篇所有等于原颜色的文字/背景/边框统一换成新颜色（十六进制与 rgb 均可识别）。</div>
        </div>

        <Field label="主色"><ColorField value={base} onChange={(v) => v && setBase(v)} /></Field>
        <button className="btn btn-soft btn-sm mt-1.5" onClick={refresh}>生成配色方案</button>

        {scheme && (
          <div className="mt-4 space-y-3">
            <SwatchRow label="主色系" colors={[scheme.primary, scheme.light, scheme.dark]} />
            <SwatchRow label="强调 / 互补" colors={[scheme.accent, scheme.complement]} />
            <SwatchRow label="邻近色" colors={scheme.analogous} />
            <SwatchRow label="三角色" colors={scheme.triad} />
            <SwatchRow label="中性" colors={[scheme.neutral]} />
            <button className="btn btn-primary btn-sm w-full mt-2" onClick={() => {
              setToken({
                colorPrimary: scheme.primary,
                colorAccent: scheme.accent,
                colorSurface: scheme.neutral,
                colorText: '#3F3F3F',
                headingColor: scheme.dark,
              })
              toast('已应用到当前文章', 'success')
            }}>应用到当前文章</button>
          </div>
        )}
      </div>

      <div className="border-l border-ink-line pl-4">
        <div className="label mb-1.5">对比度检查</div>
        <Field label="前景"><ColorField value={fg} onChange={(v) => v && setFg(v)} /></Field>
        <Field label="背景"><ColorField value={bg} onChange={(v) => v && setBg(v)} /></Field>
        <button className="btn btn-soft btn-sm w-full" onClick={refresh}>检查</button>
        {contrast && (
          <div className="mt-3 rounded-lg border border-ink-line p-3">
            <div className="text-[26px] font-bold tabular-nums">{contrast.ratio}:1</div>
            <div className={`text-[12.5px] mt-0.5 ${contrast.pass ? 'text-[#1D9E75]' : 'text-[#D64545]'}`}>
              {contrast.level} · {contrast.pass ? '正文对比度达标' : '对比度不足，手机上会看不清'}
            </div>
          </div>
        )}
        <div className="mt-3 text-[11px] text-ink-text-3 leading-relaxed">
          WCAG AA 要求正文至少 4.5:1，大字号 3:1。公众号浅灰文字配白底是重灾区。
        </div>
      </div>
    </div>
  )
}

function SwatchRow({ label, colors }: { label: string; colors: string[] }) {
  return (
    <div>
      <div className="text-[11px] text-ink-text-3 mb-1">{label}</div>
      <div className="flex gap-1.5">
        {colors.map((c) => (
          <div key={c} className="flex-1">
            <div className="h-9 rounded-md border border-ink-line" style={{ background: c }} />
            <div className="text-[9.5px] text-ink-text-3 mt-0.5 text-center font-mono">{c}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
