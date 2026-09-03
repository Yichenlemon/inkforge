import { createHighlighter, type Highlighter } from 'shiki'

/** 常用语言（首次按需加载，避免全量 bundle 拖慢启动） */
const CORE_LANGS = [
  'javascript', 'typescript', 'jsx', 'tsx', 'json', 'html', 'css', 'scss', 'less',
  'python', 'java', 'kotlin', 'swift', 'go', 'rust', 'c', 'cpp', 'csharp',
  'php', 'ruby', 'shell', 'bash', 'sql', 'yaml', 'toml', 'markdown', 'mdx',
  'vue', 'svelte', 'xml', 'ini', 'dockerfile', 'diff', 'graphql', 'protobuf', 'lua', 'r', 'dart',
]

const CORE_THEMES = [
  'github-light', 'github-dark', 'github-dark-dimmed',
  'vitesse-light', 'vitesse-dark', 'one-light', 'one-dark-pro',
  'nord', 'dracula', 'monokai', 'material-theme', 'material-theme-palenight',
  'solarized-light', 'solarized-dark', 'catppuccin-latte', 'catppuccin-mocha',
  'night-owl', 'ayu-dark', 'tokyo-night', 'min-light', 'min-dark',
]

export const LANG_ALIASES: Record<string, string> = {
  js: 'javascript', ts: 'typescript', py: 'python', sh: 'shell', zsh: 'shell',
  yml: 'yaml', md: 'markdown', htm: 'html', 'c++': 'cpp', 'c#': 'csharp',
  golang: 'go', rs: 'rust', vue2: 'vue', vue3: 'vue', text: 'plaintext', plain: 'plaintext', txt: 'plaintext',
}

let highlighterPromise: Promise<Highlighter> | null = null

export function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({ themes: CORE_THEMES, langs: CORE_LANGS })
  }
  return highlighterPromise
}

export async function ensureLang(lang: string): Promise<void> {
  const hl = await getHighlighter()
  const real = LANG_ALIASES[lang] ?? lang
  if (!hl.getLoadedLanguages().includes(real)) {
    try {
      const mod = await import('shiki/langs/' + real + '.mjs').catch(() => null)
      if (mod) await hl.loadLanguage(mod.default as any)
    } catch {
      /* 不支持的语言回退纯文本 */
    }
  }
}

export function listLangs(): string[] {
  return CORE_LANGS.slice()
}

export function listThemes(): string[] {
  return CORE_THEMES.slice()
}

export interface WechatCodeOpts {
  lang?: string
  theme?: string
  showLineNumbers?: boolean
  startLine?: number
  /** '1,3-5' */
  highlight?: string
  diff?: boolean
  scroll?: boolean
  lineHeight?: number
  fontSize?: number
  title?: string
  /** 主题色，用于行号/标题栏 */
  accent?: string
  background?: string
  radius?: number
}

function expandHighlight(spec?: string): Set<number> {
  const out = new Set<number>()
  if (!spec) return out
  for (const part of spec.split(',')) {
    const s = part.trim()
    if (!s) continue
    const m = /^(\d+)\s*-\s*(\d+)$/.exec(s)
    if (m) {
      for (let i = Number(m[1]); i <= Number(m[2]); i++) out.add(i)
    } else if (/^\d+$/.test(s)) {
      out.add(Number(s))
    }
  }
  return out
}

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))
}

interface HastNode {
  type: string
  tagName?: string
  properties?: Record<string, any>
  children?: HastNode[]
  value?: string
}

/** 收集 hast 里的一行：token 列表 */
function lineTokens(line: HastNode): { text: string; style: string }[] {
  const out: { text: string; style: string }[] = []
  const walk = (n: HastNode, inherited: string) => {
    if (n.type === 'text') {
      out.push({ text: n.value ?? '', style: inherited })
      return
    }
    if (n.type === 'element' && (n.tagName === 'span' || n.tagName === 'code' || n.tagName === 'pre')) {
      const st = typeof n.properties?.style === 'string' ? n.properties.style : ''
      const merged = [inherited, st].filter(Boolean).join(';')
      for (const c of n.children ?? []) walk(c, merged)
      return
    }
    for (const c of n.children ?? []) walk(c, inherited)
  }
  for (const c of line.children ?? []) walk(c, '')
  return out
}

/**
 * 代码块 → 微信安全 HTML。
 *
 * 五步适配（少一步真机上就会塌）：
 * 1. 换行：每行一个 `<span leaf>` 块（不能用 \n，微信会折叠）
 * 2. 空格 → &nbsp;（否则缩进全部丢失）
 * 3. `<pre>` → `<section>` + `<span leaf>`（pre 的白空间处理在各端不一致）
 * 4. token 颜色内联（没有 <style> 标签，class 全部失效）
 * 5. 超宽容器加 data-ignore-width + overflow 横向滚动
 */
export async function highlightToWechat(code: string, opts: WechatCodeOpts = {}): Promise<{ html: string; lang: string; lines: number }> {
  const lang = LANG_ALIASES[opts.lang ?? ''] ?? opts.lang ?? 'plaintext'
  const theme = opts.theme ?? 'github-light'
  const hl = await getHighlighter()
  await ensureLang(lang)
  const realLang = hl.getLoadedLanguages().includes(lang) ? lang : 'plaintext'

  const hast = hl.codeToHast(code, { lang: realLang, theme, structure: 'classic' }) as HastNode
  const pre = (hast.children ?? []).find((c) => c.tagName === 'pre')
  const codeEl = (pre?.children ?? []).find((c) => c.tagName === 'code')
  // 只取行元素；shiki 会在行之间插入 "\n" 文本节点，必须过滤掉，否则会凭空多出空行
  const rawLines = (codeEl?.children ?? []).filter((c) => c.type === 'element' && c.tagName === 'span')

  // 背景色与前景色取自 shiki 主题本身，保证一致
  const bg = opts.background ?? extractStyleVar(pre, 'background-color') ?? '#f6f8fa'
  const fg = extractStyleVar(pre, 'color') ?? '#24292e'

  const hlLines = expandHighlight(opts.highlight)
  const fontSize = opts.fontSize ?? 14
  const lineHeight = opts.lineHeight ?? 1.6
  const start = opts.startLine ?? 1
  const radius = opts.radius ?? 8
  const accent = opts.accent ?? '#8c8c8c'

  const gutter = opts.showLineNumbers
    ? `padding-right:12px;color:${accent};user-select:none;-webkit-user-select:none;display:inline-block;min-width:${String(rawLines.length + start - 1).length}em;text-align:right;`
    : ''

  /** 空格 → &nbsp;，只作用于文本本身，绝不能污染标签属性 */
  const nbsp = (s: string) => s.replace(/ /g, '&nbsp;')
  const lineHtml: string[] = []

  const pushLine = (lineNo: number, tokens: { text: string; style: string }[]) => {
    let text = tokens
      .map((t) => (t.style ? `<span style="${t.style}">${nbsp(esc(t.text))}</span>` : nbsp(esc(t.text))))
      .join('')
    if (!text.trim()) text = '<br/>'

    let lineBg = hlLines.has(lineNo) ? 'background-color:rgba(255,220,120,0.28);' : ''
    if (opts.diff) {
      const first = (tokens[0]?.text ?? '').trim()
      if (first.startsWith('+')) lineBg = 'background-color:rgba(46,160,67,0.14);'
      else if (first.startsWith('-')) lineBg = 'background-color:rgba(248,81,73,0.14);'
    }
    const num = opts.showLineNumbers ? `<span style="${gutter}">${lineNo}</span>` : ''
    lineHtml.push(
      `<span leaf style="display:block;min-height:1.6em;line-height:${lineHeight};${lineBg}">${num}${text}</span>`,
    )
  }

  if (rawLines.length) {
    rawLines.forEach((ln, idx) => pushLine(idx + start, lineTokens(ln)))
  } else {
    // plaintext / 未加载的语言：不走 shiki，纯文本按行渲染
    code.split('\n').forEach((ln, idx) => pushLine(idx + start, [{ text: ln, style: '' }]))
  }
  const lines = lineHtml.length

  const titleBar = opts.title
    ? `<span leaf style="display:block;padding:8px 14px;background-color:rgba(0,0,0,0.04);color:${fg};font-size:${Math.max(12, fontSize - 1)}px;border-bottom:1px solid rgba(0,0,0,0.06);">${esc(opts.title)}</span>`
    : ''

  const scrollStyle = opts.scroll
    ? `overflow-x:auto;white-space:nowrap;`
    : `overflow-x:auto;`

  const html =
    `<section style="margin:16px 0;border-radius:${radius}px;background-color:${bg};color:${fg};font-size:${fontSize}px;line-height:${lineHeight};font-family:Menlo,Consolas,'Courier New',monospace;${scrollStyle}padding:12px 14px;letter-spacing:0;${opts.scroll ? '' : ''}">` +
    titleBar +
    lineHtml.join('') +
    `</section>`

  return { html, lang: realLang, lines }
}

function extractStyleVar(node: HastNode | undefined, key: string): string | undefined {
  const style = typeof node?.properties?.style === 'string' ? node.properties.style : ''
  // 用 (^|;|\s) 锚定，避免 `color:` 命中 `background-color:`
  const m = new RegExp(`(?:^|;|\\s)${key}\\s*:\\s*([^;]+)`).exec(style)
  return m?.[1]?.trim()
}

/** 纯预览用（编辑器内显示），不追求微信兼容 */
export async function highlightPreview(code: string, lang = 'plaintext', theme = 'github-light'): Promise<string> {
  const hl = await getHighlighter()
  await ensureLang(lang)
  const realLang = hl.getLoadedLanguages().includes(lang) ? lang : 'plaintext'
  return hl.codeToHtml(code, { lang: realLang, theme })
}
