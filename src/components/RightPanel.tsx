import React, { useMemo, useEffect } from 'react'
import {
  AlignLeft, AlignCenter, AlignRight, AlignJustify, Trash2, Copy, Lock, EyeOff, Code2,
  ArrowUp, ArrowDown, Wand2,
} from 'lucide-react'
import type { Block, BlockStyle, ThemeTokens, TextAlign, ShadowLevel, BorderStyle } from '../../shared/types.js'
import { THEMES, THEME_GROUPS, getTheme } from '../../shared/themes.js'
import { useDoc } from '../store/useDoc.js'
import { useUI } from '../store/useUI.js'
import {
  Field, NumberInput, Segmented, Select, Toggle, ColorField, Slider, toast, copyText,
} from '../lib/ui.js'
import { BLOCK_TYPE_LABEL } from '../lib/components.js'
import { CALLOUT_COLORS } from './calloutColors.js'

const SHADOWS: { value: ShadowLevel; label: string }[] = [
  { value: 'none', label: '无' }, { value: 'sm', label: '浅' },
  { value: 'md', label: '中' }, { value: 'lg', label: '深' }, { value: 'xl', label: '浓' },
]

const BORDER_STYLES: { value: BorderStyle; label: string }[] = [
  { value: 'none', label: '无' }, { value: 'solid', label: '实线' },
  { value: 'dashed', label: '虚线' }, { value: 'dotted', label: '点线' },
]

const ALIGNS: { value: TextAlign; label: React.ReactNode; title: string }[] = [
  { value: 'left', label: <AlignLeft size={13} />, title: '左对齐' },
  { value: 'center', label: <AlignCenter size={13} />, title: '居中' },
  { value: 'right', label: <AlignRight size={13} />, title: '右对齐' },
  { value: 'justify', label: <AlignJustify size={13} />, title: '两端对齐' },
]

export function RightPanel() {
  const tab = useUI((s) => s.rightTab)
  return (
    <div className="flex flex-col h-full bg-white">
      {tab === 'block' && <BlockPanel />}
      {tab === 'style' && <StylePanel />}
      {tab === 'theme' && <ThemePanel />}
      {tab === 'doc' && <DocPanel />}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 区块属性                                                             */
/* ------------------------------------------------------------------ */

function BlockPanel() {
  const doc = useDoc((s) => s.doc)
  const selectedId = useUI((s) => s.selectedId)
  const block = useMemo(() => doc.blocks.find((b) => b.id === selectedId), [doc.blocks, selectedId])
  const index = useMemo(() => doc.blocks.findIndex((b) => b.id === selectedId), [doc.blocks, selectedId])

  if (!block) {
    return (
      <div className="p-4 text-[12.5px] text-ink-text-3 leading-relaxed">
        <p className="mb-2">未选中区块。</p>
        <p>点击画布中的任意内容即可编辑其属性。也可以切换到「样式」调整选中区块的外观，或到「主题」统一修改全篇配色。</p>
      </div>
    )
  }

  const move = (delta: number) => useDoc.getState().moveBlockBy(block.id, delta)
  const atTop = index <= 0
  const atBottom = index < 0 || index >= doc.blocks.length - 1

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 h-9 border-b border-ink-line flex items-center justify-between shrink-0">
        <span className="text-[12.5px] font-semibold truncate">{BLOCK_TYPE_LABEL[block.type]}</span>
        <div className="flex items-center gap-0.5">
          <button className="btn btn-ghost btn-xs px-1" title="上移" disabled={atTop} onClick={() => move(-1)}><ArrowUp size={12} /></button>
          <button className="btn btn-ghost btn-xs px-1" title="下移" disabled={atBottom} onClick={() => move(1)}><ArrowDown size={12} /></button>
          {block.type === 'image' && (
            <button className="btn btn-ghost btn-xs px-1" title="图片编辑" onClick={() => useUI.getState().openModal('imageEditor')}><Wand2 size={12} /></button>
          )}
          <button className="btn btn-ghost btn-xs px-1" title="复制区块"
            onClick={() => { useDoc.getState().duplicateBlock(block.id); toast('已复制') }}><Copy size={12} /></button>
          <button className="btn btn-ghost btn-xs px-1" title="删除区块"
            onClick={() => { useDoc.getState().removeBlock(block.id) }}><Trash2 size={12} /></button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {block.type === 'image' && (
          <button className="btn btn-soft btn-sm w-full mb-3" onClick={() => useUI.getState().openModal('imageEditor')}>
            <Wand2 size={13} /> 打开图片编辑器（调色 / 滤镜 / 抠图）
          </button>
        )}
        <TypeSpecificProps block={block} />
      </div>
    </div>
  )
}

function TypeSpecificProps({ block }: { block: Block }) {
  const updateData = useDoc((s) => s.updateData)
  const up = (patch: Record<string, any>) => updateData(block.id, patch)
  const d = block.data as any

  switch (block.type) {
    case 'heading':
      return (
        <>
          <Field label="级别">
            <Segmented value={String(d.level ?? 2)} onChange={(v) => up({ level: Number(v) })}
              options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: `H${n}` }))} />
          </Field>
          <Field label="装饰">
            <Select value={d.headingStyle ?? 'plain'} onChange={(v) => up({ headingStyle: v })}
              options={[
                { value: 'plain', label: '无' }, { value: 'bar', label: '左侧竖条' },
                { value: 'underline', label: '下划线' }, { value: 'bracket', label: '方括号' },
                { value: 'number', label: '自动编号' }, { value: 'background', label: '荧光笔' },
              ]} />
          </Field>
        </>
      )

    case 'quote':
      return (
        <Field label="样式">
          <Select value={d.quoteStyle ?? 'bar'} onChange={(v) => up({ quoteStyle: v })}
            options={[
              { value: 'bar', label: '左侧竖线' }, { value: 'card', label: '底色卡片' },
              { value: 'quote-mark', label: '居中引号' }, { value: 'minimal', label: '极简' },
            ]} />
        </Field>
      )

    case 'list':
      return (
        <Field label="类型">
          <Segmented value={d.ordered ? 'ol' : 'ul'} onChange={(v) => up({ ordered: v === 'ol' })}
            options={[{ value: 'ul', label: '无序' }, { value: 'ol', label: '有序' }]} />
        </Field>
      )

    case 'image':
      return (
        <>
          <Field label="布局" hint="浮动模式下，后续正文会自动环绕图片">
            <Segmented value={d.display ?? 'block'} onChange={(v) => {
              const next = v === 'block'
                ? { display: 'block', width: '100%' }
                : { display: v, width: d.width && d.width !== '100%' ? d.width : '45%' }
              up(next)
            }} options={[
              { value: 'block', label: '通栏' },
              { value: 'float-left', label: '左浮动' },
              { value: 'float-right', label: '右浮动' },
            ]} />
          </Field>
          <Field label="宽度">
            <input className="input" placeholder="100%" value={d.width ?? (d.display && d.display !== 'block' ? '45%' : '100%')} onChange={(e) => up({ width: e.target.value })} />
          </Field>
          <Field label="旋转"><Slider value={d.rotate ?? 0} onChange={(v) => up({ rotate: v })} min={-180} max={180} /></Field>
          <Field label="翻转">
            <Toggle value={!!d.flipX} onChange={(v) => up({ flipX: v })} label="水平翻转" />
          </Field>
          <Field label="圆角"><NumberInput value={d.radius ?? 0} onChange={(v) => up({ radius: v })} min={0} max={64} suffix="px" /></Field>
          <Field label="阴影">
            <Select value={d.shadow ?? 'none'} onChange={(v) => up({ shadow: v })} options={SHADOWS} />
          </Field>
          <Field label="边框">
            <div className="flex gap-1.5">
              <NumberInput value={d.borderWidth ?? 0} onChange={(v) => up({ borderWidth: v })} min={0} max={12} />
              <ColorField value={d.borderColor} onChange={(v) => up({ borderColor: v })} />
            </div>
          </Field>
        </>
      )

    case 'gallery':
      return (
        <>
          <Field label="布局">
            <Select value={d.layout ?? 'stack'} onChange={(v) => up({ layout: v })}
              options={[
                { value: 'stack', label: '纵向排列' }, { value: 'scroll', label: '横向滑动' },
                { value: 'grid2', label: '两列网格' }, { value: 'grid3', label: '三列网格' },
              ]} />
          </Field>
          <Field label="圆角"><NumberInput value={d.radius ?? 6} onChange={(v) => up({ radius: v })} min={0} max={32} suffix="px" /></Field>
          <Field label="间距"><NumberInput value={d.gap ?? 8} onChange={(v) => up({ gap: v })} min={0} max={32} suffix="px" /></Field>
        </>
      )

    case 'code':
      return (
        <>
          <Field label="行号">
            <Toggle value={!!d.showLineNumbers} onChange={(v) => up({ showLineNumbers: v })} />
          </Field>
          <Field label="横向滚动">
            <Toggle value={d.scroll !== false} onChange={(v) => up({ scroll: v })} />
          </Field>
          <Field label="Diff">
            <Toggle value={!!d.diff} onChange={(v) => up({ diff: v })} />
          </Field>
          <Field label="起始行">
            <NumberInput value={d.startLine ?? 1} onChange={(v) => up({ startLine: v })} min={1} />
          </Field>
        </>
      )

    case 'table':
      return (
        <>
          <Field label="表头">
            <Toggle value={!!d.header} onChange={(v) => up({ header: v })} />
          </Field>
          <Field label="斑马纹">
            <Toggle value={!!d.zebra} onChange={(v) => up({ zebra: v })} />
          </Field>
          <Field label="边框">
            <Select value={d.borderMode ?? 'all'} onChange={(v) => up({ borderMode: v })}
              options={[
                { value: 'all', label: '全部' }, { value: 'horizontal', label: '仅横向' },
                { value: 'outer', label: '仅外框' }, { value: 'none', label: '无' },
              ]} />
          </Field>
          <Field label="字号">
            <NumberInput value={d.fontSize ?? 14} onChange={(v) => up({ fontSize: v })} min={10} max={22} suffix="px" />
          </Field>
          <Field label="边框色"><ColorField value={d.borderColor} onChange={(v) => up({ borderColor: v })} /></Field>
          <Field label="表头底色"><ColorField value={d.headerBg} onChange={(v) => up({ headerBg: v })} /></Field>
          <Field label="表头文字"><ColorField value={d.headerColor} onChange={(v) => up({ headerColor: v })} /></Field>
          <Field label="斑马色"><ColorField value={d.zebraColor} onChange={(v) => up({ zebraColor: v })} /></Field>
          <ColumnAlignEditor block={block} />
        </>
      )

    case 'divider':
      return (
        <>
          <Field label="样式">
            <Select value={d.variant ?? 'solid'} onChange={(v) => up({ variant: v })}
              options={[
                { value: 'solid', label: '实线' }, { value: 'dashed', label: '虚线' },
                { value: 'dotted', label: '点线' }, { value: 'gradient', label: '渐变' },
                { value: 'symbol', label: '符号' }, { value: 'space', label: '空白' },
              ]} />
          </Field>
          {d.variant === 'symbol' && (
            <Field label="符号"><input className="input" value={d.symbol ?? '• • •'} onChange={(e) => up({ symbol: e.target.value })} /></Field>
          )}
          {(d.variant === 'space' || d.variant === 'gradient') && (
            <Field label="高度"><NumberInput value={d.height ?? 24} onChange={(v) => up({ height: v })} min={1} max={200} suffix="px" /></Field>
          )}
          {d.variant !== 'gradient' && d.variant !== 'space' && (
            <>
              <Field label="粗细"><NumberInput value={d.height ?? 1} onChange={(v) => up({ height: v })} min={1} max={20} suffix="px" /></Field>
              <Field label="颜色"><ColorField value={d.color} onChange={(v) => up({ color: v })} /></Field>
            </>
          )}
          <Field label="宽度"><input className="input" placeholder="100%" value={d.width ?? '100%'} onChange={(e) => up({ width: e.target.value })} /></Field>
        </>
      )

    case 'card':
      return (
        <>
          <Field label="变体">
            <Select value={d.variant ?? 'plain'} onChange={(v) => up({ variant: v })}
              options={[
                { value: 'plain', label: '底色' }, { value: 'accent', label: '左侧强调' },
                { value: 'outline', label: '描边' }, { value: 'shadow', label: '阴影' },
              ]} />
          </Field>
          <Field label="图片位">
            <Select value={d.imagePosition ?? 'top'} onChange={(v) => up({ imagePosition: v })}
              options={[
                { value: 'top', label: '上图' }, { value: 'left', label: '左图' }, { value: 'right', label: '右图' },
              ]} />
          </Field>
          <Field label="链接"><input className="input" value={d.link ?? ''} onChange={(e) => up({ link: e.target.value })} /></Field>
        </>
      )

    case 'callout':
      return (
        <>
          <Field label="语气">
            <Segmented value={d.tone ?? 'info'} onChange={(v) => up({ tone: v })}
              options={[
                { value: 'info', label: '信息' }, { value: 'success', label: '成功' },
                { value: 'warning', label: '警告' }, { value: 'danger', label: '危险' }, { value: 'tip', label: '技巧' },
              ]} />
          </Field>
          <Field label="样式">
            <Select value={d.variant ?? 'card'} onChange={(v) => up({ variant: v })}
              options={[{ value: 'card', label: '卡片' }, { value: 'bar', label: '侧边条' }, { value: 'minimal', label: '极简' }]} />
          </Field>
          <Field label="图标"><input className="input" value={d.icon ?? ''} onChange={(e) => up({ icon: e.target.value })} placeholder="留空用默认" /></Field>
        </>
      )

    case 'timeline':
    case 'steps':
      return (
        <Field label="样式">
          <Select value={d.variant ?? (block.type === 'steps' ? 'number' : 'dot')} onChange={(v) => up({ variant: v })}
            options={block.type === 'steps'
              ? [{ value: 'number', label: '数字' }, { value: 'dot', label: '圆点' }, { value: 'check', label: '对勾' }]
              : [{ value: 'dot', label: '圆点' }, { value: 'line', label: '细线' }, { value: 'card', label: '卡片' }]} />
        </Field>
      )

    case 'accordion':
      return (
        <Field label="降级" hint="&lt;details&gt; 在部分安卓机型上不可靠，默认展开为静态内容">
          <Toggle value={d.fallbackOpen !== false} onChange={(v) => up({ fallbackOpen: v })} label="静态展开" />
        </Field>
      )

    case 'button':
      return (
        <>
          <Field label="变体">
            <Select value={d.variant ?? 'solid'} onChange={(v) => up({ variant: v })}
              options={[
                { value: 'solid', label: '实心' }, { value: 'outline', label: '描边' },
                { value: 'ghost', label: '幽灵' }, { value: 'gradient', label: '渐变' },
              ]} />
          </Field>
          <Field label="尺寸">
            <Segmented value={d.size ?? 'md'} onChange={(v) => up({ size: v })}
              options={[{ value: 'sm', label: '小' }, { value: 'md', label: '中' }, { value: 'lg', label: '大' }]} />
          </Field>
          <Field label="通栏"><Toggle value={!!d.fullWidth} onChange={(v) => up({ fullWidth: v })} /></Field>
        </>
      )

    case 'qrcode':
      return (
        <>
          <Field label="尺寸"><NumberInput value={d.size ?? 220} onChange={(v) => up({ size: v })} min={80} max={600} suffix="px" /></Field>
          <Field label="前景色"><ColorField value={d.fg} onChange={(v) => up({ fg: v })} /></Field>
          <Field label="背景色"><ColorField value={d.bg} onChange={(v) => up({ bg: v })} /></Field>
        </>
      )

    case 'interactive':
      return (
        <>
          <Field label="类型">
            <Select value={d.kind} onChange={(v) => up({ kind: v })}
              options={[
                { value: 'slider', label: '横向滑动' }, { value: 'click-reveal', label: '点击揭晓' },
                { value: 'longpress', label: '长按查看' }, { value: 'flip', label: '点击翻牌' },
                { value: 'tab', label: '点击切换' }, { value: 'accordion-click', label: '点击展开' },
                { value: 'carousel', label: '图片轮播' }, { value: 'progress', label: '进度条' },
                { value: 'marquee', label: '图片跑马灯' },
                { value: 'read-more', label: '展开全文' }, { value: 'like', label: '点赞' },
                { value: 'rating', label: '星级评分' }, { value: 'zoom', label: '图片放大' },
                { value: 'typewriter', label: '打字机' }, { value: 'switch', label: '开关' },
                { value: 'scratch', label: '刮刮卡（降级）' },
              ]} />
          </Field>
          <Field label="提示语"><input className="input" value={d.hint ?? ''} onChange={(e) => up({ hint: e.target.value })} /></Field>
          {(d.kind === 'flip' || d.kind === 'carousel' || d.kind === 'marquee' || d.kind === 'zoom') && (
            <>
              <Field label="宽度"><NumberInput value={d.width ?? 677} onChange={(v) => up({ width: v })} min={120} /></Field>
              <Field label="高度"><NumberInput value={d.height ?? (d.kind === 'flip' ? 200 : d.kind === 'carousel' ? 240 : 120)} onChange={(v) => up({ height: v })} min={60} /></Field>
            </>
          )}
          {d.kind === 'progress' && (
            <Field label="目标比例">
              <NumberInput value={Math.round((d.progress ?? 0.85) * 100)} min={0} max={100} suffix="%"
                onChange={(v) => up({ progress: Math.max(0, Math.min(1, (v ?? 85) / 100)) })} />
            </Field>
          )}
          {d.kind === 'rating' && (
            <>
              <Field label="星级数量"><NumberInput value={d.count ?? 5} min={1} max={10} onChange={(v) => up({ count: Math.max(1, Math.min(10, v ?? 5)) })} /></Field>
              <Field label="默认点亮"><NumberInput value={d.value ?? (d.count ?? 5)} min={0} max={10} onChange={(v) => up({ value: Math.max(0, Math.min(10, v ?? 0)) })} /></Field>
            </>
          )}
          {d.kind === 'switch' && (
            <>
              <Field label="开启文案"><input className="input" value={d.onLabel ?? ''} onChange={(e) => up({ onLabel: e.target.value })} /></Field>
              <Field label="关闭文案"><input className="input" value={d.offLabel ?? ''} onChange={(e) => up({ offLabel: e.target.value })} /></Field>
            </>
          )}
        </>
      )

    case 'svg':
      return <SvgProps block={block} />

    case 'lottie':
      return <LottieProps block={block} />

    case 'columns':
      return (
        <>
          <Field label="间距"><NumberInput value={d.gap ?? 12} onChange={(v) => up({ gap: v })} min={0} max={48} suffix="px" /></Field>
          <ColumnWidthEditor block={block} />
        </>
      )

    case 'wechat-eco':
      return <WechatEcoPanel block={block} />

    default:
      return <div className="text-[12px] text-ink-text-3">该类型没有额外属性，可用「样式」面板调整外观。</div>
  }
}

function WechatEcoPanel({ block }: { block: Block }) {
  return (
    <div className="text-[12px] text-ink-text-3 leading-relaxed p-1">
      该组件在画布中直接编辑：选择类型、填写 appid / 路径 / 封面，或从公众号文章链接一键抓取。
      导出源码中会附带可直接粘贴到公众号后台的规范微信组件代码。
    </div>
  )
}

function ColumnAlignEditor({ block }: { block: Block }) {
  const updateData = useDoc((s) => s.updateData)
  const d = block.data as any
  const cols = Math.max(...(d.rows ?? [['']]).map((r: string[]) => r.length), 1)
  const aligns: TextAlign[] = d.align ?? Array.from({ length: cols }, () => 'left')
  return (
    <Field label="列对齐">
      <div className="flex gap-1 flex-wrap">
        {Array.from({ length: cols }, (_, i) => (
          <Segmented key={i} size="sm" value={aligns[i] ?? 'left'}
            onChange={(v) => {
              const next = [...aligns]
              while (next.length < cols) next.push('left')
              next[i] = v
              updateData(block.id, { align: next })
            }}
            options={ALIGNS} />
        ))}
      </div>
    </Field>
  )
}

function ColumnWidthEditor({ block }: { block: Block }) {
  const updateData = useDoc((s) => s.updateData)
  const d = block.data as any
  const cols = d.columns ?? []
  return (
    <Field label="列宽比">
      <div className="flex gap-1">
        {cols.map((c: any, i: number) => (
          <NumberInput key={i} value={c.width ?? 1} onChange={(v) => {
            const next = cols.map((x: any, idx: number) => (idx === i ? { ...x, width: v } : x))
            updateData(block.id, { columns: next })
          }} min={1} max={12} />
        ))}
      </div>
    </Field>
  )
}

function SvgProps({ block }: { block: Block }) {
  const updateData = useDoc((s) => s.updateData)
  const openModal = useUI((s) => s.openModal)
  const d = block.data as any
  return (
    <>
      <div className="grid grid-cols-2 gap-1.5 mb-2">
        <button className="btn btn-soft btn-sm" onClick={() => openModal('anim')}>动效编辑</button>
        <button className="btn btn-soft btn-sm" onClick={() => openModal('import')}>换一个</button>
      </div>
      <Field label="体积">
        <span className="text-[12px] text-ink-text-2">{(d.bytes ?? 0)} B</span>
      </Field>
      <Field label="元素数">
        <span className="text-[12px] text-ink-text-2">{d.elements?.length ?? 0}</span>
      </Field>
      <Field label="说明"><input className="input" value={d.caption ?? ''} onChange={(e) => updateData(block.id, { caption: e.target.value })} /></Field>
      <button className="btn btn-ghost btn-sm w-full mt-1"
        onClick={() => { copyText(d.svg ?? ''); toast('SVG 源码已复制') }}>
        <Code2 size={12} /> 复制源码
      </button>
    </>
  )
}

function LottieProps({ block }: { block: Block }) {
  const openModal = useUI((s) => s.openModal)
  const d = block.data as any
  const r = d.report
  return (
    <>
      <button className="btn btn-soft btn-sm w-full mb-2" onClick={() => openModal('lottie')}>重新转换 / 换文件</button>
      {r && (
        <div className="text-[11.5px] space-y-1 text-ink-text-2">
          <div className="flex justify-between"><span>尺寸</span><span>{r.width}×{r.height}</span></div>
          <div className="flex justify-between"><span>帧数</span><span>{r.frames}</span></div>
          <div className="flex justify-between"><span>时长</span><span>{(r.durationMs / 1000).toFixed(2)}s</span></div>
          <div className="flex justify-between"><span>图层</span><span>{r.layers}</span></div>
          <div className="flex justify-between"><span>SMIL 可行</span><span>{r.capability?.smil ? '✓' : '✕'}</span></div>
          {r.features?.length > 0 && (
            <div className="pt-1 border-t border-ink-line">
              <div className="text-ink-text-3 mb-0.5">检测到的特性</div>
              <div className="flex flex-wrap gap-1">
                {r.features.map((f: string) => <span key={f} className="chip bg-black/[0.05] text-ink-text-3">{f}</span>)}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* 样式                                                                 */
/* ------------------------------------------------------------------ */

function StylePanel() {
  const doc = useDoc((s) => s.doc)
  const selectedId = useUI((s) => s.selectedId)
  const updateStyle = useDoc((s) => s.updateStyle)
  const block = useMemo(() => doc.blocks.find((b) => b.id === selectedId), [doc.blocks, selectedId])

  if (!block) return <div className="p-4 text-[12.5px] text-ink-text-3">先选中一个区块。</div>
  const s = block.style
  const set = (patch: Partial<BlockStyle>) => updateStyle(block.id, patch)

  return (
    <div className="flex-1 overflow-y-auto p-3">
      <div className="section-title px-0 pt-0">间距</div>
      <Field label="上边距"><NumberInput value={s.marginTop} onChange={(v) => set({ marginTop: v })} min={-100} max={200} suffix="px" /></Field>
      <Field label="下边距"><NumberInput value={s.marginBottom} onChange={(v) => set({ marginBottom: v })} min={-100} max={200} suffix="px" /></Field>
      <Field label="内边距">
        <div className="grid grid-cols-4 gap-1">
          <NumberInput value={s.paddingTop} onChange={(v) => set({ paddingTop: v })} min={0} />
          <NumberInput value={s.paddingRight} onChange={(v) => set({ paddingRight: v })} min={0} />
          <NumberInput value={s.paddingBottom} onChange={(v) => set({ paddingBottom: v })} min={0} />
          <NumberInput value={s.paddingLeft} onChange={(v) => set({ paddingLeft: v })} min={0} />
        </div>
      </Field>

      <div className="section-title px-0">外观</div>
      <Field label="背景"><ColorField value={s.background} onChange={(v) => set({ background: v })} /></Field>
      <Field label="圆角"><NumberInput value={s.borderRadius} onChange={(v) => set({ borderRadius: v })} min={0} max={64} suffix="px" /></Field>
      <Field label="边框样式">
        <Select value={s.borderStyle ?? 'none'} onChange={(v) => set({ borderStyle: v })} options={BORDER_STYLES} />
      </Field>
      {s.borderStyle && s.borderStyle !== 'none' && (
        <>
          <Field label="边框粗细"><NumberInput value={s.borderWidth ?? 1} onChange={(v) => set({ borderWidth: v })} min={0} max={20} suffix="px" /></Field>
          <Field label="边框色"><ColorField value={s.borderColor} onChange={(v) => set({ borderColor: v })} /></Field>
        </>
      )}
      <Field label="阴影">
        <Select value={s.boxShadow ?? 'none'} onChange={(v) => set({ boxShadow: v })} options={SHADOWS} />
      </Field>
      <Field label="不透明">
        <Slider value={Math.round((s.opacity ?? 1) * 100)} onChange={(v) => set({ opacity: v / 100 })} min={0} max={100} />
      </Field>

      <div className="section-title px-0">文字</div>
      <Field label="对齐">
        <Segmented value={s.textAlign ?? 'left'} onChange={(v) => set({ textAlign: v })} options={ALIGNS} />
      </Field>
      <Field label="颜色"><ColorField value={s.color} onChange={(v) => set({ color: v })} /></Field>
      <Field label="字号"><NumberInput value={s.fontSize} onChange={(v) => set({ fontSize: v })} min={9} max={48} suffix="px" /></Field>
      <Field label="行高"><NumberInput value={s.lineHeight} onChange={(v) => set({ lineHeight: v })} min={1} max={3} step={0.05} /></Field>
      <Field label="字距"><NumberInput value={s.letterSpacing} onChange={(v) => set({ letterSpacing: v })} min={-2} max={10} step={0.1} suffix="px" /></Field>

      <div className="section-title px-0">高级</div>
      <Field label="宽度" hint="建议用百分比；固定 px 会被平台判定为溢出">
        <input className="input" placeholder="100%" value={s.width ?? ''} onChange={(e) => set({ width: e.target.value })} />
      </Field>
      <div className="py-1">
        <div className="label mb-1">自定义 CSS（导出时按白名单裁剪）</div>
        <textarea className="textarea font-mono text-[11.5px]" rows={4} placeholder="letter-spacing:1px"
          value={s.customCss ?? ''} onChange={(e) => set({ customCss: e.target.value })} />
      </div>

      <div className="flex items-center gap-2 pt-2">
        <Toggle value={!s.hidden} onChange={(v) => set({ hidden: !v })} label="导出" />
        <button className="btn btn-ghost btn-sm" onClick={() => set({
          marginTop: 0, marginBottom: 16, paddingTop: undefined, paddingRight: undefined,
          paddingBottom: undefined, paddingLeft: undefined, background: undefined,
          borderRadius: undefined, borderStyle: 'none', borderWidth: undefined, borderColor: undefined,
          boxShadow: 'none', opacity: undefined, color: undefined, fontSize: undefined,
          lineHeight: undefined, letterSpacing: undefined, width: undefined, customCss: undefined,
        })}>重置</button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 主题                                                                 */
/* ------------------------------------------------------------------ */

function ThemePanel() {
  const doc = useDoc((s) => s.doc)
  const setTheme = useDoc((s) => s.setTheme)
  const setToken = useDoc((s) => s.setToken)
  const setArticleWidth = useDoc((s) => s.setArticleWidth)
  const tokens: ThemeTokens = useMemo(
    () => ({ ...getTheme(doc.themeId).tokens, ...(doc.tokenOverride ?? {}) }),
    [doc.themeId, doc.tokenOverride],
  )

  return (
    <div className="flex-1 overflow-y-auto p-3">
      <div className="section-title px-0 pt-0">主题</div>
      <div className="grid grid-cols-3 gap-1.5 mb-4">
        {THEMES.map((t) => (
          <button key={t.id} onClick={() => setTheme(t.id)}
            className={`rounded-lg border p-1.5 text-left transition-colors ${
              doc.themeId === t.id ? 'border-[#2C6BED] ring-2 ring-[#2C6BED]/15' : 'border-ink-line hover:border-ink-line-strong'}`}>
            <div className="flex gap-0.5 mb-1">
              <span className="w-3 h-3 rounded-sm" style={{ background: t.tokens.colorPrimary }} />
              <span className="w-3 h-3 rounded-sm" style={{ background: t.tokens.colorAccent }} />
              <span className="w-3 h-3 rounded-sm" style={{ background: t.tokens.colorSurface }} />
            </div>
            <div className="text-[11px] truncate text-ink-text-2">{t.name}</div>
          </button>
        ))}
      </div>

      <div className="section-title px-0">配色</div>
      {([
        ['colorPrimary', '主色'], ['colorAccent', '强调色'], ['colorText', '正文色'],
        ['colorMuted', '辅助色'], ['headingColor', '标题色'], ['colorSurface', '浅底色'],
        ['colorBorder', '边框色'], ['colorBg', '背景色'],
      ] as [keyof ThemeTokens, string][]).map(([key, label]) => (
        <Field key={key} label={label}>
          <ColorField value={tokens[key] as string} onChange={(v) => setToken({ [key]: v })} allowEmpty={false} />
        </Field>
      ))}

      <div className="section-title px-0">排版</div>
      <Field label="正文字号"><NumberInput value={tokens.fontSize} onChange={(v) => setToken({ fontSize: v })} min={12} max={22} suffix="px" /></Field>
      <Field label="行高"><NumberInput value={tokens.lineHeight} onChange={(v) => setToken({ lineHeight: v })} min={1.2} max={2.6} step={0.05} /></Field>
      <Field label="字间距"><NumberInput value={tokens.letterSpacing} onChange={(v) => setToken({ letterSpacing: v })} min={0} max={5} step={0.1} suffix="px" /></Field>
      <Field label="圆角"><NumberInput value={tokens.radius} onChange={(v) => setToken({ radius: v })} min={0} max={24} suffix="px" /></Field>
      <Field label="两端对齐"><Toggle value={tokens.justify ?? false} onChange={(v) => setToken({ justify: v })} /></Field>
      <Field label="首行缩进"><Toggle value={tokens.textIndent ?? false} onChange={(v) => setToken({ textIndent: v })} /></Field>

      <div className="section-title px-0">版式</div>
      <Field label="正文宽度">
        <Select value={String(doc.articleWidth ?? 677)} onChange={(v) => setArticleWidth(Number(v))}
          options={[
            { value: '600', label: '窄版 600' }, { value: '677', label: '标准 677' },
            { value: '750', label: '宽版 750' }, { value: '900', label: '超宽 900' },
          ]} />
      </Field>
      <div className="text-[10.5px] text-ink-text-3 mb-2">影响桌面预览与导出的版心宽度；手机端按屏幕自适应，配合字号即可整体缩放阅读版式。</div>

      <button className="btn btn-ghost btn-sm w-full mt-1"
        onClick={() => { for (const k of Object.keys(doc.tokenOverride ?? {})) setToken({ [k]: undefined }); setArticleWidth(undefined); toast('已恢复主题默认') }}>
        恢复主题默认
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 文章信息                                                             */
/* ------------------------------------------------------------------ */

const WORD_SKIP_KEYS = new Set(['src', 'url', 'link', 'href', 'svg', 'html', 'code', 'sourceUrl', 'thumb', 'poster', 'cover', 'icon'])

function countStats(doc: any) {
  let chars = 0
  let images = 0
  const walk = (v: any) => {
    if (v == null) return
    if (typeof v === 'string') chars += v.replace(/\s/g, '').length
    else if (Array.isArray(v)) v.forEach(walk)
    else if (typeof v === 'object') {
      for (const k of Object.keys(v)) { if (WORD_SKIP_KEYS.has(k)) continue; walk((v as any)[k]) }
    }
  }
  for (const b of doc.blocks) {
    if (b.type === 'image' || b.type === 'gallery' || b.type === 'svg' || b.type === 'qrcode') images++
    walk(b.data)
    if ((b.style as any)?.caption) walk((b.style as any).caption)
  }
  return { chars, images, blocks: doc.blocks.length }
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-ink-line bg-black/[0.02] py-2 text-center">
      <div className="text-[16px] font-semibold text-ink-text tabular-nums leading-none">{value}</div>
      <div className="text-[10.5px] text-ink-text-3 mt-1">{label}</div>
    </div>
  )
}

function DocPanel() {
  const doc = useDoc((s) => s.doc)
  const setMeta = useDoc((s) => s.setMeta)
  const meta = doc.meta ?? {}
  const stats = useMemo(() => countStats(doc), [doc])
  return (
    <div className="flex-1 overflow-y-auto p-3">
      <div className="section-title px-0 pt-0">文章统计</div>
      <div className="grid grid-cols-3 gap-1.5 mb-3">
        <Stat label="字数" value={stats.chars} />
        <Stat label="图片" value={stats.images} />
        <Stat label="区块" value={stats.blocks} />
      </div>
      <div className="section-title px-0">发布信息</div>
      <Field label="作者"><input className="input" value={meta.author ?? ''} onChange={(e) => setMeta({ author: e.target.value })} /></Field>
      <div className="py-1">
        <div className="label mb-1">摘要（{meta.digest?.length ?? 0}/120）</div>
        <textarea className="textarea" rows={3} value={meta.digest ?? ''} onChange={(e) => setMeta({ digest: e.target.value })} />
      </div>
      <Field label="原文链接"><input className="input" value={meta.sourceUrl ?? ''} onChange={(e) => setMeta({ sourceUrl: e.target.value })} placeholder="https://" /></Field>
      <Field label="开启留言"><Toggle value={!!meta.needOpenComment} onChange={(v) => setMeta({ needOpenComment: v })} /></Field>
      <Field label="仅粉丝留言"><Toggle value={!!meta.onlyFansCanComment} onChange={(v) => setMeta({ onlyFansCanComment: v })} /></Field>

      <div className="section-title px-0">外观</div>
      <Field label="文章背景色">
        <div className="flex items-center gap-2">
          <ColorField value={(meta as any).articleBackground ?? '#FFFFFF'} onChange={(c) => c && setMeta({ articleBackground: c })} />
          {(meta as any).articleBackground && (
            <button className="btn btn-ghost btn-xs" onClick={() => setMeta({ articleBackground: undefined })}>恢复默认</button>
          )}
        </div>
      </Field>
      <div className="text-[11px] text-ink-text-3 -mt-1 mb-2">整篇底色（编译时写入外层容器，预览同步显示）。浅色文字慎配深底。</div>

      <div className="section-title px-0">封面</div>
      <CoverPicker />
    </div>
  )
}

function CoverPicker() {
  const doc = useDoc((s) => s.doc)
  const setMeta = useDoc((s) => s.setMeta)
  const openModal = useUI((s) => s.openModal)
  const cover = doc.meta?.cover
  return (
    <div>
      {cover
        ? <img src={cover} alt="" className="w-full rounded-lg border border-ink-line" />
        : <div className="w-full aspect-[2.35/1] rounded-lg border border-dashed border-ink-line-strong flex items-center justify-center text-[12px] text-ink-text-3">
          未设置封面
        </div>}
      <button className="btn btn-soft btn-sm w-full mt-2" onClick={() => openModal('cover')}>
        {cover ? '重新制作封面' : '制作封面'}
      </button>
    </div>
  )
}
