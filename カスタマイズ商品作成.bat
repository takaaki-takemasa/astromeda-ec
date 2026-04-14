@echo off
chcp 65001 >nul
echo.
echo ========================================
echo  Customization Product Creator
echo  (staging-mining-base store)
echo ========================================
echo.

cd /d "C:\Users\Mining-Base\mngb Dropbox\武正貴昭\PC (2)\Desktop\astromeda-ec"

echo Running script...
node "scripts\create-customization-product.js" staging

echo.
echo ========================================
echo  Done! Check the log above.
echo ========================================
echo.
pause
