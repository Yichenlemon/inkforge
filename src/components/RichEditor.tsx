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
} from 'lucide-react'
import { ColorField, toast } from '../lib/ui.js'

const HIGHLIGHT_COLORS = ['#FFF3B0', '#FFD9D9', '#D9F2E6', '#DCE8FF', '#EFDCFF', '#FFE7CC', 'transparent']

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
      TextStyle,
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
  const [showColors, setShowColors] = useState<'color' | 'highlight' | null>(null)
  const [showEmoji, setShowEmoji] = useState(false)
  const [brush, setBrushState] = useState<BrushStyle | null>(formatBrush.get())

  useEffect(() => {
    const rerender = () => force((n) => n + 1)
    editor.on('selectionUpdate', rerender)
    editor.on('transaction', rerender)
    const unsub = formatBrush.subscribe(() => setBrushState(formatBrush.get()))
    return () => { editor.off('selectionUpdate', rerender); editor.off('transaction', rerender); unsub() }
  }, [editor])

  const run = (fn: (ed: Editor) => void) => { fn(editor); onChange(editor.getHTML()) }

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

  const { from, to } = editor.state.selection
  const empty = from === to
  if (empty && !editor.isFocused) return null

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
        <TBtn title="文字颜色" active={showColors === 'color'} onClick={() => setShowColors(showColors === 'color' ? null : 'color')}>
          <Palette size={13} />
        </TBtn>
        <TBtn title="背景高亮" active={showColors === 'highlight'} onClick={() => setShowColors(showColors === 'highlight' ? null : 'highlight')}>
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
        <Sep />
        <TBtn title="格式刷：提取当前选区样式，再选中其他文字即可刷上" active={!!brush} onClick={toggleBrush}>
          <Paintbrush size={13} />
        </TBtn>
        <TBtn title="表情 / 符号" active={showEmoji} onClick={() => setShowEmoji(!showEmoji)}>
          <Smile size={13} />
        </TBtn>
        <TBtn title="清除格式" onClick={() => run((e) => e.chain().focus().unsetAllMarks().clearNodes().run())}><RemoveFormatting size={13} /></TBtn>
      </div>

      {showEmoji && (
        <div className="absolute z-50 bg-white rounded-lg border border-ink-line shadow-xl p-2 mb-1 w-64 max-h-40 overflow-y-auto">
          <div className="grid grid-cols-10 gap-0.5">
            {EMOJI_GROUPS.map(([em, group], i) => (
              <button key={i} title={group}
                className="w-[22px] h-[22px] rounded text-[14px] leading-[22px] hover:bg-black/[0.06]"
                onClick={() => { run((e) => e.chain().focus().insertContent(em).run()) }}>
                {em}
              </button>
            ))}
          </div>
        </div>
      )}

      {showColors === 'color' && (
        <div className="absolute z-50 bg-white rounded-lg border border-ink-line shadow-xl p-2 mb-1">
          <ColorField value={editor.getAttributes('textStyle').color} onChange={(c) => {
            if (c) run((e) => e.chain().focus().setColor(c).run())
            else run((e) => e.chain().focus().unsetColor().run())
          }} />
        </div>
      )}
      {showColors === 'highlight' && (
        <div className="absolute z-50 bg-white rounded-lg border border-ink-line shadow-xl p-2 mb-1 flex gap-1">
          {HIGHLIGHT_COLORS.map((c) => (
            <button key={c} title={c}
              className="w-6 h-6 rounded border border-ink-line"
              style={{ background: c }}
              onClick={() => {
                if (c === 'transparent') run((e) => e.chain().focus().unsetHighlight().run())
                else run((e) => e.chain().focus().setHighlight({ color: c }).run())
                setShowColors(null)
              }} />
          ))}
        </div>
      )}
    </div>
  )
}

function TBtn({ children, onClick, active, title }: { children: React.ReactNode; onClick: () => void; active?: boolean; title?: string }) {
  return (
    <button title={title} onMouseDown={(e) => e.preventDefault()} onClick={onClick}
      className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
        active ? 'bg-[#2C6BED] text-white' : 'text-ink-text-2 hover:bg-black/[0.06]'}`}>
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
