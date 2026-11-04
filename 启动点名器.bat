@echo off
chcp 65001 >nul
title 原神抽卡模拟器 · 本地版
cd /d "%~dp0"

echo.
echo   ============================================
echo     原神抽卡模拟器 (原神点名器) · 本地版
echo   ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo   [错误] 没有检测到 Node.js 运行时。
    echo   请先安装 Node.js 18 或更高版本: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo   正在启动本地服务...
echo.
node "%~dp0serve.js" 8080 "%~dp0site"

if errorlevel 1 (
    echo.
    echo   启动失败。可尝试指定其他端口，例如:
    echo     node serve.js 9000 site
    echo.
    pause
)
