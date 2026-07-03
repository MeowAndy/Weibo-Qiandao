@echo off
chcp 65001 >nul
setlocal

cd /d "%~dp0"

set "JAR=%~dp0WeiboComCheckin.jar"
set "JAR_URL=https://wb.dsttl3.cn/app/download/WeiboComCheckin.jar"

if not exist "%JAR%" (
    echo 未找到 WeiboComCheckin.jar，正在从作者公开地址下载...
    echo %JAR_URL%
    powershell -NoProfile -ExecutionPolicy Bypass -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%JAR_URL%' -OutFile '%JAR%' -UseBasicParsing -TimeoutSec 120; exit 0 } catch { Write-Host $_.Exception.Message; exit 1 }"
    if errorlevel 1 (
        echo 自动下载失败，请手动下载后放到本 bat 同级目录。
        pause
        exit /b 1
    )
)

where java >nul 2>nul
if errorlevel 1 (
    echo 未检测到 Java。
    echo 请先安装 Java 运行环境，然后重新运行本文件。
    pause
    exit /b 1
)

echo 请选择要执行的操作：
echo.
echo   1. 登录 login
echo   2. 签到 checkin
echo.
set /p "CHOICE=请输入 1 或 2 后按回车："

if "%CHOICE%"=="1" (
    set "ACTION=login"
) else if "%CHOICE%"=="2" (
    set "ACTION=checkin"
) else (
    echo 输入无效，请重新运行本文件。
    pause
    exit /b 1
)

echo.
echo 正在启动 WeiboComCheckin，执行：%ACTION%
echo.
java -jar "%JAR%" %ACTION%

echo.
echo 程序已结束。
pause
