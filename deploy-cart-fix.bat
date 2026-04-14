@echo off
cd /d "C:\Users\Mining-Base\mngb Dropbox\武正貴昭\PC (2)\Desktop\astromeda-ec"
echo =============================================
echo   カート追加修正 - デプロイ
echo   CartFormのhidden input問題を修正
echo   カスタマイズバリアントがカートに追加されるように
echo =============================================
echo.
echo Building...
call npm run build
if %errorlevel% neq 0 (
    echo Build failed!
    pause
    exit /b 1
)
echo.
echo Deploying to Oxygen...
call npx shopify hydrogen deploy --build-command "npm run build" --force --entry server --metadata-description "Fix: CartForm fetcher.submit for customization variants"
echo.
echo Done!
pause
