import React from 'react'
import { Settings as SettingsIcon } from 'lucide-react'
import { Modal, toast, Toggle, NumberInput } from '../lib/ui.js'
import { useUI } from '../store/useUI.js'

/**
 * 全局设置（编辑器级，localStorage 持久化，跨文档生效）
 */
export function SettingsDialog() {
  const open = useUI((s) => s.modals.settings)
  const close = useUI((s) => s.closeModal)
  const maxWidth = useUI((s) => s.maxWidth)
  const setMaxWidth = useUI((s) => s.setMaxWidth)
  const stripAnimation = useUI((s) => s.stripAnimation)
  const setStripAnimation = useUI((s) => s.setStripAnimation)
  const autosave = useUI((s) => s.autosave)
  const setAutosave = useUI((s) => s.setAutosave)

  return (
    <Modal open={open} onClose={() => close('settings')} title="全局设置" width={520}>
      <div className="space-y-3">
        <div className="rounded-lg border border-ink-line p-3">
          <div className="text-[13px] font-semibold mb-2">画布与导出</div>
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] text-ink-text-2 shrink-0">正文最大宽度</span>
            <NumberInput value={maxWidth} onChange={(v) => setMaxWidth(Math.min(900, Math.max(320, Math.round(v || 677))))} />
            <span className="text-[12px] text-ink-text-3">px</span>
            <div className="flex gap-1 ml-1">
              {[[578, ' iPhone'], [677, '默认'], [750, '宽版']].map(([v, l]) => (
                <button key={v as number} className={`btn btn-xs ${maxWidth === v ? 'btn-primary' : 'btn-soft'}`}
                  onClick={() => setMaxWidth(v as number)}>{l}</button>
              ))}
            </div>
          </div>
          <div className="text-[11px] text-ink-text-3 mt-1.5">影响画布显示宽度与编译产物的宽度基准。</div>
        </div>

        <label className="flex items-start gap-2.5 rounded-lg border border-ink-line px-3 py-2.5 cursor-pointer hover:bg-black/[0.02]">
          <Toggle value={stripAnimation} onChange={setStripAnimation} />
          <div>
            <div className="text-[12.5px] font-medium">保守模式：导出时剥离全部动效</div>
            <div className="text-[11px] text-ink-text-3 leading-snug">把 SVG 动画降级为静态首帧，适合对兼容性要求极高的发布场景。</div>
          </div>
        </label>

        <label className="flex items-start gap-2.5 rounded-lg border border-ink-line px-3 py-2.5 cursor-pointer hover:bg-black/[0.02]">
          <Toggle value={autosave} onChange={setAutosave} />
          <div>
            <div className="text-[12.5px] font-medium">自动保存</div>
            <div className="text-[11px] text-ink-text-3 leading-snug">输入停顿约 4 秒后自动保存到本地数据库；关闭后仅 ⌘S 手动保存。</div>
          </div>
        </label>

        <div className="text-[11px] text-ink-text-3 flex items-center gap-1">
          <SettingsIcon size={11} /> 设置保存在本机（localStorage），跨文档、跨会话生效。
        </div>
      </div>
    </Modal>
  )
}
