@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul

set "ROOT=%~dp0"
set "WEB=%ROOT%web"
set "JAR=%ROOT%WeiboComCheckin.jar"
set "PORT=3000"
set "URL=http://localhost:%PORT%"

title Weibo-Qiandao 一键启动
echo ========================================
echo   Weibo-Qiandao 一键安装并启动
echo ========================================
echo.

if not exist "%WEB%\server.js" (
    echo [错误] 未找到网页端目录：%WEB%
    echo 请确认本文件放在 weibo 根目录下。
    pause
    exit /b 1
)

if not exist "%JAR%" (
    echo [错误] 未找到核心文件：%JAR%
    echo 请把 WeiboComCheckin.jar 放到本 BAT 同级目录后再运行。
    pause
    exit /b 1
)

where winget >nul 2>nul
if errorlevel 1 (
    set "HAS_WINGET=0"
) else (
    set "HAS_WINGET=1"
)

call :ensure_node
if errorlevel 1 exit /b 1

call :ensure_java
if errorlevel 1 exit /b 1

cd /d "%WEB%"

if not exist "config.json" (
    echo [配置] 首次运行，正在生成 config.json...
    copy /y "config.example.json" "config.json" >nul
)

for /f "tokens=5" %%a in ('netstat -ano ^| findstr /r /c:":%PORT% .*LISTENING"') do set "PID=%%a"
if defined PID (
    echo [启动] 检测到网页端已经在运行，端口：%PORT%，PID：%PID%
    echo [启动] 正在打开浏览器：%URL%
    start "" "%URL%"
    pause
    exit /b 0
)

if not exist "node_modules" (
    echo [依赖] 首次启动，正在安装 Node.js 依赖...
    npm install
    if errorlevel 1 (
        echo [错误] npm install 失败，请检查网络或 Node.js/npm 环境。
        pause
        exit /b 1
    )
) else (
    echo [依赖] 已检测到 node_modules，跳过依赖安装。
)

echo.
echo [启动] 正在启动网页端...
echo [访问] %URL%
echo [提示] 公网部署时，请访问：http://服务器IP:%PORT%
echo.
start "" "%URL%"
node server.js

echo.
echo [结束] 服务已停止。
pause
exit /b 0

:ensure_node
where node >nul 2>nul
if not errorlevel 1 (
    for /f "tokens=*" %%v in ('node -v') do echo [环境] Node.js %%v
    exit /b 0
)

echo [环境] 未检测到 Node.js。
if "%HAS_WINGET%"=="1" (
    echo [安装] 正在通过 winget 安装 Node.js LTS...
    winget install OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
    if errorlevel 1 (
        echo [错误] Node.js 自动安装失败，请手动安装：https://nodejs.org/
        pause
        exit /b 1
    )
    echo [提示] 如果仍提示找不到 node，请关闭本窗口后重新双击本 BAT。
    pause
    exit /b 1
)

echo [错误] 未安装 Node.js，且系统没有 winget，无法自动安装。
echo 请手动安装 Node.js LTS：https://nodejs.org/
pause
exit /b 1

:ensure_java
where java >nul 2>nul
if errorlevel 1 goto install_java

for /f "tokens=3" %%v in ('java -version 2^>^&1 ^| findstr /i "version"') do set "JAVA_VERSION=%%~v"
for /f "tokens=1 delims=." %%m in ("%JAVA_VERSION%") do set "JAVA_MAJOR=%%m"
if not defined JAVA_MAJOR set "JAVA_MAJOR=0"

if %JAVA_MAJOR% GEQ 23 (
    echo [环境] Java %JAVA_VERSION%
    exit /b 0
)

echo [环境] 当前 Java 版本为 %JAVA_VERSION%，需要 Java 23 或更高版本。

:install_java
if "%HAS_WINGET%"=="1" (
    echo [安装] 正在通过 winget 安装 Java 23 JDK...
    winget install EclipseAdoptium.Temurin.23.JDK -e --accept-package-agreements --accept-source-agreements
    if errorlevel 1 (
        echo [错误] Java 23 自动安装失败，请手动安装 Java 23 或更高版本。
        pause
        exit /b 1
    )
    echo [提示] Java 安装完成后，请关闭本窗口后重新双击本 BAT。
    pause
    exit /b 1
)

echo [错误] 未检测到可用 Java 23，且系统没有 winget，无法自动安装。
echo 请手动安装 Java 23 或更高版本后再运行。
pause
exit /b 1
