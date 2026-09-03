import type { Theme, ThemeTokens } from './types.js'

/**
 * 内置主题。
 * 注意：官方规范明确「不建议设置 font-family」，因此主题不提供字体族配置，
 * 沿用公众号默认字体栈以保证创作端与阅读端一致。
 */
const base: ThemeTokens = {
  colorPrimary: '#2C6BED',
  colorAccent: '#F5A623',
  colorText: '#3F3F3F',
  colorMuted: '#8C8C8C',
  colorBg: '#FFFFFF',
  colorSurface: '#F7F7F5',
  colorBorder: '#E5E5E0',
  fontSize: 16,
  lineHeight: 1.75,
  letterSpacing: 0.5,
  paragraphGap: 16,
  radius: 8,
  headingColor: '#1A1A1A',
}

const t = (group: string, id: string, name: string, over: Partial<ThemeTokens>): Theme => ({
  id, name, group, tokens: { ...base, ...over },
})

export const THEMES: Theme[] = [
  t('通用', 'clean', '简约白', {}),
  t('通用', 'ink', '墨黑', {
    colorPrimary: '#1F2328', colorAccent: '#C96442', colorText: '#2C2C2A',
    colorMuted: '#7A7A76', colorSurface: '#F4F3F0', colorBorder: '#DFDDD7', headingColor: '#000000',
  }),
  t('通用', 'warm', '暖阳橙', {
    colorPrimary: '#E8703A', colorAccent: '#F2C14E', colorText: '#4A3B32',
    colorSurface: '#FFF4EC', colorBorder: '#F7DFCE', headingColor: '#7A3B1F',
  }),
  t('科技', 'tech', '科技蓝', {
    colorPrimary: '#0B5FFF', colorAccent: '#00C2FF', colorText: '#2B3440',
    colorSurface: '#EEF4FF', colorBorder: '#D6E4FF', headingColor: '#0B2545',
  }),
  t('科技', 'cyber', '暗夜终端', {
    colorPrimary: '#4ADE80', colorAccent: '#22D3EE', colorText: '#2F3A34',
    colorBg: '#FFFFFF', colorSurface: '#0F172A', colorBorder: '#1E293B', headingColor: '#0F172A',
  }),
  t('政务', 'gov', '政务红', {
    colorPrimary: '#C02C38', colorAccent: '#D4A24C', colorText: '#333333',
    colorSurface: '#FBEFEF', colorBorder: '#F0D5D5', headingColor: '#8E1B24',
  }),
  t('生活', 'forest', '青林绿', {
    colorPrimary: '#1D9E75', colorAccent: '#97C459', colorText: '#2F4238',
    colorSurface: '#EDF7F2', colorBorder: '#CFE8DC', headingColor: '#14543F',
  }),
  t('生活', 'sakura', '樱花粉', {
    colorPrimary: '#E0558A', colorAccent: '#F7A8C4', colorText: '#4A3340',
    colorSurface: '#FFF1F5', colorBorder: '#F8DCE6', headingColor: '#9C2B55', radius: 12,
  }),
  t('媒体', 'magazine', '杂志灰', {
    colorPrimary: '#111111', colorAccent: '#9B1C31', colorText: '#333333',
    colorMuted: '#999999', colorSurface: '#FAFAF8', colorBorder: '#DDDDDD',
    fontSize: 15, lineHeight: 1.9, letterSpacing: 1, headingColor: '#000000', radius: 2,
  }),
  t('媒体', 'news', '新闻深蓝', {
    colorPrimary: '#123A6B', colorAccent: '#B8860B', colorText: '#2C3033',
    colorSurface: '#F2F5F9', colorBorder: '#D8E0EA', fontSize: 16, lineHeight: 1.8, headingColor: '#0D2A4E',
  }),
  t('学术', 'academic', '学术蓝灰', {
    colorPrimary: '#2F4858', colorAccent: '#33658A', colorText: '#333F48',
    colorSurface: '#F1F4F6', colorBorder: '#D9E0E6', fontSize: 15, lineHeight: 1.85, headingColor: '#1F2D3A', radius: 4,
  }),
  t('学术', 'paper', '论文黑白', {
    colorPrimary: '#000000', colorAccent: '#555555', colorText: '#1A1A1A',
    colorMuted: '#666666', colorSurface: '#FFFFFF', colorBorder: '#CCCCCC',
    fontSize: 15, lineHeight: 1.9, headingColor: '#000000', radius: 0, justify: true, textIndent: true,
  }),
]

export const THEME_GROUPS = Array.from(new Set(THEMES.map((x) => x.group)))

export function getTheme(id: string): Theme {
  return THEMES.find((x) => x.id === id) ?? THEMES[0]
}

/** 从一段 HTML 中提取主色（用于「导入配色」） */
export function extractPalette(html: string): Partial<ThemeTokens> {
  const out: Partial<ThemeTokens> = {}
  const colors: Record<string, number> = {}
  const re = /(?:color|background(?:-color)?|border-color)\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const c = m[1].toLowerCase()
    colors[c] = (colors[c] ?? 0) + 1
  }
  const ranked = Object.entries(colors).sort((a, b) => b[1] - a[1])
  if (ranked[0]) out.colorPrimary = ranked[0][0]
  if (ranked[1]) out.colorAccent = ranked[1][0]
  // 正文色：找最深但非纯黑的颜色
  const dark = ranked
    .map(([c]) => c)
    .filter((c) => c.startsWith('#') && c.length === 7)
    .map((c) => ({ c, l: parseInt(c.slice(1, 3), 16) + parseInt(c.slice(3, 5), 16) + parseInt(c.slice(5, 7), 16) }))
    .sort((a, b) => a.l - b.l)
  if (dark[0]) out.colorText = dark[0].c
  return out
}
