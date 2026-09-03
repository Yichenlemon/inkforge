import * as OpenCC from 'opencc-js'

/* ------------------------------------------------------------------ */
/* 中文排版                                                             */
/* ------------------------------------------------------------------ */

const CJK = '\\u4e00-\\u9fff\\u3400-\\u4dbf\\u3040-\\u30ff\\uac00-\\ud7af'
const LATIN = 'A-Za-z0-9'

export interface TypesetOptions {
  /** 中西文之间自动加空格 */
  autoSpacing?: boolean
  /** 全角标点转半角（中文语境下保留全角，只对英文数字生效） */
  halfWidthAlnum?: boolean
  /** 清理重复标点 */
  dedupePunctuation?: boolean
  /** 清理行首行尾空格 */
  trimSpaces?: boolean
  /** 术语统一 */
  terms?: { from: string; to: string }[]
}

/**
 * 中西文自动空格：中文 与 英文/数字 之间补一个半角空格。
 * 这是中文排版的基本规范，公众号里几乎所有好文章都在做。
 */
export function autoSpacing(text: string): string {
  return text
    .replace(new RegExp(`([${CJK}])([${LATIN}])`, 'g'), '$1 $2')
    .replace(new RegExp(`([${LATIN}])([${CJK}])`, 'g'), '$1 $2')
    .replace(new RegExp(`([${CJK}])([\\(\\[\\{])`, 'g'), '$1 $2')
    .replace(new RegExp(`([\\)\\]\\}])([${CJK}])`, 'g'), '$1 $2')
    // 避免破坏 HTML 标签内部
    .replace(/<(\s*)\//g, '<$1/')
}

/** 全角英数 → 半角 */
export function toHalfWidth(text: string): string {
  return text.replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)).replace(/\u3000/g, ' ')
}

/** 半角英数 → 全角 */
export function toFullWidth(text: string): string {
  return text.replace(/[\u0020-\u007E]/g, (ch) => {
    const code = ch.charCodeAt(0)
    return code === 0x20 ? '\u3000' : String.fromCharCode(code + 0xFEE0)
  })
}

const HEAD_FORBIDDEN = '。，、；：？！）》」』】】〉”’%,.:;!?'
const TAIL_FORBIDDEN = '（《「『【〈“‘'

/**
 * 避头尾：浏览器端靠 CSS `line-break: strict` + `word-break` 实现，
 * 这里额外把「不可能靠 CSS 解决」的显式情况（比如行首标点前有可断开的空格）处理掉。
 */
export function avoidOrphan(text: string): string {
  return text.replace(new RegExp(`([${HEAD_FORBIDDEN}]) `, 'g'), '$1').replace(new RegExp(` ([${TAIL_FORBIDDEN}])`, 'g'), '$1')
}

export function typeset(html: string, opts: TypesetOptions = {}): { html: string; changes: string[] } {
  const changes: string[] = []
  let out = html
  // 只在文本节点上处理，避免破坏标签
  out = out.replace(/>([^<]+)</g, (_m, text: string) => {
    let t = text
    if (opts.trimSpaces !== false) {
      const before = t
      t = t.replace(/[ \t]+/g, ' ').trim()
      if (before !== t) changes.push('清理多余空格')
    }
    if (opts.autoSpacing) {
      const before = t
      t = autoSpacing(t)
      if (before !== t) changes.push('中西文之间补空格')
    }
    if (opts.halfWidthAlnum) {
      const before = t
      t = toHalfWidth(t)
      if (before !== t) changes.push('全角转半角')
    }
    if (opts.dedupePunctuation) {
      const before = t
      t = t.replace(/([。，！？；：、])\1+/g, '$1').replace(/…{2,}/g, '……')
      if (before !== t) changes.push('合并重复标点')
    }
    if (opts.terms?.length) {
      for (const { from, to } of opts.terms) {
        if (t.includes(from)) { t = t.split(from).join(to); changes.push(`术语统一：${from} → ${to}`) }
      }
    }
    return `>${t}<`
  })
  return { html: out, changes: Array.from(new Set(changes)) }
}

/* ------------------------------------------------------------------ */
/* 繁简转换                                                             */
/* ------------------------------------------------------------------ */

type CcMode = 's2t' | 't2s' | 's2tw' | 'tw2s' | 's2hk' | 'hk2s' | 's2twp' | 'tw2sp'

const converters = new Map<string, (s: string) => string>()

export function convertChinese(text: string, mode: CcMode): string {
  let fn = converters.get(mode)
  if (!fn) {
    const [from, to] = [mode.slice(0, mode.indexOf('2')), mode.slice(mode.indexOf('2') + 1)]
    const raw = (OpenCC as any).Converter({ from: normalizeCc(from), to: normalizeCc(to) }) as (s: string) => string
    fn = raw
    converters.set(mode, fn)
  }
  return fn(text)
}

function normalizeCc(code: string): string {
  return code === 's' ? 'cn' : code
}

/* ------------------------------------------------------------------ */
/* 引号规范化（只处理标签外的文本节点，避免破坏属性）                        */
/* ------------------------------------------------------------------ */

export type QuoteMode = 'corner' | 'curly' | 'straight'

const QUOTE_PAIRS: Record<QuoteMode, [string, string]> = {
  corner: ['「', '」'],
  curly: ['\u201C', '\u201D'],
  straight: ['"', '"'],
}

export function normalizeQuotes(html: string, mode: QuoteMode): string {
  // 按标签切分，仅替换标签外的文本段
  const parts = html.split(/(<[^>]*>)/g)
  let open = false
  const [lq, rq] = QUOTE_PAIRS[mode]
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i]
    if (!seg || seg.startsWith('<')) continue
    if (mode === 'straight') {
      parts[i] = seg.replace(/[\u201C\u201D「」]/g, '"')
    } else {
      let out = ''
      for (const ch of seg) {
        if (ch === '\u201C' || ch === '「' || ch === '"') { out += open ? rq : lq; open = !open }
        else if (ch === '\u201D' || ch === '」') { out += rq; open = false }
        else out += ch
      }
      parts[i] = out
    }
  }
  return parts.join('')
}

/* ------------------------------------------------------------------ */
/* 敏感词 / 广告法极限词 / 医疗金融合规                                   */
/* ------------------------------------------------------------------ */

export const AD_LAW_WORDS = [
  '国家级', '世界级', '最高级', '最佳', '最大', '最好', '最优', '最优秀', '最高', '最低', '最便宜',
  '最先进', '最新', '最科学', '最受欢迎', '第一品牌', '独一无二', '绝无仅有', '史无前例', '前无古人',
  '永久', '万能', '100%', '百分百', '绝对', '包治百病', '根治', '特效', '无敌', '顶级', '极品',
  '全网最低', '销量第一', '排名第一', '全国第一', '世界第一', '行业第一', '中国第一', '唯一',
  '首选', '顶级工艺', '极致', '巅峰', '空前绝后', '无敌', '零风险', '无副作用', '彻底解决',
]

export const MEDICAL_WORDS = [
  '治愈率', '根治', '包治', '特效药', '抗癌', '防癌', '减肥', '瘦身', '增肌', '壮阳',
  '治疗', '疗效', '处方', '临床证明', '无任何副作用', '药到病除',
]

export const FINANCE_WORDS = [
  '保本', '稳赚', '无风险', '高收益', '年化收益', '翻倍', '包赚', '内幕消息', '涨停板',
  '荐股', '必涨', '零风险套利',
]

export interface RiskHit {
  category: '广告法' | '医疗' | '金融' | '敏感'
  word: string
  index: number
  suggestion: string
}

const SENSITIVE_WORDS = [
  '政治', '领导人', '国家主席', '政府', '党', '军队', '示威', '游行', '罢工',
  '台独', '藏独', '疆独', '港独', '分裂', '颠覆', '暴恐', '恐怖袭击',
]

export function scanRisks(text: string): RiskHit[] {
  const hits: RiskHit[] = []
  const scan = (words: string[], category: RiskHit['category'], suggestion: string) => {
    for (const w of words) {
      let idx = text.indexOf(w)
      while (idx >= 0) {
        hits.push({ category, word: w, index: idx, suggestion })
        idx = text.indexOf(w, idx + w.length)
      }
    }
  }
  scan(AD_LAW_WORDS, '广告法', '《广告法》禁止使用绝对化用语，建议改为客观描述')
  scan(MEDICAL_WORDS, '医疗', '医疗类表述需资质，建议改为「有助于」「辅助」等')
  scan(FINANCE_WORDS, '金融', '金融类表述涉及合规，建议补充风险提示')
  scan(SENSITIVE_WORDS, '敏感', '建议复核该表述')
  return hits.sort((a, b) => a.index - b.index)
}

/* ------------------------------------------------------------------ */
/* 错别字（常见易混词表）                                                */
/* ------------------------------------------------------------------ */

const TYPOS: [string, string][] = [
  ['按装', '安装'], ['报稍', '报销'], ['部置', '布置'], ['穿流不息', '川流不息'],
  ['大声急呼', '大声疾呼'], ['调济', '调剂'], ['渡假', '度假'], ['防碍', '妨碍'],
  ['幅射', '辐射'], ['甘败下风', '甘拜下风'], ['感触', '感受'], ['鬼斧神功', '鬼斧神工'],
  ['既往不究', '既往不咎'], ['既使', '即使'], ['藉贯', '籍贯'], ['娇揉造作', '矫揉造作'],
  ['竣工', '竣工'], ['堪误', '勘误'], ['篮天', '蓝天'], ['寥阔', '辽阔'],
  ['名列前矛', '名列前茅'], ['明信片', '明信片'], ['募然', '蓦然'], ['迫不急待', '迫不及待'],
  ['气慨', '气概'], ['恰如其份', '恰如其分'], ['融恰', '融洽'], ['如影随行', '如影随形'],
  ['深切', '深切'], ['世外桃园', '世外桃源'], ['首屈一纸', '首屈一指'], ['水笼头', '水龙头'],
  ['谈笑风声', '谈笑风生'], ['提心掉胆', '提心吊胆'], ['天翻地复', '天翻地覆'],
  ['挺而走险', '铤而走险'], ['万不得以', '万不得已'], ['委屈求全', '委曲求全'],
  ['无微不致', '无微不至'], ['相辅相承', '相辅相成'], ['消声匿迹', '销声匿迹'],
  ['渲泄', '宣泄'], ['循规蹈距', '循规蹈矩'], ['一愁莫展', '一筹莫展'],
  ['一如继往', '一如既往'], ['遗笑大方', '贻笑大方'], ['萤光屏', '荧光屏'],
  ['忧心重重', '忧心忡忡'], ['语无论次', '语无伦次'], ['再接再励', '再接再厉'],
  ['责无旁代', '责无旁贷'], ['张慌失措', '张皇失措'], ['真知卓见', '真知灼见'],
  ['直接了当', '直截了当'], ['指手划脚', '指手画脚'], ['置若惘闻', '置若罔闻'],
  ['走头无路', '走投无路'], ['坐阵', '坐镇'], ['座落', '坐落'], ['泊来品', '舶来品'],
  ['亲睐', '青睐'], ['启事', '启事'], ['入场卷', '入场券'], ['搔痒', '瘙痒'],
  ['欣尝', '欣赏'], ['蜇伏', '蛰伏'], ['装钉', '装订'], ['追朔', '追溯'],
]

export interface TypoHit { wrong: string; right: string; index: number }

export function scanTypos(text: string): TypoHit[] {
  const hits: TypoHit[] = []
  for (const [wrong, right] of TYPOS) {
    let idx = text.indexOf(wrong)
    while (idx >= 0) {
      hits.push({ wrong, right, index: idx })
      idx = text.indexOf(wrong, idx + wrong.length)
    }
  }
  return hits.sort((a, b) => a.index - b.index)
}

/* ------------------------------------------------------------------ */
/* 可读性                                                               */
/* ------------------------------------------------------------------ */

export interface Readability {
  /** 0–100 */
  score: number
  chars: number
  sentences: number
  paragraphs: number
  avgSentenceLen: number
  avgParagraphLen: number
  longSentenceRatio: number
  advice: string[]
}

export function readability(text: string): Readability {
  const plain = text.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ')
  const chars = (plain.match(new RegExp(`[${CJK}]`, 'g')) ?? []).length
  const sentences = plain.split(/[。！？；!?;\n]+/).filter((s) => s.trim().length > 0)
  const paragraphs = plain.split(/\n{1,}/).filter((s) => s.trim().length > 0)
  const avgSentenceLen = sentences.length ? chars / sentences.length : 0
  const avgParagraphLen = paragraphs.length ? chars / paragraphs.length : 0
  const longSentences = sentences.filter((s) => (s.match(new RegExp(`[${CJK}]`, 'g')) ?? []).length > 45).length
  const longSentenceRatio = sentences.length ? longSentences / sentences.length : 0

  let score = 100
  const advice: string[] = []
  if (avgSentenceLen > 30) { score -= 15; advice.push(`平均句长 ${avgSentenceLen.toFixed(0)} 字偏长，建议拆成短句`) }
  if (longSentenceRatio > 0.15) { score -= 15; advice.push(`${(longSentenceRatio * 100).toFixed(0)}% 的句子超过 45 字，手机阅读吃力`) }
  if (avgParagraphLen > 120) { score -= 15; advice.push(`平均段落 ${avgParagraphLen.toFixed(0)} 字，建议每段控制在 3–5 行`) }
  if (paragraphs.length < 3 && chars > 400) { score -= 10; advice.push('段落过少，建议拆分以增强可读性') }
  if (chars < 300) { score -= 5; advice.push('正文较短，公众号建议 800 字以上') }
  score = Math.max(0, Math.min(100, Math.round(score)))

  return {
    score, chars, sentences: sentences.length, paragraphs: paragraphs.length,
    avgSentenceLen: Math.round(avgSentenceLen), avgParagraphLen: Math.round(avgParagraphLen),
    longSentenceRatio: Math.round(longSentenceRatio * 100) / 100, advice,
  }
}

/* ------------------------------------------------------------------ */
/* 统计                                                                 */
/* ------------------------------------------------------------------ */

export function countText(text: string): { chars: number; cjk: number; words: number; readMinutes: number } {
  const plain = text.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ')
  const cjk = (plain.match(new RegExp(`[${CJK}]`, 'g')) ?? []).length
  const words = (plain.match(/[A-Za-z]+/g) ?? []).length
  const chars = plain.replace(/\s/g, '').length
  return { chars, cjk, words, readMinutes: Math.max(1, Math.round((cjk + words) / 400)) }
}

/** 生成摘要：取开头若干字 */
export function makeDigest(text: string, max = CONTENT_DIGEST): string {
  const plain = text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  return plain.length > max ? plain.slice(0, max - 1) + '…' : plain
}

const CONTENT_DIGEST = 100
