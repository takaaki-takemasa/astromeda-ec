@echo off
chcp 65001 >nul 2>&1
title Astromeda - Claude Code

echo.
echo  ========================================
echo    Astromeda EC - Claude Code
echo  ========================================
echo.

cd /d "C:\Users\Mining-Base\mngb Dropbox\武正貴昭\PC (2)\Desktop\astromeda-ec"
if %errorlevel% neq 0 (
    echo  [ERROR] Cannot cd to project folder.
    pause
    exit /b 1
)
echo  Folder: OK
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js not found.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do echo  Node.js: %%v

where claude >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  Claude Code not found. Installing...
    call npm install -g @anthropic-ai/claude-code
    if %errorlevel% neq 0 (
        echo  [ERROR] Install failed
        pause
        exit /b 1
    )
    echo  Install done!
)

echo.
echo  Starting Claude Code...
echo.

claude --dangerously-skip-permissions

echo.
echo  Done.
pause
