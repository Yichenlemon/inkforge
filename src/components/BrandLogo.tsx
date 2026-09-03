import React from 'react'

/**
 * InkForge 品牌标识（v2）：
 * 概念 — "微信编辑器 + 元素框嵌套 + 一颗墨滴灵感"
 * - 圆角方框：暗喻微信编辑器外页面 / 富文本容器
 * - 内嵌小框 + 描边：暗喻 frame 嵌套 / 组合 / 拆分
 * - 右上角小亮点：墨滴（Ink）
 *
 * 支持任意 size，可选是否显示文字。默认主色 #2C6BED。
 */
export interface BrandLogoProps {
  size?: number
  showText?: boolean
  /** 文字下方副标题，如「微信超级可视化编辑器」 */
  subtitle?: string
  /** 是否圆角背景块（默认 false，纯 SVG） */
  withBg?: boolean
  /** 主色 */
  color?: string
  /** 副色（点 / 背景） */
  accent?: string
}

export function BrandLogo({
  size = 28,
  showText = true,
  subtitle = '微信超级可视化编辑器',
  withBg = false,
  color = '#2C6BED',
  accent = '#1D9E75',
}: BrandLogoProps) {
  return (
    <div className="flex items-center gap-2 select-none">
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="InkForge Logo"
      >
        {withBg && (
          <rect x="0" y="0" width="48" height="48" rx="12" fill={color} />
        )}
        {!withBg && (
          <rect
            x="3.5" y="3.5"
            width="41" height="41"
            rx="10"
            fill={`url(#brand-bg-${size})`}
            stroke={color}
            strokeWidth="2"
          />
        )}
        <defs>
          <linearGradient id={`brand-bg-${size}`} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#F0F4FF" />
            <stop offset="100%" stopColor="#E0EAFF" />
          </linearGradient>
        </defs>
        {/* 嵌套小框：暗喻元素框 / frame / 组合 */}
        <rect
          x="11" y="13"
          width="20" height="22"
          rx="4"
          fill="white"
          stroke={color}
          strokeWidth="2"
        />
        {/* 内框 - 半透明蓝叠加层，形成层叠视觉 */}
        <rect
          x="17" y="20"
          width="20" height="22"
          rx="4"
          fill={color}
          fillOpacity="0.18"
          stroke={color}
          strokeWidth="2"
        />
        {/* 墨滴（Ink drop）：右上角点亮 */}
        <circle cx="36" cy="11" r="3.5" fill={accent} />
        <circle cx="36" cy="11" r="1.6" fill="white" />
        {/* 中间画一条短虚线模拟"分隔线 / 文案线索" */}
        <line
          x1="19" y1="27"
          x2="27" y2="27"
          stroke={color}
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity="0.55"
        />
      </svg>
      {showText && (
        <div className="leading-tight">
          <div className="font-semibold tracking-tight" style={{ fontSize: Math.max(13, size * 0.5), color }}>
            InkForge
          </div>
          {subtitle && (
            <div
              className="text-ink-text-3 -mt-0.5"
              style={{ fontSize: Math.max(10, size * 0.32) }}
            >
              {subtitle}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** 浏览器 favicon 用，纯 inline SVG → data URL 返回 */
export function brandFaviconDataUri(color = '#2C6BED', accent = '#1D9E75'): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
    <rect x="3.5" y="3.5" width="41" height="41" rx="10" fill="url(#bg)" stroke="${color}" stroke-width="2"/>
    <linearGradient id="bg" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#F0F4FF"/><stop offset="100%" stop-color="#E0EAFF"/>
    </linearGradient>
    <rect x="11" y="13" width="20" height="22" rx="4" fill="white" stroke="${color}" stroke-width="2"/>
    <rect x="17" y="20" width="20" height="22" rx="4" fill="${color}" fill-opacity="0.18" stroke="${color}" stroke-width="2"/>
    <circle cx="36" cy="11" r="3.5" fill="${accent}"/>
    <circle cx="36" cy="11" r="1.6" fill="white"/>
    <line x1="19" y1="27" x2="27" y2="27" stroke="${color}" stroke-width="1.6" stroke-linecap="round" opacity="0.55"/>
  </svg>`.replace(/\n\s*/g, '')
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export default BrandLogo
