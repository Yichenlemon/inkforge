#!/usr/bin/env bash
# =============================================================================
#  InkForge 一键管理脚本 (inkforge.sh)
#  在终端里输入数字即可执行：检测环境 / 一键部署 / 启动 / 结束 / 卸载 / 清理
#
#  适用终端：Git Bash (Windows) / WSL / macOS / Linux 的 bash
#  依赖：node >= 18（推荐 22）、npm、curl、unzip/zip（打包时）
#
#  用法：
#    ./scripts/inkforge.sh          # 进入数字菜单
#    ./scripts/inkforge.sh detect   # 直接执行某个任务（跳过菜单）
#    ./scripts/inkforge.sh deploy
#    ./scripts/inkforge.sh start
#    ./scripts/inkforge.sh stop
#    ./scripts/inkforge.sh uninstall
#    ./scripts/inkforge.sh cleanup
# =============================================================================

set -euo pipefail

# ---- 定位项目根目录（本脚本位于 <root>/scripts/ 下） ------------------------
SCRIPT_PATH="${BASH_SOURCE[0]:-$0}"
while [ -L "$SCRIPT_PATH" ]; do
  DIR="$(cd -P "$(dirname "$SCRIPT_PATH")" && pwd)"
  SCRIPT_PATH="$(readlink "$SCRIPT_PATH")"
  [[ "$SCRIPT_PATH" != /* ]] && SCRIPT_PATH="$DIR/$SCRIPT_PATH"
done
ROOT="$(cd -P "$(dirname "$SCRIPT_PATH")/.." && pwd)"
cd "$ROOT"

# ---- 版本 / 路径 ------------------------------------------------------------
VERSION="1.0.0"
API_PORT="${PORT:-5177}"
WEB_PORT="5173"
DATA_DIR="$ROOT/data"
LOG_DIR="$DATA_DIR/logs"
PID_DIR="$DATA_DIR/.pids"
API_PID="$PID_DIR/api.pid"
WEB_PID="$PID_DIR/web.pid"
LOCKFILE="$ROOT/package-lock.json"

# ---- 颜色（在支持的终端里才输出） ------------------------------------------
if [ -t 1 ]; then
  C_R="\033[31m"; C_G="\033[32m"; C_Y="\033[33m"; C_B="\033[34m"
  C_C="\033[36m"; C_M="\033[35m"; C_W="\033[1;37m"; C_D="\033[2m"; C_0="\033[0m"
else
  C_R=""; C_G=""; C_Y=""; C_B=""; C_C=""; C_M=""; C_W=""; C_D=""; C_0=""
fi
hr() { printf "${C_D}────────────────────────────────────────────────────────────${C_0}\n"; }
ok()  { printf "  ${C_G}✔${C_0} %s\n" "$1"; }
warn(){ printf "  ${C_Y}!${C_0} %s\n" "$1"; }
err() { printf "  ${C_R}✘${C_0} %s\n" "$1"; }
info(){ printf "  ${C_C}›${C_0} %s\n" "$1"; }
title(){ printf "\n${C_B}== ${C_W}%s${C_0} ${C_B}==${C_0}\n" "$1"; }

# ---- 依赖检测 ---------------------------------------------------------------
have() { command -v "$1" >/dev/null 2>&1; }

# 取某个 MSYS PID 对应的 Windows PID（Git Bash 下 $! 是 MSYS pid）
winpid_of() {
  local mp="$1"; [ -z "$mp" ] && return
  ps -W 2>/dev/null | awk -v p="$mp" '$1==p {print $4}'
}

# 结束一个进程树（兼容 Git Bash / Windows）
kill_tree() {
  local mp="$1"; [ -z "$mp" ] && return
  local wp; wp="$(winpid_of "$mp")"
  if [ -n "$wp" ] && have taskkill; then
    taskkill //PID "$wp" //T //F >/dev/null 2>&1 || true
  fi
  kill "$mp" 2>/dev/null || true   # MSYS 信号兜底
}

# 按命令行特征清理进程（无记录 PID 时的兜底），输出被结束的进程数
kill_by_pattern() {
  local pat="$1" n=0
  if command -v powershell >/dev/null 2>&1; then
    n=$(powershell -NoProfile -Command "\$m=Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -like \"*${pat}*\" }; foreach(\$p in \$m){ taskkill /PID \$p.ProcessId /T /F | Out-Null }; \$m.Count")
  fi
  echo "${n:-0}"
}

# ---- 端口是否被占用（用 curl 探测响应，跨平台无 lsof 依赖） ------------------
port_open() {
  local p="$1"
  curl -s -o /dev/null -m 1 "http://localhost:$p" >/dev/null 2>&1 && return 0
  return 1
}

# =============================================================================
#  1) 检测环境
# =============================================================================
do_detect() {
  title "检测环境"
  echo
  printf "  ${C_W}项目根目录${C_0}   : %s\n" "$ROOT"
  printf "  ${C_W}InkForge 版本${C_0}: %s\n" "$VERSION"
  echo
  info "基础运行时"
  if have node; then ok "node  $(node -v)"; else err "未找到 node（需 >= 18，推荐 22）"; fi
  if have npm; then ok "npm   $(npm -v)"; else err "未找到 npm"; fi
  if have git; then ok "git   $(git --version 2>/dev/null | awk '{print $3}')"; else warn "未找到 git（仅影响版本管理，不影响运行）"; fi
  if have curl; then ok "curl  可用"; else err "未找到 curl（端口探测需要）"; fi
  echo
  info "依赖与产物"
  [ -d "$ROOT/node_modules" ] && ok "node_modules 已安装" || warn "node_modules 未安装（请执行 2 一键部署）"
  [ -f "$LOCKFILE" ] && ok "package-lock.json 存在（部署将用 npm ci）" || warn "无 lockfile（部署将用 npm install）"
  [ -d "$ROOT/dist" ] && ok "dist 已构建" || warn "dist 未构建（启动生产模式前需执行 2 一键部署）"
  echo
  info "端口占用"
  if port_open "$API_PORT"; then ok "端口 $API_PORT (API/生产入口) 已被占用 → 服务可能在运行"; else warn "端口 $API_PORT 空闲"; fi
  if port_open "$WEB_PORT"; then ok "端口 $WEB_PORT (Vite 开发) 已被占用 → 开发服务器可能在运行"; else warn "端口 $WEB_PORT 空闲"; fi
  echo
  info "运行中的进程"
  if [ -f "$API_PID" ] && kill -0 "$(cat "$API_PID")" 2>/dev/null; then
    ok "已记录 API 进程 PID=$(cat "$API_PID")"
  else
    warn "无已记录的 API 进程（或进程已退出）"
  fi
  echo
  info "数据目录"
  [ -d "$DATA_DIR" ] && ok "$DATA_DIR 存在" || warn "$DATA_DIR 不存在（首次启动会创建）"
  [ -f "$DATA_DIR/inkforge.db" ] && ok "数据库 inkforge.db 已生成" || warn "数据库尚未生成"
  hr
}

# =============================================================================
#  2) 一键部署
# =============================================================================
do_deploy() {
  title "一键部署"
  echo
  if ! have node || ! have npm; then err "缺少 node/npm，无法部署"; return 1; fi
  mkdir -p "$LOG_DIR" "$PID_DIR"

  info "安装依赖…"
  if [ -f "$LOCKFILE" ]; then
    npm ci 2>&1 | tail -n 5 && ok "依赖安装完成 (npm ci)"
  else
    npm install 2>&1 | tail -n 5 && ok "依赖安装完成 (npm install)"
  fi

  info "构建前端产物 (vite build)…"
  npm run build 2>&1 | tail -n 8
  [ -d "$ROOT/dist" ] && ok "dist 构建完成" || { err "dist 构建失败"; return 1; }

  info "初始化数据目录与数据库…"
  node -e "import('./server/db.js').then(()=>console.log('  db ready')).catch(e=>{console.error(e);process.exit(1)})" 2>&1 | tail -n 3
  ok "数据库初始化完成"
  hr
  printf "  ${C_G}部署完成。${C_0} 接下来可执行 ${C_W}3) 启动${C_0} 启动服务。\n"
  hr
}

# =============================================================================
#  3) 启动服务（生产模式：单端口 5177 同时托管 API + 构建后的前端）
# =============================================================================
do_start() {
  title "启动服务（生产模式）"
  echo
  if ! have node; then err "缺少 node"; return 1; fi
  if [ ! -d "$ROOT/node_modules" ]; then err "未安装依赖，请先执行 2 一键部署"; return 1; fi
  if [ ! -d "$ROOT/dist" ]; then
    warn "dist 不存在，自动构建…"
    npm run build >/dev/null 2>&1 && ok "构建完成" || { err "构建失败"; return 1; }
  fi
  if port_open "$API_PORT"; then
    warn "端口 $API_PORT 已被占用，可能已在运行。先执行 4 结束 再启动。"
    return 1
  fi
  mkdir -p "$LOG_DIR" "$PID_DIR"

  info "后台启动 API + 前端 (npm start, 端口 $API_PORT)…"
  nohup npm start >"$LOG_DIR/api.log" 2>&1 &
  echo $! >"$API_PID"
  info "等待服务就绪（tsx 冷启动可能需 20~40s，最多等待 90s）…"
  local i=0 ready=0
  printf "    "
  until port_open "$API_PORT"; do
    printf "."
    sleep 1; i=$((i+1)); [ $i -ge 90 ] && break
  done
  printf "\n"
  if port_open "$API_PORT"; then
    ready=1
    ok "服务已启动"
    info "访问地址： ${C_W}http://localhost:$API_PORT${C_0}"
    info "日志文件： $LOG_DIR/api.log"
  else
    err "启动超时，请查看 $LOG_DIR/api.log（进程可能仍在后台启动中）"
  fi
  hr
}

# =============================================================================
#  4) 结束（停止服务）
# =============================================================================
do_stop() {
  title "结束服务"
  echo
  local stopped=0
  if [ -f "$API_PID" ]; then
    local pid; pid="$(cat "$API_PID")"
    if kill -0 "$pid" 2>/dev/null; then
      info "停止已记录的 API 进程 (PID=$pid)…"
      kill_tree "$pid"
      stopped=1
    fi
    rm -f "$API_PID"
  fi
  # 兜底：按进程命令行特征清理，避免残留（Git Bash 无 pgrep/pkill 时用 PowerShell）
  for pat in "server/index.ts" "vite" "npm run dev" "concurrently"; do
    local n; n="$(kill_by_pattern "$pat")"
    if [ "${n:-0}" -gt 0 ] 2>/dev/null; then
      info "清理残留进程: $pat (x$n)"
      stopped=1
    fi
  done
  [ $stopped -eq 1 ] && ok "已发送停止信号" || warn "没有发现运行中的 InkForge 进程"
  hr
}

# =============================================================================
#  5) 卸载（删除 node_modules 与 dist，保留用户数据）
# =============================================================================
do_uninstall() {
  title "卸载"
  echo
  warn "将删除 node_modules 与 dist（构建产物）。用户数据 ($DATA_DIR) 会被保留。"
  printf "  ${C_Y}确认卸载？输入 yes 继续：${C_0}"
  local ans; read -r ans
  if [ "$ans" != "yes" ]; then info "已取消"; hr; return 0; fi
  do_stop >/dev/null 2>&1 || true
  info "删除 node_modules…"
  rm -rf "$ROOT/node_modules" && ok "已删除 node_modules"
  info "删除 dist…"
  rm -rf "$ROOT/dist" && ok "已删除 dist"
  ok "卸载完成（数据已保留）"
  hr
}

# =============================================================================
#  6) 清理（删除临时产物 / 日志，保留依赖与数据）
# =============================================================================
do_cleanup() {
  title "清理"
  echo
  info "删除 dist / 日志 / 缓存（保留 node_modules 与用户数据）"
  rm -rf "$ROOT/dist" && ok "已删除 dist"
  rm -rf "$LOG_DIR" && ok "已删除日志目录"
  rm -rf "$ROOT/node_modules/.vite" 2>/dev/null || true
  rm -rf "$ROOT/.cache" 2>/dev/null || true
  ok "清理完成"
  printf "  ${C_D}如需清空数据库（删除全部文档），请手动删除 $DATA_DIR/inkforge.db${C_0}\n"
  hr
}

# =============================================================================
#  菜单
# =============================================================================
show_menu() {
  printf "\n${C_M}  ╔══════════════════════════════════════════════╗${C_0}\n"
  printf "${C_M}  ║${C_0}   ${C_W}InkForge 管理面板${C_0}  ${C_D}v$VERSION${C_0}            ${C_M}║${C_0}\n"
  printf "${C_M}  ╚══════════════════════════════════════════════╝${C_0}\n"
  printf "  ${C_C} 1)${C_0} 🔍  检测环境\n"
  printf "  ${C_C} 2)${C_0} 📦  一键部署 (安装依赖 + 构建)\n"
  printf "  ${C_C} 3)${C_0} ▶️   启动服务 (生产模式 :$API_PORT)\n"
  printf "  ${C_C} 4)${C_0} ⏹   结束服务 (停止进程)\n"
  printf "  ${C_C} 5)${C_0} 🗑️   卸载 (删 node_modules/dist)\n"
  printf "  ${C_C} 6)${C_0} 🧹  清理 (删 dist/日志/缓存)\n"
  printf "  ${C_C} 0)${C_0} 🚪  退出\n"
  printf "  ${C_D}----------------------------------------------------${C_0}\n"
}

run_choice() {
  case "$1" in
    1|detect)   do_detect ;;
    2|deploy)   do_deploy ;;
    3|start)    do_start ;;
    4|stop)     do_stop ;;
    5|uninstall)do_uninstall ;;
    6|cleanup)  do_cleanup ;;
    0|q|quit|exit) printf "  ${C_D}再见。${C_0}\n"; exit 0 ;;
    *) err "无效选项: $1" ;;
  esac
}

# 直接以参数形式调用：./inkforge.sh start
if [ $# -ge 1 ]; then
  run_choice "$1"
  exit 0
fi

# 交互式循环
while true; do
  show_menu
  printf "  ${C_W}请选择 [0-6]：${C_0}"
  read -r CHOICE
  echo
  run_choice "$CHOICE"
done
