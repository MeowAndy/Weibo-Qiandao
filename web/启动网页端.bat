@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "PORT=3000"
set "URL=http://localhost:%PORT%"

where node >nul 2>nul
if errorlevel 1 (
    echo 未找到 Node.js，请先安装 Node.js 后再运行。
    pause
    exit /b 1
)

for /f "tokens=5" %%a in ('netstat -ano ^| findstr /r /c:":%PORT% .*LISTENING"') do set "PID=%%a"
if defined PID (
    echo(检测到网页端已经在运行，端口：%PORT%，进程 PID：%PID%
    echo(正在打开浏览器：%URL%
    start "" "%URL%"
    echo(
    echo(如果页面打不开，请先关闭之前打开的 node 窗口后重新双击本文件。
    pause
    exit /b 0
)

if not exist "node_modules" (
    echo 首次启动，正在安装依赖...
    npm install
    if errorlevel 1 (
        echo 依赖安装失败，请检查 Node.js / npm 是否已安装。
        pause
        exit /b 1
    )
)

echo(正在启动微博超话签到 Web...
echo(浏览器访问：%URL%
echo(如果部署到服务器，请访问：http://服务器IP:%PORT%
echo(
start "" "%URL%"
node server.js
pause
