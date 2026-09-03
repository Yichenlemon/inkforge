# InkForge · 公众号超级可视化编辑器

> 一个面向微信公众号（公众号）的**全栈、可视化、可直接发布**的内容编辑器。
> 不只是「写文章」，而是把 **Markdown 互转 / 浮动图文混排 / 微信生态组件 / 字号精细控制 / 文档持久化与历史 / 商业级模板 / 一键部署** 全部打通的一体化创作工具。

[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-orange)](./RELEASE_NOTES.md)

---

## ✨ 核心特性

### 📝 富文本与块编辑器
- **块（Block）架构**：标题 / 段落 / 引用 / 列表 / 图片 / 图集 / 代码 / 表格 / 分割线 / 卡片 / 标注 / 时间线 / 步骤 / 折叠 / 按钮 / SVG / Lottie / 视频 / 音频 / 二维码 / 互动 / 自定义 HTML / 多列 / **微信生态** 等 20+ 种块。
- **拖拽排序**：基于 dnd-kit 的区块拖拽重排。
- **内联 / 浮动图片**：图片可选「通栏 / 左浮动 / 右浮动」与正文环绕；支持**缩放、拖动、旋转、翻转**，画布与导出完全一致。

### 🔤 字号与排版精细控制
- 每个块可单独设置 **字号、行高、字间距、对齐、缩进、颜色、背景、圆角、阴影、边框**。
- 修复了「改了字号不生效」的根因（主题默认值曾覆盖块级样式），现在块级字号**优先级高于主题默认**。

### 🧾 Markdown 模式（双向）
- **导入**：粘贴 Markdown → 实时预览 → 一键「追加到文末」或「转为区块（替换全文）」，列表/引用/代码/表格/图片都会变成可编辑的 Block。
- **导出**：当前文档一键导出为 Markdown，可复制或下载 `.md`，再粘回导入即可往返编辑。
- 修复了导出缺陷：分隔线不再丢失、表格正确转换为 GFM 表格（不再泄漏原始 HTML）。

### 💬 微信生态组件（真实可用，非占位）
- 支持 **小程序 / 视频号 / 微信小店** 三类生态卡片。
- 后端可抓取已发布公众号文章中的 `<mp-miniprogram>` 元数据，回填到编辑器；导出时生成**符合微信规范的组件代码注释**，同步回公众号后台即可恢复原生渲染。
- 纯 SMIL + CSS 实现，零 JavaScript，可过微信白名单清洗。

### 🗂 文档持久化与历史
- 基于 **better-sqlite3** 的本地数据库，文档自动保存，**不是一次性草稿**。
- 完整的**历史记录面板**：可查看每一步快照，并**跳转到任意历史状态**（撤销 / 重做 / 定点回滚）。
- 支持手动版本快照、复制副本、删除。

### 🏠 首页与模板
- 产品级首页：Hero Banner、真实数据卡片（文档数 / 字数 / 模板数 / 主题数 …）、最近文档封面、模板库（分类筛选）。
- **文档级模板**：9 套可直接商用的成品骨架（资讯 / 情感 / 干货 / 活动 / 招聘 / 测评 / 教程 / 长文 / 空白），新建即带封面、章节、引导关注等结构。

### 🧰 菜单栏与命令面板
- 文件 / 编辑 / 插入 / 视图 / 帮助 五类下拉菜单，覆盖新建、保存、快照、导入、导出（HTML / Markdown）、发布、撤销重做、区块操作、模式切换等。
- `⌘K` / `Ctrl+K` 命令面板，快速执行任意操作。

### 🚀 一键部署脚本（便携模式）
- `scripts/inkforge.sh`（Git Bash / WSL / macOS / Linux）与 `scripts/inkforge.bat`（Windows 双击）数字菜单：**检测环境 / 一键部署 / 启动 / 结束 / 卸载 / 清理**。
- **便携模式**：若包内自带 `runtime/` 目录（内置 Node.js 运行时），脚本优先使用它，目标机器**无需安装 Node / npm** 即可运行。

### ✅ 微信公众平台合规
- 内置 `wechatify` 清洗管线：剥离 `<script>`、JS、`onclick`、CSS `animation` / `transition` / `@keyframes` / `id` / `position`，仅保留 SMIL SVG、`<details>`、`:active` / `:checked` 等微信允许的写法。

---

## 🖥 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vite 5 · React 18 · TypeScript · Tailwind CSS · Zustand · lucide-react · dnd-kit · CodeMirror · Tiptap |
| 后端 | Express · tsx（TypeScript 直接运行）· better-sqlite3 |
| 转换 | markdown-it · turndown · turndown-plugin-gfm · shiki（代码高亮） |
| 构建 | Vite 单页构建产物由 Express 托管（生产模式单端口） |

---

## 📁 目录结构

```
inkforge/
├─ index.html              # 前端入口
├─ vite.config.ts          # Vite 配置（dev 代理 /api → :5177）
├─ scripts/
│  └─ inkforge.sh          # 终端数字菜单管理脚本
├─ shared/                 # 前后端共享类型与主题
├─ src/                    # 前端源码
│  ├─ components/          # 编辑器、区块视图、首页、菜单栏、对话框…
│  ├─ store/               # Zustand 状态（useDoc / useUI）
│  └─ lib/                 # API 客户端、组件库、文档模板
├─ server/                 # 后端源码
│  ├─ index.ts             # Express 入口（托管 API + dist）
│  ├─ db.ts                # better-sqlite3 数据库
│  ├─ lib/                 # 渲染 / 编译 / 转换 / 微信清洗
│  └─ routes/              # 文档 / 资源 / 编译 / 转换 / 工具 / 微信 …
├─ data/                   # 运行时数据（数据库、上传、导出），git 忽略
└─ dist/                   # 前端构建产物，git 忽略
```

---

## 🚀 快速开始

### 环境要求
- **从源码运行**：Node.js ≥ 18（推荐 22）、npm ≥ 9，Windows 建议用 Git Bash。
- **便携版（发布包）**：包内已内置 `runtime/`（Node 运行时）与 `node_modules`，**目标机器无需安装任何环境**，解压即用。

### 安装与开发
```bash
npm install          # 或 npm ci（有 lockfile 时）
npm run dev          # 同时启动 API(:5177) 与前端(:5173)
```
浏览器打开 http://localhost:5173

### 生产构建与启动
```bash
npm run build        # 构建前端 → dist/
npm start            # 启动 Express，单端口 5177 同时托管 API 与前端
```
浏览器打开 http://localhost:5177

### 端口说明
| 端口 | 用途 | 模式 |
|---|---|---|
| 5173 | Vite 开发服务器（含 HMR） | `npm run dev` |
| 5177 | API + 生产前端（托管 dist） | `npm start` / `npm run dev:api` |

---

## 🛠 一键管理脚本

```bash
# Git Bash / WSL / macOS / Linux
./scripts/inkforge.sh        # 进入数字菜单
./scripts/inkforge.sh detect  # 直接执行某项，跳过菜单
./scripts/inkforge.sh deploy
./scripts/inkforge.sh start
./scripts/inkforge.sh stop
./scripts/inkforge.sh uninstall
./scripts/inkforge.sh cleanup

# Windows（双击即可，无需 Git Bash）
scripts\inkforge.bat         # 进入数字菜单
scripts\inkforge.bat start   # 直接执行某项
```

菜单项：
1. 🔍 检测环境 —— node/npm/git/curl、依赖、dist、端口、数据目录
2. 📦 一键部署 —— `npm ci` + `vite build` + 初始化数据库
3. ▶️ 启动服务 —— 后台运行 `npm start`（单端口 5177），自动等待就绪
4. ⏹ 结束服务 —— 按 PID / 进程特征安全停止（兼容 Windows）
5. 🗑️ 卸载 —— 删除 `node_modules` 与 `dist`（**保留用户数据**）
6. 🧹 清理 —— 删除 `dist` / 日志 / 缓存（保留依赖与数据）
0. 🚪 退出

---

## 📦 版本发布包（便携版 · 解压即跑）

仓库 `releases/inkforge-<version>.zip` 为**自包含便携包**，**解压后无需在目标机器安装 Node / npm**：

- ✅ 内置 Node.js 运行时（`runtime/`，Windows 版随包提供，约 180 MB）
- ✅ 完整 `node_modules`（含 tsx / vite / better-sqlite3 等全部依赖与预编译原生模块）
- ✅ 已构建的 `dist/` 前端产物
- ✅ 前端 / 后端源码、管理脚本、文档

### 运行方式
1. 解压 `inkforge-<version>.zip`
2. Windows：双击 `scripts/inkforge.bat`；macOS / Linux / Git Bash：`bash scripts/inkforge.sh`
3. 菜单选 **3) 启动服务**，待出现 `http://localhost:5177`
4. 浏览器打开 http://localhost:5177 即可使用
5. 菜单 **4) 结束服务** 或关闭窗口停止

脚本会自动优先使用内置 `runtime/node`，仅在缺失时才回退系统 Node。更多说明见 [`RELEASE_NOTES.md`](./RELEASE_NOTES.md)。

---

## ✅ 微信公众平台合规说明

公众号文章对 HTML/CSS/JS 有严格限制。InkForge 的编译管线 `wechatify` 会在导出时做白名单清洗：
- ❌ 移除：`<script>`、内联/外部 JS、`onclick` 等事件属性、CSS `animation` / `transition` / `@keyframes`、`id` 属性、`position: fixed/absolute`。
- ✅ 保留：SMIL（`<animate>` / `<animateTransform>` / `<set>`）、`<details>`、`:active` / `:checked` 交互、语义化标签。
- 互动游戏、点击触发动画等复杂效果请使用 SMIL 方案实现（参考 `_ref/e2_goldminer` 中的拆解案例）。

> ⚠️ 第三方素材（如 E2.COOL 案例图）可能带有版权声明，请勿用于商业二次模板化。

---

## 🗺 路线图

- [ ] 协同编辑（多人实时）
- [ ] 更多微信生态组件（投票、卡券、直播）
- [ ] 云端同步与多端登录
- [ ] 模板市场与一键套用
- [ ] 导出为草稿直接同步公众号素材库

---

## 📄 许可证

[MIT](./LICENSE) © InkForge

---

## 🙏 致谢

- 微信编辑器生态思路参考：秀米、135 编辑器、E2.COOL
- 图标：lucide-react
- 代码高亮：shiki
