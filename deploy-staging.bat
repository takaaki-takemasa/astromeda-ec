@echo off
cd /d "C:\Users\Mining-Base\mngb Dropbox\武正貴昭\PC (2)\Desktop\astromeda-ec"
echo Building...
call npm run build
echo.
echo Deploying to staging...
call npx shopify hydrogen deploy --build-command "npm run build" --force --entry server
echo.
echo Done!
pause
