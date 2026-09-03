import React from 'react'
import { Settings as SettingsIcon, Info } from 'lucide-react'
import { Modal, Toggle, NumberInput, Segmented, ColorField, Select, Slider, Field, toast } from '../lib/ui.js'
import { useUI, type UiTheme } from '../store/useUI.js'

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
      <div className="w-[88px] shrink-0 text-[12px] text-ink-text-2 pt-1">{label}</div>
      <div className="flex-1 min-w-0">
        {children}
        {hint && <div className="text-[11px] text-ink-text-3 mt-0.5 leading-snug">{hint}</div>}
      </div>
    </div>
  )
}

/**
 * 全局设置（编辑器级，localStorage 持久化，跨文档生效）
 */
export function SettingsDialog() {
  const open = useUI((s) => s.modals.settings)
  const close = useUI((s) => s.closeModal)
  const s = useUI()

  const set = (patch: Parameters<typeof s.applySettings>[0]) => s.applySettings(patch)

  return (
    <Modal open={open} onClose={() => close('settings')} title="全局设置" width={560}>
      <div className="space-y-3">
        <Section title="通用">
          <Row label="界面主题">
            <Segmented<UiTheme>
              value={s.uiTheme}
              onChange={(v) => set({ uiTheme: v })}
              options={[
                { value: 'light', label: '浅色' },
                { value: 'paper', label: '纸张' },
                { value: 'dark', label: '暗色' },
              ]}
            />
            <div className="text-[11px] text-ink-text-3 mt-1">暗色仅作用于编辑区外壳，正文预览仍保持公众号浅色，便于对照排版。</div>
          </Row>
          <Row label="强调色">
            <ColorField value={s.accent} onChange={(c) => c && set({ accent: c })} />
          </Row>
          <Row label="显示状态栏">
            <Toggle value={s.showStatusBar} onChange={(v) => set({ showStatusBar: v })} />
            <div className="text-[11px] text-ink-text-3 mt-1">编辑器底部的实时字数 / 选区 / 视图状态条。</div>
          </Row>
          <Row label="正文最大宽度">
            <div className="flex items-center gap-1.5">
              <NumberInput value={s.maxWidth} onChange={(v) => set({ maxWidth: Math.min(900, Math.max(320, Math.round(v ?? 677))) })} />
              <span className="text-[12px] text-ink-text-3">px</span>
              <div className="flex gap-1 ml-1">
                {[[578, ' iPhone'], [677, '默认'], [750, '宽版']].map(([v, l]) => (
                  <button key={v as number} className={`btn btn-xs ${s.maxWidth === v ? 'btn-primary' : 'btn-soft'}`}
                    onClick={() => set({ maxWidth: v as number })}>{l}</button>
                ))}
              </div>
            </div>
          </Row>
        </Section>

        <Section title="编辑默认值（仅对新文档生效）">
          <Row label="默认作者">
            <input className="input" placeholder="留空则文章不显示作者" value={s.defaultAuthor}
              onChange={(e) => set({ defaultAuthor: e.target.value })} />
          </Row>
          <Row label="默认字体">
            <Select value={s.defaultFont} onChange={(v) => set({ defaultFont: v })} options={FONT_OPTIONS} className="max-w-[200px]" />
          </Row>
          <Row label="默认字号">
            <div className="flex items-center gap-1.5">
              <NumberInput value={s.defaultFontSize} min={12} max={22} onChange={(v) => set({ defaultFontSize: Math.min(22, Math.max(12, Math.round(v ?? 15))) })} />
              <span className="text-[12px] text-ink-text-3">px</span>
            </div>
          </Row>
          <Row label="默认行高">
            <div className="flex items-center gap-1.5">
              <NumberInput value={s.defaultLineHeight} min={1.2} max={2.6} step={0.05} onChange={(v) => set({ defaultLineHeight: Math.min(2.6, Math.max(1.2, Number((v ?? 1.75).toFixed(2)))) }) } />
            </div>
          </Row>
          <Row label="自动保存">
            <Toggle value={s.autosave} onChange={(v) => set({ autosave: v })} />
            <div className="text-[11px] text-ink-text-3 mt-1">输入停顿约 4 秒后自动保存到本地数据库；关闭后仅 ⌘S 手动保存。</div>
          </Row>
        </Section>

        <Section title="导出">
          <Row label="保守模式">
            <Toggle value={s.stripAnimation} onChange={(v) => set({ stripAnimation: v })} />
            <div className="text-[11px] text-ink-text-3 mt-1">导出时把 SVG 动画降级为静态首帧，适合兼容性要求极高的发布场景。</div>
          </Row>
          <Row label="导出压缩图片">
            <Toggle value={s.compressImages} onChange={(v) => set({ compressImages: v })} />
          </Row>
          <Row label="图片质量">
            <div className="max-w-[240px]"><Slider value={s.imageQuality} min={40} max={100} onChange={(v) => set({ imageQuality: v })} /></div>
            <div className="text-[11px] text-ink-text-3 mt-1">图片编辑器「应用并压缩」时使用的 JPEG / WebP 质量。</div>
          </Row>
        </Section>

        <div className="text-[11px] text-ink-text-3 flex items-center gap-1.5">
          <Info size={11} /> 设置保存在本机（localStorage），跨文档、跨会话生效。
          <button className="ml-auto text-[11px] text-[#2C6BED] hover:underline"
            onClick={() => { localStorage.removeItem('inkforge-settings'); toast('已恢复默认设置，刷新后生效') }}>恢复默认</button>
        </div>
      </div>
    </Modal>
  )
}
