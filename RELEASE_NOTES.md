# InkForge v1.0.0 版本介绍

> **一句话**：InkForge 是一个面向微信公众号的全栈可视化编辑器，把「写、排、存、导、发」整成一条流水线——Markdown 互转、浮动图文混排、微信生态组件、精细字号控制、数据库持久化与历史、商业级模板、一键部署，开箱即用。

---

## 基本信息

| 项目 | 内容 |
|---|---|
| 版本号 | **1.0.0** |
| 发布日期 | 2026-09-03 |
| 许可协议 | MIT |
| 运行环境 | Node.js ≥ 18（推荐 22）、npm ≥ 9 |
| 默认端口 | API / 生产前端 `5177`；开发前端 `5173` |
| 数据库 | better-sqlite3（本地文件，无需额外服务） |

---

## 这个版本能做什么

### 1. 可视化块编辑器
- 20+ 种内容块：标题、段落、引用、列表、图片、图集、代码、表格、分割线、卡片、标注、时间线、步骤、折叠、按钮、SVG、Lottie、视频、音频、二维码、互动、自定义 HTML、多列、微信生态。
- 基于 dnd-kit 的区块拖拽排序。

### 2. 浮动图文混排（图片不再是独占一行）
- 图片布局三态：**通栏 / 左浮动 / 右浮动**，与正文自然环绕，画布与导出一致。
- 图片支持**缩放（百分比宽度）、画布内拖动、旋转、水平翻转**，均不污染历史记录（拖拽过程中静默更新，松手记一步）。

### 3. 字号与排版精细控制
- 每个块独立设置字号、行高、字间距、对齐、缩进、颜色、背景、圆角、阴影、边框。
- **已修复**：早期版本块级字号会被主题默认值静默覆盖（CSS 同属性取最后声明）。现块级样式优先于主题默认，引用 / 列表 / 标题 / 段落的字号均正确生效。

### 4. Markdown 模式（双向、可往返）
- **导入**：粘贴 Markdown → 实时预览 → 追加到文末 / 转为区块（替换全文）。标题、列表、引用、代码、表格、图片都会变成真实可编辑 Block。
- **导出**：当前文档导出为 Markdown，可复制或下载 `.md`。
- **已修复导出缺陷**：分隔线不再丢失；表格正确转为 GFM 表格（不再泄漏原始 `<table>` HTML）。

### 5. 微信生态组件（真实可用）
- 三类：**小程序 / 视频号 / 微信小店**。
- 后端可抓取已发布文章中的 `<mp-miniprogram>` 元数据回填；导出生成符合微信规范的组件代码注释，回公众号后台即可恢复原生渲染。
- 纯 SMIL + CSS、零 JS，可过微信白名单清洗。

### 6. 文档持久化与历史（非一次性草稿）
- better-sqlite3 本地库，自动保存。
- 历史记录面板：查看每步快照、**跳转到任意历史状态**（撤销 / 重做 / 定点回滚）。
- 支持手动快照、复制副本、删除。

### 7. 产品级首页与模板库
- 首页：Hero Banner、真实数据卡片、最近文档封面、模板库（分类筛选）。
- 9 套可直接商用的文档级模板（资讯 / 情感 / 干货 / 活动 / 招聘 / 测评 / 教程 / 长文 / 空白），新建即带封面、章节、引导关注等结构。

### 8. 菜单栏与命令面板
- 文件 / 编辑 / 插入 / 视图 / 帮助 五类菜单；`⌘K` / `Ctrl+K` 命令面板。

### 9. 一键部署脚本
- `scripts/inkforge.sh`：数字菜单执行 检测环境 / 一键部署 / 启动 / 结束 / 卸载 / 清理，兼容 Git Bash / WSL / macOS / Linux。

### 10. 微信公众平台合规
- `wechatify` 清洗管线：剥离 `<script>` / JS / `onclick` / CSS `animation` / `transition` / `@keyframes` / `id` / `position`，保留 SMIL、`<details>`、`:active` / `:checked`。

---

## 技术架构

```
前端 (Vite + React18 + TS)  ──HTTP/JSON──▶  后端 (Express + tsx)
  区块视图 / 首页 / 菜单栏              文档 API · 编译 · 转换 · 微信清洗
  Zustand 状态                          better-sqlite3 持久化
        ▲                                      │
        └──── 编译产物（HTML）回传，wechatify 清洗后用于公众号 ────┘
```

- 前端构建产物 `dist/` 由 Express 在生产模式下直接托管（单端口 5177）。
- 开发模式：`npm run dev` 同时拉起 API(5177) 与 Vite(5173)，Vite 代理 `/api`。

---

## 安装与运行

```bash
# 1. 安装依赖
npm install          # 或 npm ci

# 2A. 开发模式
npm run dev          # 打开 http://localhost:5173

# 2B. 生产模式
npm run build        # 生成 dist/
npm start            # 打开 http://localhost:5177
```

### 使用管理脚本（推荐）
```bash
./scripts/inkforge.sh        # 数字菜单
./scripts/inkforge.sh deploy # 一键部署
./scripts/inkforge.sh start  # 启动
./scripts/inkforge.sh stop   # 结束
```

---

## 版本发布包内容（releases/inkforge-1.0.0.zip · 便携版）

**自包含、解压即跑，目标机器无需安装 Node / npm。**

- ✅ 内置 Node.js 运行时 `runtime/`（Windows 版随包提供，约 180 MB）
- ✅ 完整 `node_modules`（含 tsx / vite / better-sqlite3 等全部依赖与预编译原生模块）
- ✅ 已构建 `dist/` 前端产物
- ✅ 完整前端 / 后端源码 + `scripts/`（含 `inkforge.sh` 与 Windows `inkforge.bat`）
- ✅ `README.md` / `RELEASE_NOTES.md` / `LICENSE` / `VERSION`

### 便携版运行方式
1. 解压 `inkforge-1.0.0.zip`
2. Windows：双击 `scripts/inkforge.bat`；macOS / Linux / Git Bash：`bash scripts/inkforge.sh`
3. 菜单选 **3) 启动服务**，待出现 `http://localhost:5177`
4. 浏览器打开 http://localhost:5177 即可使用
5. 菜单 **4) 结束服务** 或关闭窗口停止

管理脚本会优先使用内置 `runtime/node`，仅在缺失时回退系统 Node。若需自行从源码运行，仍是 `npm install && npm run build && npm start`。

---

## 已知限制

- 微信互动效果需使用 SMIL（`<animate>` / `<animateTransform>` / `<set>`），不支持 JS 驱动的复杂逻辑。
- 当前为单机本地存储，未做多用户 / 云端同步（见路线图）。
- 第三方素材（如 E2.COOL 案例图）可能带版权声明，请勿商业二次模板化。

---

## 升级说明

从源码运行无需额外迁移；数据库表结构由 `server/db.ts` 自动建表（`SCHEMA_VERSION` 演进时请备份 `data/inkforge.db`）。
