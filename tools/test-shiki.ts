import { highlightToWechat } from '../server/lib/shiki.js'
const code = `function greet(name) {\n  if (!name) return 'hi'\n  return \`hello \${name}\`\n}`
const r = await highlightToWechat(code, { lang: 'ts', theme: 'github-light', showLineNumbers: true, highlight: '2', title: 'demo.ts', scroll: true })
console.log('lang:', r.lang, 'lines:', r.lines)
console.log(r.html)
