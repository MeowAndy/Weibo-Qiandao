@echo off
chcp 65001 >nul
setlocal

cd /d "%~dp0"

set "JAR=%~dp0WeiboComCheckin.jar"

if not exist "%JAR%" (
    echo 未找到 WeiboComCheckin.jar
    echo 请确认本 bat 文件和 WeiboComCheckin.jar 放在同一个文件夹。
    pause
    exit /b 1
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
