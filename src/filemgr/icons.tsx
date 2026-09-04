import React from 'react'
import {
  FolderOpen, Trash2, Pin, PinOff, Eye, Copy, Pencil, RotateCcw, FileText,
  Code2, Send, Link, Download, Plus, Tag, Folder, Quote, History, Upload,
  Image as ImageIcon, Wand2, FolderInput, Merge, Replace, Smartphone, Music,
  Video, Lock, Unlock, Star, FileImage, FileCode, Sparkles, Scissors,
} from 'lucide-react'

export type IconComponent = React.ComponentType<any>

const MAP: Record<string, IconComponent> = {
  FolderOpen, Trash2, Pin, PinOff, Eye, Copy, Pencil, RotateCcw, FileText,
  Code2, Send, Link, Download, Plus, Tag, Folder, Quote, History, Upload,
  Image: ImageIcon, Wand2, FolderInput, Merge, Replace, Smartphone, Music,
  Video, Lock, Unlock, Star, FileImage, FileCode, Sparkles, Scissors,
}

/** 把 REGISTRY 里以字符串形式存放的图标名映射到真实的 lucide 组件。 */
export function iconFor(name?: string): IconComponent | undefined {
  if (!name) return undefined
  return MAP[name]
}
