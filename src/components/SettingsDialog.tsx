import React, { useState, useEffect } from 'react'
import { Modal, Toggle, NumberInput, Segmented, ColorField, Select, Slider, toast } from '../lib/ui.js'
import { useUI, type EditorSettings, type UiTheme, type TypoDefaults, type WritingAssist, type MaterialDefaults, type ExportDefaults, type PerfDefaults } from '../store/useUI.js'
import { useDoc } from '../store/useDoc.js'
import { downloadText } from '../lib/ui.js'

/* 落地在 EditorSettings 之外的少量 UI 偏好，单独持久化，避免改动共享契约 */
const EXTRA_KEY = 'inkforge-ui-extra'
function loadExtra(): { lang?: string; cmdHints?: boolean } {
  try { return JSON.parse(localStorage.getItem(EXTRA_KEY) ?? '{}') } catch { return {} }
}
function saveExtra(p: { lang?: string; cmdHints?: boolean }) {
  try { localStorage.setItem(EXTRA_KEY, JSON.stringify({ ...loadExtra(), ...p })) } catch { /* ignore */ }
}

const FONT_OPTIONS = [
  { value: 'system', label: '系统默认' },
  { value: '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif', label: '无衬线（雅黑）' },
  { value: '"Heiti SC", "Microsoft YaHei", sans-serif', label: '黑体' },
  { value: 'KaiTi, STKaiti, "楷体", serif', label: '楷体' },
  { value: 'SimSun, "宋体", serif', label: '宋体' },
  { value: 'Georgia, "Times New Roman", serif', label: '衬线（英文）' },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-ink-line p-3 space-y-2.5">
      <div className="text-[12.5px] font-semibold text-ink-text">{title}</div>
      {children}
    </div>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <div className="w-[104px] shrink-0 text-[12px] text-ink-text-2 pt-1 leading-snug">{label}</div>
      <div className="flex-1 min-w-0">
        {children}
        {hint && <div className="text-[11px] text-ink-text-3 mt-1 leading-snug">{hint}</div>}
      </div>
    </div>
  )
}

/**
 * 全局设置（编辑器级，localStorage 持久化，跨文档生效）
 * v1.4.0：8 个分组、30+ 控件，并支持「将排版默认值应用到当前文档」。
 */
export function SettingsDialog() {
  const open = useUI((s) => s.modals.settings)
  const close = useUI((s) => s.closeModal)
  const leftOpen = useUI((st) => st.leftOpen)
  const rightOpen = useUI((st) => st.rightOpen)
  const docBlocks = useDoc((st) => st.doc.blocks.length)

  // 本地草稿：打开时从当前 store 初始化，保存时才提交
  const [draft, setDraft] = useState<EditorSettings>(() => {
    const s = useUI.getState()
    return {
      ...s,
      typo: { ...s.typo },
      writing: { ...s.writing },
      material: { ...s.material },
      exportD: { ...s.exportD },
      perf: { ...s.perf },
      shortcuts: { ...s.shortcuts },
    }
  })
  // 重新打开时重置草稿
  useEffect(() => {
    if (!open) return
    const s = useUI.getState()
    setDraft({
      ...s,
      typo: { ...s.typo },
      writing: { ...s.writing },
      material: { ...s.material },
      exportD: { ...s.exportD },
      perf: { ...s.perf },
      shortcuts: { ...s.shortcuts },
    })
    const ex = loadExtra()
    setLang(ex.lang ?? 'zh-CN')
    setCmdHints(ex.cmdHints ?? true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const [lang, setLang] = useState<string>('zh-CN')
  const [cmdHints, setCmdHints] = useState<boolean>(true)

  const upd = (patch: Partial<EditorSettings>) => setDraft((d) => ({ ...d, ...patch }))
  const updTypo = (patch: Partial<TypoDefaults>) => setDraft((d) => ({ ...d, typo: { ...d.typo, ...patch } }))
  const updWriting = (patch: Partial<WritingAssist>) => setDraft((d) => ({ ...d, writing: { ...d.writing, ...patch } }))
  const updMaterial = (patch: Partial<MaterialDefaults>) => setDraft((d) => ({ ...d, material: { ...d.material, ...patch } }))
  const updExport = (patch: Partial<ExportDefaults>) => setDraft((d) => ({ ...d, exportD: { ...d.exportD, ...patch } }))
  const updPerf = (patch: Partial<PerfDefaults>) => setDraft((d) => ({ ...d, perf: { ...d.perf, ...patch } }))
  const updShortcut = (action: string, combo: string) => setDraft((d) => ({ ...d, shortcuts: { ...d.shortcuts, [action]: combo } }))

  const onSave = () => {
    useUI.getState().applySettings(draft)
    saveExtra({ lang, cmdHints })
    document.documentElement.lang = lang
    document.body.dataset.cmdShortcuts = String(cmdHints)
    useUI.getState().closeModal('settings')
    toast('设置已保存', 'success')
  }

  const onImport = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        const s = useUI.getState()
        const merged: EditorSettings = {
          ...s,
          ...parsed,
          typo: { ...s.typo, ...(parsed.typo ?? {}) },
          writing: { ...s.writing, ...(parsed.writing ?? {}) },
          material: { ...s.material, ...(parsed.material ?? {}) },
          exportD: { ...s.exportD, ...(parsed.exportD ?? {}) },
          perf: { ...s.perf, ...(parsed.perf ?? {}) },
          shortcuts: { ...s.shortcuts, ...(parsed.shortcuts ?? {}) },
        }
        setDraft(merged)
        useUI.getState().applySettings(merged)
        if (parsed.lang) { setLang(parsed.lang); document.documentElement.lang = parsed.lang }
        if (typeof parsed.cmdHints === 'boolean') { setCmdHints(parsed.cmdHints); document.body.dataset.cmdHints = String(parsed.cmdHints) }
        toast('已导入设置', 'success')
      } catch {
        toast('导入失败：JSON 解析错误', 'error')
      }
    }
    reader.readAsText(file)
  }

  const onApplyDefaults = () => {
    if (!window.confirm('将当前排版默认值应用到本文档的所有区块？已显式设置的样式不会被覆盖。此操作会先自动创建一次快照。')) return
    useDoc.getState().applyDefaultsToCurrent()
    toast('已应用排版默认到当前文档', 'success')
  }

  // 快捷键冲突检测
  const comboCount: Record<string, number> = {}
  for (const v of Object.values(draft.shortcuts)) {
    if (!v) continue
    comboCount[v] = (comboCount[v] ?? 0) + 1
  }

  if (!open) return null

  return (
    <Modal open={open} onClose={() => close('settings')} width={620} fullHeight>
      <div className="flex flex-col h-full">
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 h-12 border-b border-ink-line bg-white shrink-0">
          <div className="text-[14px] font-semibold text-ink-text">全局设置</div>
          <div className="flex items-center gap-2">
            <button className="btn btn-soft btn-sm" onClick={() => close('settings')}>取消</button>
            <button className="btn btn-primary btn-sm" onClick={onSave}>保存</button>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-3 pb-4 space-y-3">
          {/* ---------------- 通用 ---------------- */}
          <Section title="通用">
            <Row label="界面语言">
              <Select value={lang} onChange={(v) => { setLang(v); document.documentElement.lang = v; saveExtra({ lang: v }) }}
                options={[{ value: 'zh-CN', label: '简体中文' }, { value: 'en', label: 'English' }]} className="max-w-[200px]" />
            </Row>
            <Row label="UI 字号缩放">
              <div className="max-w-[260px]"><Slider value={draft.uiScale} min={0.85} max={1.25} step={0.01} onChange={(v) => upd({ uiScale: Number(v.toFixed(2)) })} /></div>
              <div className="text-[11px] text-ink-text-3 mt-0.5">整体界面缩放 {Math.round(draft.uiScale * 100)}%</div>
            </Row>
            <Row label="Tab 栏常驻">
              <Toggle value={draft.tabBarPinned} onChange={(v) => upd({ tabBarPinned: v })} />
            </Row>
            <Row label="画布背景">
              <Segmented value={draft.canvasBg} onChange={(v) => upd({ canvasBg: v })}
                options={[
                  { value: 'grid', label: '网格' },
                  { value: 'dots', label: '圆点' },
                  { value: 'solid', label: '纯色' },
                  { value: 'custom', label: '自定义' },
                ]} size="sm" />
            </Row>
            <Row label="左栏显隐">
              <Toggle value={leftOpen} onChange={(v) => useUI.setState({ leftOpen: v })} />
              <div className="text-[11px] text-ink-text-3 mt-0.5">组件 / 素材 / 大纲 / 库</div>
            </Row>
            <Row label="右栏显隐">
              <Toggle value={rightOpen} onChange={(v) => useUI.setState({ rightOpen: v })} />
              <div className="text-[11px] text-ink-text-3 mt-0.5">属性 / 样式 / 主题 / 文档</div>
            </Row>
            <Row label="命令面板快捷键">
              <Toggle value={cmdHints} onChange={(v) => { setCmdHints(v); document.body.dataset.cmdShortcuts = String(v); saveExtra({ cmdHints: v }) }} />
              <div className="text-[11px] text-ink-text-3 mt-0.5">在命令面板中显示每项操作的快捷键提示</div>
            </Row>
            <Row label="状态栏">
              <Toggle value={draft.showStatusBar} onChange={(v) => upd({ showStatusBar: v })} />
            </Row>
            <Row label="主题色">
              <ColorField value={draft.accent} onChange={(c) => c && upd({ accent: c })} />
            </Row>
            <Row label="UI 主题">
              <Segmented<UiTheme> value={draft.uiTheme} onChange={(v) => upd({ uiTheme: v })}
                options={[{ value: 'light', label: '浅色' }, { value: 'paper', label: '纸张' }, { value: 'dark', label: '暗色' }]} size="sm" />
            </Row>
            <Row label="正文最大宽度">
              <div className="flex items-center gap-1.5">
                <NumberInput value={draft.maxWidth} min={320} max={900} onChange={(v) => upd({ maxWidth: Math.min(900, Math.max(320, Math.round(v ?? 677))) })} />
                <span className="text-[12px] text-ink-text-3">px</span>
                <div className="flex gap-1 ml-1">
                  {[[578, 'iPhone'], [677, '默认'], [750, '宽版']].map(([v, l]) => (
                    <button key={v as number} className={`btn btn-xs ${draft.maxWidth === v ? 'btn-primary' : 'btn-soft'}`}
                      onClick={() => upd({ maxWidth: v as number })}>{l}</button>
                  ))}
                </div>
              </div>
            </Row>
          </Section>

          {/* ---------------- 排版默认值 ---------------- */}
          <Section title="排版默认值（对新区块 / 应用默认值生效）">
            <Row label="默认字号">
              <div className="flex items-center gap-1.5">
                <NumberInput value={draft.typo.defaultFontSize} min={12} max={22} onChange={(v) => updTypo({ defaultFontSize: Math.min(22, Math.max(12, Math.round(v ?? 15))) })} />
                <span className="text-[12px] text-ink-text-3">px</span>
              </div>
            </Row>
            <Row label="默认行高">
              <NumberInput value={draft.typo.defaultLineHeight} min={1.2} max={2.6} step={0.05}
                onChange={(v) => updTypo({ defaultLineHeight: Math.min(2.6, Math.max(1.2, Number((v ?? 1.75).toFixed(2)))) })} />
            </Row>
            <Row label="默认字体">
              <Select value={draft.typo.defaultFont} onChange={(v) => updTypo({ defaultFont: v })} options={FONT_OPTIONS} className="max-w-[220px]" />
            </Row>
            <Row label="默认字重">
              <div className="max-w-[260px]"><Slider value={draft.typo.defaultFontWeight} min={300} max={700} step={100} onChange={(v) => updTypo({ defaultFontWeight: v })} /></div>
            </Row>
            <Row label="字间距">
              <NumberInput value={draft.typo.defaultLetterSpacing} min={-2} max={10} step={0.1} suffix="px"
                onChange={(v) => updTypo({ defaultLetterSpacing: Number((v ?? 0).toFixed(2)) })} />
            </Row>
            <Row label="两端对齐">
              <Toggle value={draft.typo.defaultJustify} onChange={(v) => updTypo({ defaultJustify: v })} />
              <div className="text-[11px] text-ink-text-3 mt-0.5">未显式设置对齐时，正文默认两端对齐</div>
            </Row>
            <Row label="首行缩进 2 字符">
              <Toggle value={draft.typo.defaultFirstLineIndent} onChange={(v) => updTypo({ defaultFirstLineIndent: v })} />
            </Row>
            <Row label="段落间距">
              <NumberInput value={draft.typo.defaultParaSpacing} min={0} max={48} suffix="px" onChange={(v) => updTypo({ defaultParaSpacing: Math.max(0, Math.round(v ?? 16)) })} />
            </Row>
            <Row label="标题层级深度">
              <div className="w-[180px]"><NumberInput value={draft.typo.headingMaxDepth} min={1} max={4} onChange={(v) => updTypo({ headingMaxDepth: Math.min(4, Math.max(1, Math.round(v ?? 4))) })} /></div>
              <div className="text-[11px] text-ink-text-3 mt-0.5">标题样式支持的最大层级（1–4）</div>
            </Row>
            <Row label="引用样式">
              <Select value={draft.typo.quoteStyle} onChange={(v) => updTypo({ quoteStyle: v })}
                options={[
                  { value: 'bar', label: '竖线' },
                  { value: 'quote-mark', label: '引号' },
                  { value: 'card', label: '卡片' },
                  { value: 'minimal', label: '极简' },
                ]} className="max-w-[200px]" />
            </Row>
            <Row label="列表样式">
              <Select value={draft.typo.listStyle} onChange={(v) => updTypo({ listStyle: v })}
                options={[
                  { value: 'disc', label: '实心圆点' },
                  { value: 'decimal', label: '数字' },
                  { value: 'circle', label: '空心圆' },
                  { value: 'square', label: '方块' },
                  { value: 'cjk-circle', label: '中文带圈' },
                ]} className="max-w-[200px]" />
            </Row>
            <Row label="代码字体">
              <input className="input max-w-[240px]" value={draft.typo.codeFont} placeholder="monospace"
                onChange={(e) => updTypo({ codeFont: e.target.value })} />
            </Row>
            <Row label="行内代码配色">
              <ColorField value={draft.typo.inlineCodeColor} onChange={(c) => c && updTypo({ inlineCodeColor: c })} />
            </Row>
          </Section>

          {/* ---------------- 写作辅助 ---------------- */}
          <Section title="写作辅助">
            <Row label="标点纠错">
              <Toggle value={draft.writing.punctuationFix} onChange={(v) => updWriting({ punctuationFix: v })} />
            </Row>
            <Row label="中英空格">
              <Toggle value={draft.writing.cjkSpacing} onChange={(v) => updWriting({ cjkSpacing: v })} />
            </Row>
            <Row label="引号成对">
              <Toggle value={draft.writing.quotePair} onChange={(v) => updWriting({ quotePair: v })} />
            </Row>
            <Row label="错别字白名单">
              <textarea className="input min-h-[52px] resize-y" value={draft.writing.typoWhitelist}
                placeholder="每行一个允许保留的词，例如：线性相关" onChange={(e) => updWriting({ typoWhitelist: e.target.value })} />
            </Row>
            <Row label="敏感词">
              <textarea className="input min-h-[52px] resize-y" value={draft.writing.sensitiveWords}
                placeholder="逗号分隔或每行一个，导出前校验" onChange={(e) => updWriting({ sensitiveWords: e.target.value })} />
            </Row>
            <Row label="字数达标阈值">
              <NumberInput value={draft.writing.wordGoal} min={0} max={100000} suffix="字"
                onChange={(v) => updWriting({ wordGoal: Math.max(0, Math.round(v ?? 0)) })} />
              <div className="text-[11px] text-ink-text-3 mt-0.5">0 表示不限制</div>
            </Row>
            <Row label="番茄钟">
              <Toggle value={draft.writing.pomodoro} onChange={(v) => updWriting({ pomodoro: v })} />
            </Row>
            <Row label="自动备份间隔">
              <NumberInput value={draft.writing.autoBackupInterval} min={30} max={3600} suffix="秒"
                onChange={(v) => updWriting({ autoBackupInterval: Math.min(3600, Math.max(30, Math.round(v ?? 300))) })} />
            </Row>
          </Section>

          {/* ---------------- 素材 / 库 ---------------- */}
          <Section title="素材 / 库">
            <Row label="默认插入方式">
              <Select value={draft.material.defaultInsertMode} onChange={(v) => updMaterial({ defaultInsertMode: v })}
                options={[
                  { value: 'cursor', label: '光标处' },
                  { value: 'end', label: '文末' },
                  { value: 'selection', label: '选区替换' },
                ]} className="max-w-[200px]" />
            </Row>
            <Row label="插入自动压缩">
              <Toggle value={draft.material.autoCompressOnInsert} onChange={(v) => updMaterial({ autoCompressOnInsert: v })} />
            </Row>
            <Row label="图片懒加载阈值">
              <NumberInput value={draft.material.imageLazyThreshold} min={0} max={2000} suffix="px"
                onChange={(v) => updMaterial({ imageLazyThreshold: Math.max(0, Math.round(v ?? 300)) })} />
            </Row>
            <Row label="SVG 动画触发">
              <Select value={draft.material.svgAnimTrigger} onChange={(v) => updMaterial({ svgAnimTrigger: v })}
                options={[
                  { value: 'auto', label: '自动播放' },
                  { value: 'click', label: '点击' },
                  { value: 'longpress', label: '长按' },
                  { value: 'hover', label: '悬停' },
                ]} className="max-w-[200px]" />
            </Row>
            <Row label="在线素材优先级">
              <Select value={draft.material.onlineProviderPriority} onChange={(v) => updMaterial({ onlineProviderPriority: v })}
                options={[
                  { value: 'unsplash', label: 'Unsplash' },
                  { value: 'pixabay', label: 'Pixabay' },
                  { value: 'pexels', label: 'Pexels' },
                ]} className="max-w-[200px]" />
            </Row>
            <Row label="Lottie 渲染级别">
              <Select value={draft.material.lottieRenderLevel} onChange={(v) => updMaterial({ lottieRenderLevel: v })}
                options={[
                  { value: 'smil', label: 'SMIL（兼容最佳）' },
                  { value: 'frames', label: '帧序列' },
                  { value: 'gif', label: 'GIF' },
                  { value: 'static', label: '静态首帧' },
                ]} className="max-w-[220px]" />
            </Row>
          </Section>

          {/* ---------------- 导出 ---------------- */}
          <Section title="导出">
            <Row label="导出预设">
              <Select value={draft.exportD.preset} onChange={(v) => updExport({ preset: v })}
                options={[
                  { value: 'wechat', label: '微信公众号' },
                  { value: 'zhihu', label: '知乎' },
                  { value: 'juejin', label: '掘金' },
                  { value: 'generic', label: '通用' },
                ]} className="max-w-[200px]" />
            </Row>
            <Row label="剥离注释/类">
              <Toggle value={draft.exportD.stripComments} onChange={(v) => updExport({ stripComments: v })} />
              <div className="text-[11px] text-ink-text-3 mt-0.5">导出时移除 HTML 注释与 className，体积更小</div>
            </Row>
            <Row label="文件名模板">
              <input className="input" value={draft.exportD.filenameTpl} placeholder="{title}-{date}"
                onChange={(e) => updExport({ filenameTpl: e.target.value })} />
              <div className="text-[11px] text-ink-text-3 mt-0.5">可用变量：{'{title}'} {'{date}'} {'{id}'}</div>
            </Row>
            <Row label="自动复制剪贴板">
              <Toggle value={draft.exportD.autoCopyClipboard} onChange={(v) => updExport({ autoCopyClipboard: v })} />
            </Row>
            <Row label="导出后动作">
              <Select value={draft.exportD.afterExport} onChange={(v) => updExport({ afterExport: v })}
                options={[
                  { value: 'none', label: '无' },
                  { value: 'open', label: '打开预览' },
                  { value: 'copy', label: '复制 HTML' },
                ]} className="max-w-[200px]" />
            </Row>
            <Row label="图片格式">
              <Select value={draft.exportD.imageFormat} onChange={(v) => updExport({ imageFormat: v })}
                options={[
                  { value: 'jpeg', label: 'JPEG' },
                  { value: 'webp', label: 'WebP' },
                  { value: 'avif', label: 'AVIF' },
                ]} className="max-w-[200px]" />
            </Row>
            <Row label="缩略图宽度">
              <NumberInput value={draft.exportD.thumbWidth} min={120} max={1280} suffix="px"
                onChange={(v) => updExport({ thumbWidth: Math.min(1280, Math.max(120, Math.round(v ?? 480))) })} />
            </Row>
            <Row label="附封面图">
              <Toggle value={draft.exportD.coverAttached} onChange={(v) => updExport({ coverAttached: v })} />
            </Row>
          </Section>

          {/* ---------------- 性能 / 存储 ---------------- */}
          <Section title="性能 / 存储">
            <Row label="历史快照保留">
              <NumberInput value={draft.perf.historyKeep} min={5} max={200} suffix="步"
                onChange={(v) => updPerf({ historyKeep: Math.min(200, Math.max(5, Math.round(v ?? 60))) })} />
            </Row>
            <Row label="素材自动清理">
              <NumberInput value={draft.perf.assetAutoCleanDays} min={0} max={365} suffix="天"
                onChange={(v) => updPerf({ assetAutoCleanDays: Math.max(0, Math.round(v ?? 30)) })} />
              <div className="text-[11px] text-ink-text-3 mt-0.5">0 表示不清理</div>
            </Row>
            <Row label="重置前备份">
              <Toggle value={draft.perf.backupBeforeReset} onChange={(v) => updPerf({ backupBeforeReset: v })} />
            </Row>
            <Row label="诊断日志级别">
              <Select value={draft.perf.diagLogLevel} onChange={(v) => updPerf({ diagLogLevel: v })}
                options={[
                  { value: 'error', label: 'Error' },
                  { value: 'warn', label: 'Warn' },
                  { value: 'info', label: 'Info' },
                  { value: 'debug', label: 'Debug' },
                ]} className="max-w-[160px]" />
            </Row>
            <Row label="Web Vitals 浮窗">
              <Toggle value={draft.perf.webVitals} onChange={(v) => updPerf({ webVitals: v })} />
            </Row>
          </Section>

          {/* ---------------- 快捷键 ---------------- */}
          <Section title="快捷键">
            <div className="space-y-1.5">
              {Object.entries(draft.shortcuts).map(([action, combo]) => {
                const dup = combo ? (comboCount[combo] ?? 0) > 1 : false
                return (
                  <div key={action} className="flex items-center gap-2">
                    <div className="w-[104px] shrink-0 text-[12px] text-ink-text-2">{action}</div>
                    <input
                      className={`input font-mono ${dup ? 'border-[#D64545] ring-1 ring-[#D64545]' : ''}`}
                      value={combo}
                      placeholder="未设置"
                      onChange={(e) => updShortcut(action, e.target.value)}
                    />
                    {dup && <span className="text-[11px] text-[#D64545] shrink-0">冲突</span>}
                  </div>
                )
              })}
            </div>
            <div className="text-[11px] text-ink-text-3">重复的组合会高亮为「冲突」；保存后立即生效。</div>
          </Section>

          {/* ---------------- 账号 / 同步 ---------------- */}
          <Section title="账号 / 同步">
            <Row label="多账号">
              <button className="btn btn-soft btn-sm" onClick={() => useUI.getState().openModal('accounts')}>公众号多账号管理</button>
            </Row>
            <Row label="云同步">
              <Toggle value={false} onChange={() => toast('云同步为演示功能，暂未开启', 'info')} />
              <div className="text-[11px] text-ink-text-3 mt-0.5">跨设备同步设置（演示，当前为本地持久化）</div>
            </Row>
            <Row label="导入 / 导出">
              <div className="flex gap-2">
                <button className="btn btn-soft btn-sm" onClick={() => downloadText(JSON.stringify(draft, null, 2), 'inkforge-settings.json')}>导出全部设置</button>
                <label className="btn btn-soft btn-sm cursor-pointer">
                  导入设置
                  <input type="file" accept="application/json,.json" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = '' }} />
                </label>
              </div>
            </Row>
          </Section>

          {/* ---------------- 应用到当前文档 ---------------- */}
          <Section title="应用到当前文档">
            <div className="flex items-center gap-3">
              <button className="btn btn-primary btn-sm" disabled={docBlocks === 0} onClick={onApplyDefaults}>
                将默认值应用到当前打开文档
              </button>
              <span className="text-[11px] text-ink-text-3">用排版默认值填充所有未显式设置样式的区块（非破坏式），执行前自动快照。</span>
            </div>
          </Section>

          <div className="text-[11px] text-ink-text-3 flex items-center gap-1.5 pt-1">
            设置保存在本机（localStorage），跨文档、跨会话生效。
            <button className="ml-auto text-[11px] text-[#2C6BED] hover:underline"
              onClick={() => { localStorage.removeItem('inkforge-settings'); toast('已恢复默认设置，刷新后生效') }}>恢复默认</button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
