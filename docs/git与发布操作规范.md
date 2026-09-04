# InkForge · git 与发布操作规范（SOP）

> 目的：杜绝**擅自改版本号**、**漏查代码差异**、**覆盖旧版资产**等事故。
> 每次提交 / 发布，严格按本文档执行；完成后在 §4「发布记录」如实登记。

---

## 0. 铁律（最高优先级，违反即事故）

1. **版本号以用户明确指令为准**，绝不自行推测、升级或降级。用户说 1.3.0 就是 1.3.0。
2. **禁止假设「无功能变更」**。发布前**必须实际执行** `git log <上一tag>..main --oneline` 与
   `git diff --stat <上一tag> main` 核对差异，再决定是否重打便携包。
   > 2026-09-04 事故：未查提交记录就断言「1.3.0 与 1.2.0 代码相同」，实际相差 10 个提交、+2338 行功能代码。
3. **新功能一律开新 Release**：新 tag + 新 zip 名 + 新说明；
   **绝不复用旧脚本 UPDATE 覆盖旧版资产**（v1.0.0 是历史快照，永不可改）。
4. **版权红线**：commit 信息、Release 说明、打包内容均不得出现「壹伴」「抓取」字样与相关素材；
   打包脚本不做任何壹伴 `FORCE_INCLUDE`。
5. **PAT 仅内联使用**，绝不落盘、不写入 git config、不提交：
   - git：`git -c "url.https://${TOK}@github.com/.insteadOf=https://github.com/" push ...`
   - 脚本：`GH_TOKEN=${TOK} python outputs/xxx.py`
6. **Release 资产名一律用 ASCII**（中文名在 GitHub asset API 下会被吞成 `default.md`）。
7. 重新打包 / 上传 Release 前**必须先与用户确认**。

---

## 1. 日常提交流程

```bash
git status                 # 确认改动范围
git diff                   # 逐处确认
git add <明确的文件>        # 禁止 git add -A 混入无关产物
git commit -m "<type>: <中文描述>" -m "<补充：改了什么 / 为什么>"
git -c "url.https://${TOK}@github.com/.insteadOf=https://github.com/" push origin main
```

- 类型前缀：`feat / fix / docs / chore / refactor / perf`
- 提交前**自检**：信息中不得包含「壹伴」「抓取」。
- `data/`、`releases/`、`runtime/`、`outputs/` 均已 gitignore，不得入库。

---

## 2. 发布流程（发版）

### 2.1 发布前核查（必做）

```bash
git tag --list                          # 确认当前有哪些版本
git log v<上一版本>..main --oneline     # 列出自上一版以来的提交
git diff --stat v<上一版本> main | tail -5
```

判定规则：

| 差异内容 | 是否重打便携包 |
|---|---|
| 有 `feat`/`fix` 影响 `src/`、`server/`、`shared/` | **必须重打** |
| 仅 `docs/` 文档变更 | 可只发文档型 Release，但**须向用户说明并取得同意** |

### 2.2 构建便携包

```bash
npm run build                                   # 产出 dist/（生产前端）
python outputs/build_portable_zip_<ver>.py      # 产出 releases/inkforge-<ver>.zip
```

- 每次发版用**新脚本**（或新常量），**绝不修改旧版脚本 / 压缩包**。
- 打包**排除**：`.git`、`data`、`outputs`、`releases`、`.cache`、`.vite`、`__pycache__`、`_ref/`（版权红线）。
- 打包**包含**：`src/`、`server/`、`shared/`、`dist/`、`scripts/`、`runtime/`、`node_modules/`、`package.json` 等运行必需文件。

### 2.3 打 tag

```bash
git tag -a v<ver> -m "InkForge v<ver>：<简述>"
git -c "url.https://${TOK}@github.com/.insteadOf=https://github.com/" push origin v<ver>
```

### 2.4 建 GitHub Release 并上传资产

- 用 `outputs/make_release_<ver>.py`（新脚本、新 tag、新 zip 名、新说明）。
- 资产：便携包 `inkforge-<ver>.zip`（ASCII 名）；如需附带文档同样用 ASCII 名。
- Release 说明写明：本版本变更、与上一版的关系、注意事项。

### 2.5 发布后核查（必做）

- 列出远端 Release 与资产，确认**新版本存在**且 **v1.0.0 / v1.1.0 / v1.2.0 等旧版未被改动**。
- 本地与远程 tag 列表一致。
- `git status -sb` 显示与 origin 同步。

---

## 3. 出错回滚

| 事故 | 处理方式 |
|---|---|
| 版本号改错 | `git revert <错误commit>`（**不 force push**），再按流程发正确版本号 |
| 误发 Release | `DELETE /repos/{repo}/releases/{id}`；再 `git tag -d v<x>` + `git push origin --delete v<x>` |
| 资产名被吞成 `default.md` | `PATCH /repos/{repo}/releases/assets/{id}` 改回 ASCII 名 |
| 回滚完成后 | 在 §4「发布记录」**如实登记事故与纠正过程** |

---

## 4. 发布记录

### v1.3.0（2026-09-04）

- **代码基线**：v1.2.0 之后共 10 个提交
  - 元素框三阶段：`ed050cf`（拖拽嵌套 / PowerPoint 式缩放旋转 / 组合拆分 / 智能吸附）、
    `add8ab5`（修复跨区块移动、内联逆变换、编辑态渲染）、
    `daca2d7`（插入菜单直达入口、顶层区块拖入）、
    `c000279`（真实斜切变形、内联画布手柄、流式布局拖拽排序、子块组合拆分与整组移动、导出同步）
  - 交互组件新增 34 个、总数达 50：`b82b184`（14 个）、`4e7415b`（20 个）
  - 编辑器修复：`856246a`（悬浮工具栏 popover 闪退、素材库 React key 去重）
  - 文件管理模块设计稿：`ca9e11b`（`docs/文件管理模块设计.md`，§0–§18）
- **与 v1.2.0 差异**：20 个文件，+2338 / −54（**有实质功能代码，必须重打便携包**）
- **VERSION**：1.3.0
- **资产**：`inkforge-1.3.0.zip`（便携包）、`inkforge-1.3.0-design.md`（设计稿）
- **事故与纠正**：
  1. 误读指令把版本号从 1.3.0 改成 1.4.0（`4286f7e`）并发布 v1.4.0 Release
     → 已 `git revert`（`d31a6b2`）恢复 1.3.0，删除 v1.4.0 Release 与 tag，改发 v1.3.0。
  2. 未查提交记录就断言「与 1.2.0 代码相同、不必重打便携包」
     → 实测相差 10 提交 / +2338 行，已重打便携包并补发资产。

### v1.2.0（2026-09-04）

- 版权合规重构：移除第三方样式库接入与配套服务端路由，统一外链导入与组件提取表述。
- 资产：`inkforge-1.2.0.zip`

### v1.1.0 / v1.0.0

- 早期版本，历史快照，**永不可改**。
