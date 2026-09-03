import React, { useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import { Link as TiptapLink } from '@tiptap/extension-link'
import Highlight from '@tiptap/extension-highlight'
import SuperscriptExt from '@tiptap/extension-superscript'
import SubscriptExt from '@tiptap/extension-subscript'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Code, Link2, Link2Off,
  Palette, Highlighter, RemoveFormatting, Superscript, Subscript, Paintbrush, Smile,
  ChevronDown, AlignLeft, Plus, Minus, Indent, Layers, AlignCenter, AlignRight, AlignJustify,
} from 'lucide-react'
import { ColorField, toast } from '../lib/ui.js'
import { useDoc } from '../store/useDoc.js'
import { useUI } from '../store/useUI.js'
import { makeBlock, type Block } from '../../shared/types.js'
import { COMPONENTS_BY_CATEGORY, searchComponents } from '../lib/components.js'
import { searchIllustrations } from '../lib/illustrations.js'
import { yibanApi } from '../lib/api.js'

const HIGHLIGHT_COLORS = ['#FFF3B0', '#FFD9D9', '#D9F2E6', '#DCE8FF', '#EFDCFF', '#FFE7CC', 'transparent']

/** TextStyle v2 无 fontSize/letterSpacing 属性，这里扩展 mark */
const StyledText = TextStyle.extend({
  addAttributes() {
    return {
      ...(this.parent as any)?.(),
      fontSize: {
        default: null as string | null,
        parseHTML: (el: HTMLElement) => el.style.fontSize ?? null,
        renderHTML: (attrs: any) => (attrs.fontSize ? { style: `font-size:${attrs.fontSize}` } : {}),
      },
      letterSpacing: {
        default: null as string | null,
        parseHTML: (el: HTMLElement) => el.style.letterSpacing ?? null,
        renderHTML: (attrs: any) => (attrs.letterSpacing ? { style: `letter-spacing:${attrs.letterSpacing}` } : {}),
      },
    }
  },
})

const FONT_PRESETS = [12, 13, 14, 15, 16, 17, 18, 20, 24]
const RECENT_COLORS_KEY = 'inkforge-recent-colors'
function pushRecentColor(c: string) {
  try {
    const list: string[] = JSON.parse(localStorage.getItem(RECENT_COLORS_KEY) ?? '[]')
    const next = [c, ...list.filter((x) => x !== c)].slice(0, 8)
    localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(next))
    return next
  } catch { return [c] }
}
function getRecentColors(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_COLORS_KEY) ?? '[]') } catch { return [] }
}

/* ------------------------------------------------------------------ */
/* 格式刷（规格 #49）：提取选区样式，刷到其他文本；再次点击取消            */
/* ------------------------------------------------------------------ */

interface BrushStyle {
  bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; code?: boolean
  color?: string; highlight?: string
}

let brushStyle: BrushStyle | null = null
const brushListeners = new Set<() => void>()

export const formatBrush = {
  get: () => brushStyle,
  set: (s: BrushStyle | null) => {
    brushStyle = s
    brushListeners.forEach((fn) => fn())
  },
  subscribe: (fn: () => void) => {
    brushListeners.add(fn)
    return () => { brushListeners.delete(fn) }
  },
}

function captureBrush(editor: Editor): BrushStyle | null {
  const s: BrushStyle = {}
  if (editor.isActive('bold')) s.bold = true
  if (editor.isActive('italic')) s.italic = true
  if (editor.isActive('underline')) s.underline = true
  if (editor.isActive('strike')) s.strike = true
  if (editor.isActive('code')) s.code = true
  const color = editor.getAttributes('textStyle').color as string | undefined
  if (color) s.color = color
  const hl = editor.getAttributes('highlight').color as string | undefined
  if (hl) s.highlight = hl
  return Object.keys(s).length ? s : null
}

function applyBrush(editor: Editor, s: BrushStyle) {
  editor.chain().focus().unsetAllMarks().unsetColor().unsetHighlight().run()
  const c = editor.chain().focus()
  if (s.bold) c.toggleBold()
  if (s.italic) c.toggleItalic()
  if (s.underline) c.toggleUnderline()
  if (s.strike) c.toggleStrike()
  if (s.code) c.toggleCode()
  if (s.color) c.setColor(s.color)
  if (s.highlight) c.setHighlight({ color: s.highlight })
  c.run()
}

/* ------------------------------------------------------------------ */
/* 表情 / 特殊符号（规格 #57 / #58）                                     */
/* ------------------------------------------------------------------ */

const EMOJI_GROUPS: [string, string][] = [
  ['😀', '常用'], ['😂', '常用'], ['🥰', '常用'], ['😍', '常用'], ['🤔', '常用'], ['😅', '常用'], ['😭', '常用'], ['🙏', '常用'],
  ['👍', '手势'], ['👏', '手势'], ['💪', '手势'], ['✌️', '手势'], ['🤝', '手势'], ['👌', '手势'], ['✊', '手势'], ['🫶', '手势'],
  ['❤️', '符号'], ['✨', '符号'], ['⭐', '符号'], ['🔥', '符号'], ['💯', '符号'], ['🎉', '符号'], ['⚡', '符号'], ['💡', '符号'],
  ['✅', '标记'], ['❌', '标记'], ['⚠️', '标记'], ['❗', '标记'], ['❓', '标记'], ['🔴', '标记'], ['🟢', '标记'], ['🟡', '标记'],
  ['👉', '箭头'], ['👈', '箭头'], ['➡️', '箭头'], ['⬅️', '箭头'], ['⬆️', '箭头'], ['⬇️', '箭头'], ['🔝', '箭头'], ['↩️', '箭头'],
  ['🌸', '自然'], ['🌈', '自然'], ['🍀', '自然'], ['🌙', '自然'], ['☀️', '自然'], ['🍂', '自然'], ['🌊', '自然'], ['🍃', '自然'],
  ['▲', '中文'], ['▼', '中文'], ['●', '中文'], ['○', '中文'], ['■', '中文'], ['□', '中文'], ['◆', '中文'], ['★', '中文'],
  ['·', '标点'], ['、', '标点'], ['「', '标点'], ['」', '标点'], ['『', '标点'], ['』', '标点'], ['～', '标点'], ['…', '标点'],
]

export interface RichEditorProps {
  html: string
  onChange: (html: string) => void
  onFocus?: () => void
  onBlur?: () => void
  placeholder?: string
  /** 基础样式（字号/颜色/行高/对齐） */
  style?: React.CSSProperties
  /** 是否显示悬浮工具栏 */
  bubble?: boolean
  /** 是否单行（标题等） */
  singleLine?: boolean
  className?: string
}

export function RichEditor({
  html, onChange, onFocus, onBlur, placeholder, style, bubble = false, singleLine = false, className = '',
}: RichEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        horizontalRule: false,
        blockquote: false,
        listItem: false,
        bulletList: false,
        orderedList: false,
      }),
      Highlight.configure({ multicolor: true }),
      SuperscriptExt,
      SubscriptExt,
      Underline,
      StyledText,
      Color,
      TiptapLink.configure({ openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto'] }),
      Placeholder.configure({ placeholder: placeholder ?? '输入内容…' }),
    ],
    content: html || '',
    editorProps: {
      attributes: {
        class: 'tiptap-content',
        style: [
          'outline:none',
          'min-height:1.4em',
          'line-height:inherit',
          'font-size:inherit',
          'color:inherit',
          'word-break:break-word',
          singleLine ? 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis' : '',
        ].filter(Boolean).join(';'),
      },
      handleKeyDown: (_view, event) => {
        if (singleLine && event.key === 'Enter') { event.preventDefault(); return true }
        // Cmd/Ctrl+Enter 退出编辑
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          ;(event.target as HTMLElement)?.blur?.()
          return true
        }
        return false
      },
      handlePaste: (_view, event) => {
        const e = event as ClipboardEvent
        const plain = e.clipboardData?.getData('text/plain')
        // ⇧ 粘贴 = 纯文本粘贴（规格 #52）
        if ((event as unknown as KeyboardEvent).shiftKey && plain) {
          e.preventDefault()
          _view.dispatch(_view.state.tr.insertText(plain))
          return true
        }
        // 粘贴时剥掉外部样式，避免把 Word/网页的脏样式带进来
        const text = plain
        if (text && !e.clipboardData?.getData('text/html')?.includes('data-inkforge')) {
          // 保留富文本（用户可能想保留加粗），但去掉 id/class/on*
          const raw = e.clipboardData?.getData('text/html')
          if (raw) {
            const cleaned = raw
              .replace(/\son\w+=("[^"]*"|'[^']*')/gi, '')
              .replace(/\sid=("[^"]*"|'[^']*')/gi, '')
              .replace(/\sclass=("[^"]*"|'[^']*')/gi, '')
            e.preventDefault()
            _view.dispatch(_view.state.tr.replaceSelectionWith(
              _view.state.schema.nodeFromJSON(
                new DOMParser().parseFromString(`<div>${cleaned}</div>`, 'text/html').body.firstChild as any,
              ) as any,
            ).scrollIntoView())
            return true
          }
        }
        return false
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    onFocus: () => onFocus?.(),
    onBlur: () => onBlur?.(),
  })

  // 外部值变化（如主题切换、撤销）时同步进来
  const lastEmitted = useRef(html)
  useEffect(() => {
    if (!editor) return
    if (html !== lastEmitted.current && html !== editor.getHTML()) {
      editor.commands.setContent(html || '', false)
    }
  }, [html, editor])

  const emit = (fn: (ed: Editor) => void) => {
    if (!editor) return
    fn(editor)
    lastEmitted.current = editor.getHTML()
    onChange(editor.getHTML())
  }

  if (!editor) return <div style={style} className={className} />

  return (
    <div className={className} style={style}>
      {bubble && <BubbleToolbar editor={editor} onChange={onChange} />}
      <EditorContent editor={editor} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 悬浮工具栏                                                           */
/* ------------------------------------------------------------------ */

function BubbleToolbar({ editor, onChange }: { editor: Editor; onChange: (h: string) => void }) {
  const [, force] = useState(0)
  const [menu, setMenu] = useState<'color' | 'highlight' | 'font' | 'para' | 'align' | 'insert' | 'emoji' | null>(null)
  const [brush, setBrushState] = useState<BrushStyle | null>(formatBrush.get())
  const [recentColors, setRecentColors] = useState<string[]>(getRecentColors())

  useEffect(() => {
    const rerender = () => force((n) => n + 1)
    editor.on('selectionUpdate', rerender)
    editor.on('transaction', rerender)
    const unsub = formatBrush.subscribe(() => setBrushState(formatBrush.get()))
    const close = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('.bb-popover') && !t.closest('.bb-trigger')) setMenu(null)
    }
    document.addEventListener('mousedown', close)
    return () => {
      editor.off('selectionUpdate', rerender)
      editor.off('transaction', rerender)
      document.removeEventListener('mousedown', close)
      unsub()
    }
  }, [editor])

  const run = (fn: (ed: Editor) => void) => { fn(editor); onChange(editor.getHTML()) }
  const toggleMenu = (m: typeof menu) => setMenu(menu === m ? null : m)

  const [insertTab, setInsertTab] = useState<'block' | 'component' | 'style' | 'asset'>('block')
  /** 在选中区块之后插入一批区块 */
  const insertAfter = (blocks: Block[]) => {
    const id = useUI.getState().selectedId
    const ds = useDoc.getState()
    const idx = ds.doc.blocks.findIndex((b) => b.id === id)
    ds.insertBlocks(blocks, idx >= 0 ? idx + 1 : undefined)
    setMenu(null)
    toast('已插入')
  }

  const toggleBrush = () => {
    if (brush) { formatBrush.set(null); return }
    const s = captureBrush(editor)
    if (!s) { toast('先选中一段带格式的文字，再点格式刷', 'error'); return }
    formatBrush.set(s)
  }

  // 有格式刷待应用时，用户选中一段文字即自动刷上
  useEffect(() => {
    if (!brush || !editor) return
    const onSel = () => {
      const { empty } = editor.state.selection
      if (empty) return
      applyBrush(editor, brush)
      onChange(editor.getHTML())
      formatBrush.set(null)
    }
    editor.on('selectionUpdate', onSel)
    return () => { editor.off('selectionUpdate', onSel) }
  }, [brush, editor, onChange])

  /* --- 字号（行内 mark） --- */
  const curFontSize = () => {
    const v = editor.getAttributes('textStyle').fontSize as string | undefined
    const m = v?.match(/([\d.]+)/)
    return m ? parseFloat(m[1]) : null
  }
  const setFontSize = (px: number | null) => {
    run((e) => e.chain().focus().setMark('textStyle', { fontSize: px ? `${px}px` : null }).run())
  }
  const stepFontSize = (delta: number) => {
    const cur = curFontSize() ?? 15
    setFontSize(Math.min(48, Math.max(10, Math.round(cur + delta))))
  }

  /* --- 段落（块级样式，落在 block.style 上） --- */
  const patchBlockStyle = (patch: Record<string, any>) => {
    const id = useUI.getState().selectedId
    const ds = useDoc.getState()
    if (!id) { toast('未选中区块', 'error'); return }
    const b = ds.doc.blocks.find((x) => x.id === id)
    if (!b) return
    ds.updateBlock(id, { style: { ...b.style, ...patch } })
  }
  const getBlockStyle = () => {
    const id = useUI.getState().selectedId
    return useDoc.getState().doc.blocks.find((x) => x.id === id)?.style ?? {}
  }

  /* --- 插入区块（上 / 下 / 叠加层级） --- */
  const insertSibling = (where: 'above' | 'below', block: any) => {
    const id = useUI.getState().selectedId
    const ds = useDoc.getState()
    const idx = ds.doc.blocks.findIndex((b) => b.id === id)
    if (idx < 0) { toast('未选中区块', 'error'); return }
    ds.insertBlocks([block], where === 'above' ? idx : idx + 1)
    setMenu(null)
    toast('已插入')
  }
  const insertOverlay = (z: number) => {
    const id = useUI.getState().selectedId
    const ds = useDoc.getState()
    const idx = ds.doc.blocks.findIndex((b) => b.id === id)
    if (idx < 0) { toast('未选中区块', 'error'); return }
    const label = z >= 99 ? '置顶层' : z <= 0 ? '置底层' : '普通层'
    const overlay = makeBlock('html', {
      html: `<section style="position:absolute;top:6px;right:6px;z-index:${z};background:#D64545;color:#fff;padding:2px 10px;border-radius:10px;font-size:11px;letter-spacing:1px;">${label}角标</section>`,
    }, { marginTop: 0, marginBottom: 0, customCss: 'position:relative' })
    ds.insertBlocks([overlay], idx + 1)
    setMenu(null)
    toast(`已插入叠加元素（${label}）`)
  }

  const { from, to } = editor.state.selection
  const empty = from === to
  if (empty && !editor.isFocused) return null

  const st = getBlockStyle()

  return (
    <div className="relative">
      <div className="flex items-center gap-0.5 mb-1 flex-wrap">
        <TBtn active={editor.isActive('bold')} title="加粗 ⌘B" onClick={() => run((e) => e.chain().focus().toggleBold().run())}><Bold size={13} /></TBtn>
        <TBtn active={editor.isActive('italic')} title="斜体 ⌘I" onClick={() => run((e) => e.chain().focus().toggleItalic().run())}><Italic size={13} /></TBtn>
        <TBtn active={editor.isActive('underline')} title="下划线 ⌘U" onClick={() => run((e) => e.chain().focus().toggleUnderline().run())}><UnderlineIcon size={13} /></TBtn>
        <TBtn active={editor.isActive('strike')} title="删除线" onClick={() => run((e) => e.chain().focus().toggleStrike().run())}><Strikethrough size={13} /></TBtn>
        <TBtn active={editor.isActive('code')} title="行内代码" onClick={() => run((e) => e.chain().focus().toggleCode().run())}><Code size={13} /></TBtn>
        <TBtn active={editor.isActive('superscript')} title="上标" onClick={() => run((e) => e.chain().focus().toggleSuperscript().run())}><Superscript size={13} /></TBtn>
        <TBtn active={editor.isActive('subscript')} title="下标" onClick={() => run((e) => e.chain().focus().toggleSubscript().run())}><Subscript size={13} /></TBtn>

        <Sep />
        <TBtn className="bb-trigger" title="段落对齐（左 / 中 / 右 / 两端）— 作用于当前块" active={menu === 'align'} onClick={() => toggleMenu('align')}>
          <span className="flex items-center">
            {getBlockStyle().textAlign === 'left' || !getBlockStyle().textAlign ? <AlignLeft size={13} />
              : getBlockStyle().textAlign === 'center' ? <AlignCenter size={13} />
              : getBlockStyle().textAlign === 'right' ? <AlignRight size={13} />
              : <AlignJustify size={13} />}
            <ChevronDown size={9} />
          </span>
        </TBtn>
        <TBtn className="bb-trigger" title="字号" active={menu === 'font'} onClick={() => toggleMenu('font')}>
          <span className="flex items-center"><span className="text-[12px] font-semibold">A</span><ChevronDown size={9} /></span>
        </TBtn>
        <TBtn title="字号 +1" onClick={() => stepFontSize(1)}><span className="flex items-center"><Plus size={10} /><span className="text-[11.5px] font-semibold">A</span></span></TBtn>
        <TBtn title="字号 −1" onClick={() => stepFontSize(-1)}><span className="flex items-center"><Minus size={10} /><span className="text-[11.5px] font-semibold">A</span></span></TBtn>
        <TBtn className="bb-trigger" title="段落（行高 / 字间距 / 首行缩进）" active={menu === 'para'} onClick={() => toggleMenu('para')}>
          <span className="flex items-center"><AlignLeft size={13} /><ChevronDown size={9} /></span>
        </TBtn>

        <Sep />
        <TBtn className="bb-trigger" title="插入：区块 / 组件 / 样式库 / 素材" active={menu === 'insert'} onClick={() => toggleMenu('insert')}>
          <span className="flex items-center"><Plus size={13} /><ChevronDown size={9} /></span>
        </TBtn>
        <TBtn className="bb-trigger" title="文字颜色" active={menu === 'color'} onClick={() => toggleMenu('color')}>
          <Palette size={13} />
        </TBtn>
        <TBtn className="bb-trigger" title="背景高亮" active={menu === 'highlight'} onClick={() => toggleMenu('highlight')}>
          <Highlighter size={13} />
        </TBtn>

        <Sep />
        <TBtn title="链接" active={editor.isActive('link')} onClick={() => {
          if (editor.isActive('link')) { run((e) => e.chain().focus().unsetLink().run()); return }
          const url = window.prompt('输入链接地址（公众号正文仅支持已关联的链接）')
          if (url) run((e) => e.chain().focus().setLink({ href: url }).run())
        }}><Link2 size={13} /></TBtn>
        {editor.isActive('link') && (
          <TBtn title="取消链接" onClick={() => run((e) => e.chain().focus().unsetLink().run())}><Link2Off size={13} /></TBtn>
        )}
        <TBtn title="格式刷：提取当前选区样式，再选中其他文字即可刷上" active={!!brush} onClick={toggleBrush}>
          <Paintbrush size={13} />
        </TBtn>
        <TBtn className="bb-trigger" title="表情 / 符号" active={menu === 'emoji'} onClick={() => toggleMenu('emoji')}>
          <Smile size={13} />
        </TBtn>
        <TBtn title="清除格式" onClick={() => run((e) => e.chain().focus().unsetAllMarks().clearNodes().run())}><RemoveFormatting size={13} /></TBtn>
      </div>

      {/* 对齐 */}
      {menu === 'align' && (
        <Pop>
          <div className="grid grid-cols-4 gap-1">
            {([['left', AlignLeft, '居左'], ['center', AlignCenter, '居中'], ['right', AlignRight, '居右'], ['justify', AlignJustify, '两端']] as const).map(([a, Ic, l]) => (
              <button key={a} onClick={() => { patchBlockStyle({ textAlign: a as any }); setMenu(null) }}
                className={`h-7 rounded border text-[11.5px] flex items-center justify-center gap-1 ${getBlockStyle().textAlign === a ? 'border-[#2C6BED] text-[#2C6BED] font-semibold' : 'border-ink-line hover:border-[#2C6BED]'}`}>
                <Ic size={12} /> {l}
              </button>
            ))}
          </div>
        </Pop>
      )}

      {/* 字号 */}
      {menu === 'font' && (
        <Pop>
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-[11px] text-ink-text-3">当前 {curFontSize() ?? '默认'}</span>
            <div className="flex-1" />
            <button className="btn btn-soft btn-xs" onClick={() => { setFontSize(null); setMenu(null) }}>恢复默认</button>
          </div>
          <div className="grid grid-cols-5 gap-1">
            {FONT_PRESETS.map((px) => (
              <button key={px} onClick={() => { setFontSize(px); setMenu(null) }}
                className={`h-7 rounded border text-[11.5px] tabular-nums ${curFontSize() === px ? 'border-[#2C6BED] text-[#2C6BED] font-semibold' : 'border-ink-line hover:border-[#2C6BED]'}`}>
                {px}
              </button>
            ))}
          </div>
          <div className="text-[10px] text-ink-text-3 mt-1.5">超出 12–24px 安全区，微信端可能显示异常。</div>
        </Pop>
      )}

      {/* 段落（块级） */}
      {menu === 'para' && (
        <Pop>
          <div className="text-[10.5px] font-semibold text-ink-text-3 mb-1">行高（本块）</div>
          <div className="grid grid-cols-4 gap-1 mb-2">
            {[1.5, 1.75, 2, 2.5].map((lh) => (
              <button key={lh} onClick={() => { patchBlockStyle({ lineHeight: lh }); setMenu(null) }}
                className={`h-7 rounded border text-[11.5px] tabular-nums ${st.lineHeight === lh ? 'border-[#2C6BED] text-[#2C6BED] font-semibold' : 'border-ink-line hover:border-[#2C6BED]'}`}>
                {lh}
              </button>
            ))}
          </div>
          <div className="text-[10.5px] font-semibold text-ink-text-3 mb-1">字间距（本块）</div>
          <div className="grid grid-cols-4 gap-1 mb-2">
            {[0, 0.5, 1, 2].map((ls) => (
              <button key={ls} onClick={() => { patchBlockStyle({ letterSpacing: ls }); setMenu(null) }}
                className={`h-7 rounded border text-[11.5px] tabular-nums ${st.letterSpacing === ls ? 'border-[#2C6BED] text-[#2C6BED] font-semibold' : 'border-ink-line hover:border-[#2C6BED]'}`}>
                {ls}px
              </button>
            ))}
          </div>
          <button className={`btn btn-xs w-full ${st.customCss?.includes('text-indent') ? 'btn-primary' : 'btn-soft'}`}
            onClick={() => {
              const has = st.customCss?.includes('text-indent')
              const nextCss = has
                ? (st.customCss!.replace(/text-indent:[^;]+;?/g, '').trim() || undefined)
                : `${st.customCss ?? ''}text-indent:2em`.trim()
              patchBlockStyle({ customCss: nextCss })
              setMenu(null)
            }}>
            首行缩进 2em{st.customCss?.includes('text-indent') ? '（取消）' : ''}
          </button>
        </Pop>
      )}

      {/* 插入（区块 / 组件 / 样式库 / 素材） */}
      {menu === 'insert' && (
        <Pop wide>
          <div className="flex gap-1 mb-2 border-b border-ink-line pb-1.5">
            {([
              ['block', '区块'], ['component', '组件'], ['style', '样式库'], ['asset', '素材'],
            ] as const).map(([t, l]) => (
              <button key={t} onClick={() => setInsertTab(t)}
                className={`px-2 py-1 rounded text-[11.5px] transition-colors ${insertTab === t ? 'bg-[#2C6BED]/10 text-[#2C6BED] font-semibold' : 'text-ink-text-2 hover:bg-black/[0.05]'}`}>
                {l}
              </button>
            ))}
          </div>

          {insertTab === 'block' && (
            <>
              <div className="text-[10.5px] font-semibold text-ink-text-3 mb-1 flex items-center gap-1"><Layers size={10} /> 嵌套进当前块</div>
              <div className="grid grid-cols-3 gap-1 mb-2">
                <InsBtn onClick={() => { run((e) => e.chain().focus().insertContent('·').run()); setMenu(null) }}>间隔点 ·</InsBtn>
                <InsBtn onClick={() => { run((e) => e.chain().focus().insertContent('\u3000').run()); setMenu(null) }}>全角空格</InsBtn>
                <InsBtn onClick={() => {
                  const name = window.prompt('变量名（配合片段库变量填充）', '公众号名')
                  if (name) run((e) => e.chain().focus().insertContent(`{{${name}}}`).run())
                  setMenu(null)
                }}>变量 {'{{}}'}</InsBtn>
              </div>
              <div className="text-[10.5px] font-semibold text-ink-text-3 mb-1">插入区块（当前块 上方 ↑ / 下方 ↓）</div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 mb-2">
                <InsBtn onClick={() => insertSibling('above', makeBlock('divider', {}))}>┄ 分割线 ↑</InsBtn>
                <InsBtn onClick={() => insertSibling('below', makeBlock('divider', {}))}>┄ 分割线 ↓</InsBtn>
                <InsBtn onClick={() => insertSibling('above', makeBlock('quote', { html: '引用内容', quoteStyle: 'bar' }))}>❝ 引用 ↑</InsBtn>
                <InsBtn onClick={() => insertSibling('below', makeBlock('quote', { html: '引用内容', quoteStyle: 'bar' }))}>❝ 引用 ↓</InsBtn>
                <InsBtn onClick={() => insertSibling('above', makeBlock('paragraph', { html: '' }))}>空段落 ↑</InsBtn>
                <InsBtn onClick={() => insertSibling('below', makeBlock('paragraph', { html: '' }))}>空段落 ↓</InsBtn>
                <InsBtn onClick={() => {
                  const url = window.prompt('图片地址（https://…）')
                  if (!url) return
                  insertSibling('below', makeBlock('image', { src: url, alt: '', display: 'block', width: '100%' }))
                }}>图片链接 ↓</InsBtn>
                <InsBtn onClick={() => {
                  const url = window.prompt('图片地址（https://…）')
                  if (!url) return
                  const right = window.confirm('确定 = 右浮动（文字环绕），取消 = 左浮动')
                  insertSibling('below', makeBlock('image', { src: url, alt: '', display: right ? 'float-right' : 'float-left', width: '45%' }))
                }}>浮动图文 ↓</InsBtn>
              </div>
              <div className="text-[10.5px] font-semibold text-ink-text-3 mb-1 flex items-center gap-1"><Layers size={10} /> 叠加角标（层级选择：压在其他元素上方 / 垫在下方）</div>
              <div className="grid grid-cols-3 gap-1">
                <InsBtn onClick={() => insertOverlay(99)}>置顶层 z99</InsBtn>
                <InsBtn onClick={() => insertOverlay(1)}>普通层 z1</InsBtn>
                <InsBtn onClick={() => insertOverlay(0)}>置底层 z0</InsBtn>
              </div>
            </>
          )}

          {insertTab === 'component' && <ComponentInsert onInsert={insertAfter} />}
          {insertTab === 'style' && <YibanInsert onInsert={insertAfter} />}
          {insertTab === 'asset' && <AssetInsert onInsert={insertAfter} />}
        </Pop>
      )}

      {/* 颜色 */}
      {menu === 'color' && (
        <Pop>
          <ColorField value={editor.getAttributes('textStyle').color} onChange={(c) => {
            if (c) { run((e) => e.chain().focus().setColor(c).run()); setRecentColors(pushRecentColor(c)) }
            else run((e) => e.chain().focus().unsetColor().run())
          }} />
          {recentColors.length > 0 && (
            <>
              <div className="text-[10px] text-ink-text-3 mt-2 mb-1">最近使用</div>
              <div className="flex gap-1">
                {recentColors.map((c) => (
                  <button key={c} title={c} className="w-5 h-5 rounded border border-ink-line" style={{ background: c }}
                    onClick={() => { run((e) => e.chain().focus().setColor(c).run()); setMenu(null) }} />
                ))}
              </div>
            </>
          )}
        </Pop>
      )}

      {/* 高亮 */}
      {menu === 'highlight' && (
        <Pop>
          <div className="flex gap-1">
            {HIGHLIGHT_COLORS.map((c) => (
              <button key={c} title={c}
                className="w-6 h-6 rounded border border-ink-line"
                style={{ background: c }}
                onClick={() => {
                  if (c === 'transparent') run((e) => e.chain().focus().unsetHighlight().run())
                  else run((e) => e.chain().focus().setHighlight({ color: c }).run())
                  setMenu(null)
                }} />
            ))}
          </div>
        </Pop>
      )}

      {/* 表情 */}
      {menu === 'emoji' && (
        <Pop>
          <div className="grid grid-cols-10 gap-0.5">
            {EMOJI_GROUPS.map(([em, group], i) => (
              <button key={i} title={group}
                className="w-[22px] h-[22px] rounded text-[14px] leading-[22px] hover:bg-black/[0.06]"
                onClick={() => { run((e) => e.chain().focus().insertContent(em).run()) }}>
                {em}
              </button>
            ))}
          </div>
        </Pop>
      )}
    </div>
  )
}

/* --- 插入：组件（内置组件库） --- */
function ComponentInsert({ onInsert }: { onInsert: (b: Block[]) => void }) {
  const [q, setQ] = useState('')
  const list = searchComponents(q)
  return (
    <div>
      <input className="input mb-2" placeholder="搜索组件（标题 / 卡片 / 引用…）" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="max-h-64 overflow-y-auto pr-1 space-y-2">
        {COMPONENTS_BY_CATEGORY.map((g) => {
          const items = g.items.filter((it) => list.includes(it))
          if (!items.length) return null
          return (
            <div key={g.category}>
              <div className="text-[10.5px] font-semibold text-ink-text-3 mb-1">{g.category}</div>
              <div className="grid grid-cols-2 gap-1">
                {items.map((c) => (
                  <button key={c.id} title={c.name} onClick={() => onInsert(c.create())}
                    className="h-7 rounded border border-ink-line text-[11.5px] px-1.5 text-left truncate hover:border-[#2C6BED] hover:text-[#2C6BED]">
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* --- 插入：样式库（壹伴 16,000+ 样式） --- */
function YibanInsert({ onInsert }: { onInsert: (b: Block[]) => void }) {
  const [items, setItems] = useState<any[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    let alive = true
    setLoading(true)
    yibanApi.list(q, 1, 40).then((r: any) => { if (alive) setItems(r.items ?? []) })
      .catch(() => { if (alive) setItems([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [q])
  return (
    <div>
      <input className="input mb-2" placeholder="搜索样式库…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="grid grid-cols-2 gap-1.5 max-h-64 overflow-y-auto">
        {items.map((m) => (
          <button key={m.id} title={`${m.desc?.slice(0, 20) || '样式'} · 点击插入`} onClick={() => onInsert([makeBlock('html', { html: m.detail }, { marginTop: 8, marginBottom: 16 })])}
            className="rounded border border-ink-line overflow-hidden text-left hover:border-[#2C6BED]">
            <div className="h-16 overflow-hidden bg-white pointer-events-none">
              <div className="origin-top-left" style={{ transform: 'scale(0.5)', width: '200%' }} dangerouslySetInnerHTML={{ __html: m.detail }} />
            </div>
            <div className="px-1.5 py-1 text-[11px] text-ink-text-2 truncate border-t border-ink-line">{m.desc?.slice(0, 16) || '样式'}</div>
          </button>
        ))}
      </div>
      {loading && <div className="text-[11px] text-ink-text-3 mt-1">加载中…</div>}
      {!loading && !items.length && <div className="text-[11px] text-ink-text-3 py-3 text-center">没有匹配的样式</div>}
    </div>
  )
}

/* --- 插入：素材（内置 SVG 插画） --- */
function AssetInsert({ onInsert }: { onInsert: (b: Block[]) => void }) {
  const [q, setQ] = useState('')
  const list = searchIllustrations(q)
  return (
    <div>
      <input className="input mb-2" placeholder="搜索素材（箭头 / 商务 / 动效…）" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="grid grid-cols-4 gap-1.5 max-h-64 overflow-y-auto">
        {list.map((il) => (
          <button key={il.id} title={il.name} onClick={() => onInsert([makeBlock('svg', { svg: il.svg, name: il.name }, { marginBottom: 12 })])}
            className="aspect-square rounded border border-ink-line flex items-center justify-center p-2 text-ink-text hover:border-[#2C6BED] hover:bg-[#2C6BED]/[0.04]">
            <span className="w-full h-full" dangerouslySetInnerHTML={{ __html: il.svg }} />
          </button>
        ))}
      </div>
    </div>
  )
}

function TBtn({ children, onClick, active, title, className = '' }: { children: React.ReactNode; onClick: () => void; active?: boolean; title?: string; className?: string }) {
  return (
    <button title={title} onMouseDown={(e) => e.preventDefault()} onClick={onClick}
      className={`bb-trigger w-6 h-6 rounded flex items-center justify-center transition-colors ${className} ${
        active ? 'bg-[#2C6BED] text-white' : 'text-ink-text-2 hover:bg-black/[0.06]'}`}>
      {children}
    </button>
  )
}

function Pop({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`bb-popover absolute z-50 bg-white rounded-lg border border-ink-line shadow-xl p-2 mb-1 ${wide ? 'w-72' : 'w-60'}`}>
      {children}
    </div>
  )
}

function InsBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onMouseDown={(e) => e.preventDefault()} onClick={onClick}
      className="h-7 rounded border border-ink-line text-[11.5px] px-1.5 hover:border-[#2C6BED] hover:text-[#2C6BED] truncate">
      {children}
    </button>
  )
}

function Sep() {
  return <span className="w-px h-4 bg-ink-line mx-0.5" />
}

/* ------------------------------------------------------------------ */
/* 纯展示（预览态）                                                     */
/* ------------------------------------------------------------------ */

export function RichTextView({ html, style }: { html: string; style?: React.CSSProperties }) {
  return <div style={style} dangerouslySetInnerHTML={{ __html: html ?? '' }} />
}
