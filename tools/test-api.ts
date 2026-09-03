import { emptyDoc, makeBlock, migrateDoc } from '../shared/types.js'

const doc = migrateDoc({
  ...emptyDoc('tech'),
  title: 'InkForge 端到端验证',
  meta: { author: 'InkForge', digest: '这是一段用于验证的摘要。' },
  blocks: [
    makeBlock('heading', { html: '一级标题：中西文混排 Test 123', level: 1, headingStyle: 'bar' }),
    makeBlock('paragraph', { html: '这是一段正文，包含<strong>加粗</strong>与<em>强调</em>，以及 English words 混排。' }),
    makeBlock('quote', { html: '引用一句有分量的话。', quoteStyle: 'bar' }),
    makeBlock('list', { html: '<li>第一项</li><li>第二项</li><li>第三项</li>', ordered: true }),
    makeBlock('code', {
      code: 'function hello(name) {\n  console.log(`hi ${name}`)\n}',
      lang: 'typescript', theme: 'github-light', showLineNumbers: true, title: 'demo.ts', scroll: true,
    }),
    makeBlock('table', {
      header: true,
      rows: [['功能', '秀米', '135', 'InkForge'], ['SVG 动效', '部分', '无', '完整'], ['代码高亮', '无', '弱', 'Shiki']],
      zebra: true, borderMode: 'all', align: ['left', 'center', 'center', 'center'],
    }),
    makeBlock('callout', { tone: 'info', title: '提示', html: '这里是一条信息提示。', variant: 'card' }),
    makeBlock('steps', { items: [{ title: '第一步', html: '导入内容' }, { title: '第二步', html: '调整样式' }], variant: 'number' }),
    makeBlock('timeline', { items: [{ time: '2026-09', title: '立项', html: '项目启动' }], variant: 'card' }),
    makeBlock('divider', { variant: 'gradient', height: 3 }),
    makeBlock('button', { text: '立即体验', variant: 'solid', size: 'md' }),
    makeBlock('card', { title: '卡片标题', html: '卡片内容说明。', variant: 'shadow' }),
    makeBlock('columns', { columns: [{ html: '左栏内容' }, { html: '右栏内容' }], gap: 12 }),
    makeBlock('interactive', { kind: 'click-reveal', panels: [{ title: '问题', html: '点击查看' }, { html: '这是答案' }] }),
    makeBlock('qrcode', { content: 'https://github.com', label: '扫码访问', size: 200 }),
    makeBlock('svg', {
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect x="10" y="10" width="180" height="80" rx="8" fill="#2C6BED"/><text x="100" y="56" text-anchor="middle" fill="#fff" font-size="20">InkForge</text></svg>',
    }),
    makeBlock('accordion', { items: [{ title: '折叠项一', html: '内容一' }], fallbackOpen: true }),
    makeBlock('video', { url: 'https://example.com/v.mp4', title: '演示视频', mode: 'poster' }),
    makeBlock('audio', { url: 'https://example.com/a.mp3', title: '播客', artist: 'InkForge', mode: 'card' }),
    makeBlock('html', { html: '<section style="color:#999;font-size:13px">自定义 HTML</section>' }),
  ],
})

const base = 'http://localhost:5177/api'

async function post(p: string, body: any) {
  const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return r.json()
}

console.log('=== 1. compile ===')
const c = await post('/compile', { doc })
if (!c.ok) { console.log('FAIL', c); process.exit(1) }
console.log('stats:', JSON.stringify(c.stats))
console.log('diagnostics:', c.diagnostics.length)
for (const d of c.diagnostics.slice(0, 15)) console.log(`  [${d.level}] ${d.rule}: ${d.message}`)
console.log('html head:', c.html.slice(0, 200))

console.log('\n=== 2. 违规样式是否被拦下 ===')
const bad = await post('/compile', {
  doc: {
    ...doc,
    blocks: [
      makeBlock('paragraph', { html: '测试' }, {
        customCss: 'position:absolute;animation:fade 1s;color:#f00;font-size:20px',
      }),
      makeBlock('html', { html: '<div id="x" class="y" onclick="alert(1)" style="position:fixed;top:0">坏内容</div>' }),
    ],
  },
})
console.log(JSON.stringify(bad.diagnostics, null, 1))

console.log('\n=== 3. markdown -> blocks ===')
const mb = await post('/convert/md2blocks', { md: '# 标题\n\n正文一段，含**加粗**。\n\n- 列表一\n- 列表二\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n```js\nconst a = 1\n```\n\n---\n' })
console.log('stats:', JSON.stringify(mb.stats))
console.log('types:', mb.blocks.map((b: any) => b.type).join(', '))

console.log('\n=== 4. 中文排版 + 质检 ===')
const t = await post('/tools/typeset', { html: '<p>这是Test中文English混排123的例子</p>', autoSpacing: true })
console.log(t.html)
const chk = await post('/tools/check', { text: '我们的产品是全网最低价，绝对有效，100%根治。这是一个测试句子，用于验证可读性评分系统的效果如何。' })
console.log('risks:', chk.risks.map((r: any) => `${r.category}:${r.word}`).join(', '))
console.log('readability:', JSON.stringify(chk.readability))
console.log('count:', JSON.stringify(chk.count))

console.log('\n=== 5. 代码块 ===')
const code = await post('/code/highlight', { code: 'const x: number = 1\nconsole.log(x)', lang: 'ts', theme: 'nord', showLineNumbers: true })
console.log('lines:', code.lines, '| head:', code.html.slice(0, 160))

console.log('\n=== 6. 二维码 ===')
const qr = await post('/qrcode', { content: 'https://inkforge.dev', size: 200 })
console.log('dataUrl len:', qr.dataUrl?.length)

console.log('\n=== 7. 配色 ===')
const cs = await post('/tools/color-scheme', { base: '#2C6BED' })
console.log(JSON.stringify(cs))

console.log('\n=== 8. SVG 导入 ===')
const sv = await post('/svg/ingest', { svg: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" id="root"><script>alert(1)</script><style>.a{}</style><g id="g1"><rect id="r1" x="0" y="0" width="100" height="100" fill="#f00"/><path id="p1" d="M0,0 L100,100" stroke="#00f" stroke-width="2"/></g></svg>' })
console.log('elements:', JSON.stringify(sv.elements))
console.log('bytes:', sv.bytesBefore, '->', sv.bytes, '| removed:', sv.removed)

console.log('\n=== 9. SVG 动画编译 ===')
const animSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect x="10" y="10" width="80" height="80" fill="#2C6BED"/><path d="M10,50 L190,50" stroke="#999" stroke-width="2" fill="none"/></svg>'
const ing = await post('/svg/ingest', { svg: animSvg })
const anim = await post('/svg/animate', {
  svg: ing.svg,
  anim: {
    duration: 2, loop: true, trigger: 'auto',
    tracks: [
      { id: 't1', target: 'rect', targetPath: ing.elements.find((e: any) => e.tag === 'rect').path, property: 'translate', begin: 0, dur: 2, repeat: 'indefinite', easing: { type: 'preset', name: 'power2.out' }, keyframes: [{ t: 0, value: '0 0' }, { t: 0.5, value: '100 0' }, { t: 1, value: '0 0' }] },
      { id: 't2', target: 'path', targetPath: ing.elements.find((e: any) => e.tag === 'path').path, property: 'stroke-dashoffset', begin: 0, dur: 2, repeat: 'indefinite', easing: { type: 'preset', name: 'linear' }, keyframes: [{ t: 0, value: '1' }, { t: 1, value: '0' }] },
    ],
  },
})
console.log('warnings:', anim.warnings)
console.log(anim.svg.slice(0, 700))
process.exit(0)
