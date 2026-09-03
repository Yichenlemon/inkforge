@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion
REM ============================================================================
REM  InkForge Manager (inkforge.bat)  -- Windows double-click entry
REM  Portable mode: if runtime\node.exe exists, use bundled Node (no install)
REM  Usage:
REM    inkforge.bat            menu
REM    inkforge.bat start      run a task directly
REM ============================================================================

set "ROOT=%~dp0.."
cd /d "%ROOT%"

set "VERSION=1.0.0"
set "API_PORT=5177"
set "WEB_PORT=5173"
set "DATA_DIR=%ROOT%\data"
set "LOG_DIR=%DATA_DIR%\logs"
set "PID_DIR=%DATA_DIR%\.pids"
set "API_PID=%PID_DIR%\api.pid"

REM ---- Resolve runtime: prefer bundled runtime\node.exe ----------------------
set "RUNTIME_MODE=system"
if exist "%ROOT%\runtime\node.exe" (
  set "NODE=%ROOT%\runtime\node.exe"
  if exist "%ROOT%\runtime\npm.cmd" (set "NPM=%ROOT%\runtime\npm.cmd") else (set "NPM=npm")
  set "RUNTIME_MODE=bundled"
) else (
  set "NODE=node"
  set "NPM=npm"
)

if not "%~1"=="" (call :dispatch %1 & goto :eof)

:menu
cls
echo.
echo   ====================================================
echo      InkForge Manager  v%VERSION%
echo      Runtime: %RUNTIME_MODE%
echo   ====================================================
echo      1) detect
echo      2) deploy (install deps + build)
echo      3) start (production :%API_PORT%)
echo      4) stop
echo      5) uninstall (remove node_modules/dist)
echo      6) cleanup (remove dist/logs/cache)
echo      0) quit
echo   ----------------------------------------------------
set "CHOICE="
set /p "CHOICE=  Select [0-6]: "
call :dispatch %CHOICE%
goto :menu

:dispatch
if "%1"=="1" goto :detect
if "%1"=="detect" goto :detect
if "%1"=="2" goto :deploy
if "%1"=="deploy" goto :deploy
if "%1"=="3" goto :start
if "%1"=="start" goto :start
if "%1"=="4" goto :stop
if "%1"=="stop" goto :stop
if "%1"=="5" goto :uninstall
if "%1"=="uninstall" goto :uninstall
if "%1"=="6" goto :cleanup
if "%1"=="cleanup" goto :cleanup
if "%1"=="0" goto :quit
if "%1"=="q" goto :quit
if "%1"=="" goto :eof
echo   invalid: %1
goto :eof

:detect
echo.
echo == detect ==
echo   root      : %ROOT%
echo   version   : %VERSION%
echo.
if "%RUNTIME_MODE%"=="bundled" (echo   [OK] bundled runtime/ - no Node install needed) else (echo   [!] system node/npm)
for /f "tokens=*" %%v in ('"%NODE%" -v 2^>nul') do echo   [OK] node  %%v
for /f "tokens=*" %%v in ('"%NPM%" -v 2^>nul') do echo   [OK] npm   %%v
if exist "%ROOT%\node_modules" (echo   [OK] node_modules present) else (echo   [!] node_modules missing - run 2 deploy)
if exist "%ROOT%\package-lock.json" (echo   [OK] package-lock.json present) else (echo   [!] no lockfile)
if exist "%ROOT%\dist" (echo   [OK] dist built) else (echo   [!] dist not built)
call :port_check %API_PORT%
if defined PORT_OPEN (echo   [OK] port %API_PORT% in use) else (echo   [!] port %API_PORT% free)
if exist "%DATA_DIR%\inkforge.db" (echo   [OK] inkforge.db generated) else (echo   [!] db not generated)
echo.
goto :eof

:deploy
echo.
echo == deploy ==
if not exist "%NODE%" if not exist "%ROOT%\runtime\node.exe" (echo   [X] node missing & goto :eof)
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
if not exist "%PID_DIR%" mkdir "%PID_DIR%"
if exist "%ROOT%\node_modules" (echo   [OK] bundled deps present - skip npm install) else (echo   installing... & if exist "%ROOT%\package-lock.json" ("%NPM%" ci) else ("%NPM%" install))
if exist "%ROOT%\dist" (echo   [OK] dist present - skip vite build) else (echo   building... & "%NPM%" run build)
echo   init db...
"%NODE%" -e "import('./server/db.js').then(()=>console.log('  db ready')).catch(e=>{console.error(e);process.exit(1)})"
echo   [OK] deploy done - run 3 start
echo.
goto :eof

:start
echo.
echo == start (production) ==
if not exist "%NODE%" if not exist "%ROOT%\runtime\node.exe" (echo   [X] node missing & goto :eof)
if not exist "%ROOT%\node_modules" (echo   [X] deps missing - run 2 deploy & goto :eof)
if not exist "%ROOT%\dist" ("%NPM%" run build >nul 2>&1 && echo   [OK] auto-built dist)
call :port_check %API_PORT%
if defined PORT_OPEN (echo   [!] port %API_PORT% in use - run 4 stop first & goto :eof)
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
if not exist "%PID_DIR%" mkdir "%PID_DIR%"
echo   launching API + frontend on :%API_PORT%...
if exist "%ROOT%\node_modules\tsx\dist\cli.mjs" (call :launch_tsx) else (call :launch_npm)
echo   waiting for service (up to 90s)...
set "READY="
for /l %%t in (1,1,90) do (
  curl -s -o nul -m 1 http://localhost:%API_PORT% >nul 2>&1
  if "!errorlevel!"=="0" (set "READY=1" & goto :start_done)
  timeout /t 1 >nul
)
:start_done
if defined READY (echo   [OK] started - http://localhost:%API_PORT%  log: %LOG_DIR%\api.log) else (echo   [X] timeout - check %LOG_DIR%\api.log)
echo.
goto :eof

:launch_tsx
REM Background the server in the current console (keep this window open to keep it alive).
start /B cmd /c %NODE% %ROOT%\node_modules\tsx\dist\cli.mjs %ROOT%\server\index.ts ^> %LOG_DIR%\api.log 2^>^&1
goto :eof

:launch_npm
start /B cmd /c %NPM% start ^> %LOG_DIR%\api.log 2^>^&1
goto :eof

:stop
echo.
echo == stop ==
set "STOPPED="
if exist "%API_PID%" (
  set /p PID=<"%API_PID%"
  if defined PID (taskkill /PID !PID! /T /F >nul 2>&1 & echo   stopped pid !PID! & set "STOPPED=1")
  del /f /q "%API_PID%" >nul 2>&1
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*server*index.ts*' } | ForEach-Object { taskkill /PID $_.ProcessId /T /F | Out-Null }" >nul 2>&1
if defined STOPPED (echo   [OK] stop signal sent) else (echo   [!] no running InkForge process)
echo.
goto :eof

:uninstall
echo.
echo == uninstall ==
if "%RUNTIME_MODE%"=="bundled" (echo   [!] portable: removing node_modules removes bundled deps - need npm install again)
echo   will remove node_modules and dist (keep user data).
set "ANS="
set /p "ANS=  confirm? type yes: "
if not "%ANS%"=="yes" (echo   cancelled & echo. & goto :eof)
call :stop
if exist "%ROOT%\node_modules" rmdir /s /q "%ROOT%\node_modules" && echo   [OK] removed node_modules
if exist "%ROOT%\dist" rmdir /s /q "%ROOT%\dist" && echo   [OK] removed dist
echo   [OK] uninstall done (data kept)
echo.
goto :eof

:cleanup
echo.
echo == cleanup ==
if exist "%ROOT%\dist" rmdir /s /q "%ROOT%\dist" && echo   [OK] removed dist
if exist "%LOG_DIR%" rmdir /s /q "%LOG_DIR%" && echo   [OK] removed logs
if exist "%ROOT%\node_modules\.vite" rmdir /s /q "%ROOT%\node_modules\.vite" >nul 2>&1
if exist "%ROOT%\.cache" rmdir /s /q "%ROOT%\.cache" >nul 2>&1
echo   [OK] cleaned (kept node_modules and data)
echo   to wipe DB, delete %DATA_DIR%\inkforge.db
echo.
goto :eof

:quit
echo   bye.
exit /b 0

:port_check
set "PORT_OPEN="
curl -s -o nul -m 1 http://localhost:%1 >nul 2>&1
if !errorlevel!==0 (set "PORT_OPEN=1")
goto :eof
