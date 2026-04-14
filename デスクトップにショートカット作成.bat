@echo off
chcp 65001 >nul 2>&1

:: デスクトップにAstromeda起動のショートカットを作成
set "SHORTCUT=%USERPROFILE%\Desktop\Astromeda起動.lnk"
set "TARGET=%~dp0Astromeda起動.bat"

powershell -Command "$ws = New-Object -ComObject WScript.Shell; $sc = $ws.CreateShortcut('%SHORTCUT%'); $sc.TargetPath = '%TARGET%'; $sc.WorkingDirectory = '%~dp0'; $sc.Description = 'Astromeda Claude Code 起動'; $sc.Save()"

echo.
echo  デスクトップに「Astromeda起動」ショートカットを作成しました。
echo  次回からはデスクトップのアイコンをダブルクリックするだけでOKです。
echo.
pause
