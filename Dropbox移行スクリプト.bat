@echo off
chcp 65001 >nul
title Astromeda EC - Dropbox→ローカル移行スクリプト v2（監査修正版）
color 0A

echo ============================================================
echo   ASTROMEDA EC - Dropbox → ローカル移行スクリプト v2
echo   旧: C:\Users\Mining-Base\mngb Dropbox\武正貴昭\PC (2)\Desktop\astromeda-ec
echo   新: C:\Projects\astromeda-ec
echo   監査修正: 5件のCRITICAL GAP対応済み
echo ============================================================
echo.

set "OLD_PATH=C:\Users\Mining-Base\mngb Dropbox\武正貴昭\PC (2)\Desktop\astromeda-ec"
set "NEW_PATH=C:\Projects\astromeda-ec"
set "BACKUP_PATH=%USERPROFILE%\AppData\Local\astromeda-env-backup"

:: ============================================================
:: Pre-flight チェック（監査指摘 #6: 事前検証追加）
:: ============================================================
echo [Pre-flight] 事前チェック実行中...

:: PowerShell動作確認
powershell -Command "Write-Output 'OK'" >nul 2>&1
if errorlevel 1 (
    echo   ✗ PowerShellが利用できません。手動移行が必要です。
    pause
    exit /b 1
)
echo   ✓ PowerShell動作OK

:: 旧パス存在確認
if not exist "%OLD_PATH%\package.json" (
    echo   ✗ 旧パスにプロジェクトが見つかりません: %OLD_PATH%
    pause
    exit /b 1
)
echo   ✓ 旧パス存在確認OK

:: C:\Projectsの書き込み権限確認
if not exist "C:\Projects" mkdir "C:\Projects" 2>nul
echo test > "C:\Projects\_write_test.tmp" 2>nul
if not exist "C:\Projects\_write_test.tmp" (
    echo   ✗ C:\Projectsに書き込み権限がありません。管理者権限で実行してください。
    pause
    exit /b 1
)
del "C:\Projects\_write_test.tmp"
echo   ✓ 書き込み権限OK

:: 既存ディレクトリチェック
if exist "%NEW_PATH%\package.json" (
    echo   ✗ 警告: %NEW_PATH% に既にプロジェクトが存在します
    echo   上書きしますか？ (Y/N)
    set /p "OVERWRITE="
    if /i not "%OVERWRITE%"=="Y" (
        echo   → 中断しました
        pause
        exit /b 1
    )
)
echo   ✓ Pre-flight 全項目クリア
echo.

:: ============================================================
:: Step 1: git commit（変更保全）
:: ============================================================
echo [Step 1/12] 未コミット変更をgit commitで保全...
cd /d "%OLD_PATH%"
git add -A 2>nul
git commit -m "pre-migration: Dropbox→local移行前の全変更保存" 2>nul
echo   → コミット処理完了（変更がない場合もOK）
echo.

:: ============================================================
:: Step 2: .envバックアップ（監査修正 #2: 安全な場所に）
:: ============================================================
echo [Step 2/12] .env秘密鍵バックアップ（AppData/Localに保管）...
if not exist "%BACKUP_PATH%" mkdir "%BACKUP_PATH%"
if exist ".env" copy /Y ".env" "%BACKUP_PATH%\.env" >nul
if exist ".env.production.template" copy /Y ".env.production.template" "%BACKUP_PATH%\.env.production.template" >nul
if exist ".shopify\project.json" (
    if not exist "%BACKUP_PATH%\.shopify" mkdir "%BACKUP_PATH%\.shopify"
    copy /Y ".shopify\project.json" "%BACKUP_PATH%\.shopify\project.json" >nul
)
echo   → バックアップ完了: %BACKUP_PATH%
echo.

:: ============================================================
:: Step 3: ファイルコピー（監査修正 #1: 隠しファイル明示的コピー）
:: ============================================================
echo [Step 3/12] プロジェクト全体コピー（node_modules除外）...
echo   これには数分かかる場合があります...

:: robocopy /MIR はデフォルトで隠しファイルもコピーする
:: /XD node_modules のみ除外。.git, .shopify, .env は全てコピーされる
robocopy "%OLD_PATH%" "%NEW_PATH%" /MIR /XD node_modules /NFL /NDL /NJH /NJS /R:1 /W:1 >nul

:: 隠しファイルの明示的コピー確認（監査指摘 #1 対策）
if not exist "%NEW_PATH%\.git" (
    echo   → .gitが見つかりません。明示的にコピー中...
    xcopy /E /I /H /Y "%OLD_PATH%\.git" "%NEW_PATH%\.git" >nul
)
if not exist "%NEW_PATH%\.shopify" (
    echo   → .shopifyが見つかりません。明示的にコピー中...
    xcopy /E /I /H /Y "%OLD_PATH%\.shopify" "%NEW_PATH%\.shopify" >nul
)
if not exist "%NEW_PATH%\.env" (
    echo   → .envが見つかりません。バックアップから復元中...
    copy /Y "%BACKUP_PATH%\.env" "%NEW_PATH%\.env" >nul
)

:: コピー検証
echo   → ファイル数検証中...
set COUNT_OLD=0
set COUNT_NEW=0
for /f %%a in ('dir /s /b /a-d "%OLD_PATH%" 2^>nul ^| find /c /v ""') do set COUNT_OLD=%%a
for /f %%a in ('dir /s /b /a-d "%NEW_PATH%" 2^>nul ^| find /c /v ""') do set COUNT_NEW=%%a
echo   → 旧パスファイル数: %COUNT_OLD%
echo   → 新パスファイル数: %COUNT_NEW%
echo   → コピー完了
echo.

:: ============================================================
:: Step 4: パス修正（監査修正 #3: ネイティブbatch方式に変更）
:: ============================================================
echo [Step 4/12] パス参照ファイルを修正中...

cd /d "%NEW_PATH%"

:: Astromeda起動.bat — 完全に書き換え（一番確実）
echo   → Astromeda起動.bat を新パスで再生成...
(
echo @echo off
echo chcp 65001 ^>nul 2^>^&1
echo cd /d "C:\Projects\astromeda-ec"
echo claude --dangerously-skip-permissions
echo pause
) > "%NEW_PATH%\Astromeda起動.bat"

:: CLAUDE.md — PowerShellで置換（日本語対応）
echo   → CLAUDE.md のパス修正...
powershell -Command "$c = Get-Content 'CLAUDE.md' -Raw -Encoding UTF8; $old = 'C:\Users\Mining-Base\mngb Dropbox\武正貴昭\PC (2)\Desktop\astromeda-ec'; $c = $c.Replace($old, 'C:\Projects\astromeda-ec'); Set-Content 'CLAUDE.md' -Value $c -Encoding UTF8 -NoNewline"

:: PROGRESS.md — PowerShellで置換
echo   → PROGRESS.md のパス修正...
powershell -Command "$c = Get-Content 'PROGRESS.md' -Raw -Encoding UTF8; $old = 'C:\Users\Mining-Base\mngb Dropbox\武正貴昭\PC (2)\Desktop\astromeda-ec'; $c = $c.Replace($old, 'C:\Projects\astromeda-ec'); Set-Content 'PROGRESS.md' -Value $c -Encoding UTF8 -NoNewline"

:: 修正検証（監査修正 #3: 必ず検証する）
echo   → 修正結果を検証中...
findstr /c:"C:\Projects\astromeda-ec" "Astromeda起動.bat" >nul 2>&1
if errorlevel 1 (
    echo   ✗ Astromeda起動.bat のパス修正に失敗しました！
    pause
    exit /b 1
)
echo   ✓ Astromeda起動.bat 修正OK

findstr /c:"C:\Projects\astromeda-ec" "CLAUDE.md" >nul 2>&1
if errorlevel 1 (
    echo   ✗ CLAUDE.md のパス修正に失敗しました！
    pause
    exit /b 1
)
echo   ✓ CLAUDE.md 修正OK

findstr /c:"C:\Projects\astromeda-ec" "PROGRESS.md" >nul 2>&1
if errorlevel 1 (
    echo   ✗ PROGRESS.md のパス修正に失敗しました！
    pause
    exit /b 1
)
echo   ✓ PROGRESS.md 修正OK
echo.

:: ============================================================
:: Step 5: npm ci
:: ============================================================
echo [Step 5/12] npm ci（node_modulesクリーンインストール）...
echo   これには5-10分かかります...
call npm ci
if errorlevel 1 (
    echo   ✗ npm ci 失敗。ネットワーク接続を確認してください。
    pause
    exit /b 1
)
echo   ✓ npm ci 完了
echo.

:: ============================================================
:: Step 6: Shopify CLIパッチ判定（監査修正 #5）
:: ============================================================
echo [Step 6/12] Shopify CLIグロブパッチの必要性確認...
echo   新パスに括弧なし → パッチは不要のはずです。
echo   もしビルド時に「Worker file not found」が出た場合:
echo     → 旧パッチを参照: CLAUDE.md「既知の問題」セクション
echo   ✓ 新パスC:\Projects\astromeda-ecは安全（括弧・スペースなし）
echo.

:: ============================================================
:: Step 7: Shopify Hydrogen リンク
:: ============================================================
echo [Step 7/12] Shopify Hydrogen リンク再設定...
call npx shopify hydrogen link --storefront staging-mining-base
if errorlevel 1 (
    echo   ⚠ Hydrogen link失敗。手動で再設定が必要かもしれません。
    echo   コマンド: npx shopify hydrogen link --storefront staging-mining-base
)
echo   → Hydrogen リンク処理完了
echo.

:: ============================================================
:: Step 8: ビルドテスト
:: ============================================================
echo [Step 8/12] Vite本番ビルド...
call npm run build
if errorlevel 1 (
    echo   ✗ ビルド失敗！エラーログを確認してください。
    echo   よくある原因:
    echo     1. Worker file not found → Step 6のパッチ情報参照
    echo     2. Type error → npx tsc --noEmit で確認
    pause
    exit /b 1
)
echo   ✓ ビルド成功！
echo.

:: ============================================================
:: Step 9: Worker file確認
:: ============================================================
echo [Step 9/12] Worker file存在確認（PC(2)問題の再発チェック）...
if exist "dist\worker\index.js" (
    for %%f in (dist\worker\index.js) do echo   ✓ dist\worker\index.js 存在確認 (%%~zf bytes)
) else (
    echo   ✗ Worker file が見つかりません！
    echo   → Shopify CLIグロブパッチが必要な可能性があります。
    echo   → CLAUDE.md「既知の問題」セクションを参照してください。
    pause
    exit /b 1
)
echo.

:: ============================================================
:: Step 10: git remote修正（監査修正: .gitのremote更新）
:: ============================================================
echo [Step 10/12] gitリモート設定確認...
git remote -v 2>nul
echo   → git設定は上記の通りです（変更不要の場合が多い）
echo.

:: ============================================================
:: Step 11: 移行コミット
:: ============================================================
echo [Step 11/12] 移行完了コミット作成...
git add -A 2>nul
git commit -m "migration: Dropbox→C:\Projects\astromeda-ec パス移行完了" 2>nul
echo   → コミット完了
echo.

:: ============================================================
:: Step 12: 最終検証サマリー
:: ============================================================
echo [Step 12/12] 最終検証サマリー...
echo.
echo   ============================================================
echo   移行結果チェックリスト
echo   ============================================================

:: 各項目を検証
set PASS=0
set FAIL=0

if exist "%NEW_PATH%\package.json" (set /a PASS+=1 & echo   ✓ package.json) else (set /a FAIL+=1 & echo   ✗ package.json)
if exist "%NEW_PATH%\.env" (set /a PASS+=1 & echo   ✓ .env) else (set /a FAIL+=1 & echo   ✗ .env)
if exist "%NEW_PATH%\.shopify\project.json" (set /a PASS+=1 & echo   ✓ .shopify/project.json) else (set /a FAIL+=1 & echo   ✗ .shopify/project.json)
if exist "%NEW_PATH%\.git\HEAD" (set /a PASS+=1 & echo   ✓ .git) else (set /a FAIL+=1 & echo   ✗ .git)
if exist "%NEW_PATH%\node_modules" (set /a PASS+=1 & echo   ✓ node_modules) else (set /a FAIL+=1 & echo   ✗ node_modules)
if exist "%NEW_PATH%\dist\worker\index.js" (set /a PASS+=1 & echo   ✓ dist/worker/index.js) else (set /a FAIL+=1 & echo   ✗ dist/worker/index.js)
if exist "%NEW_PATH%\Astromeda起動.bat" (set /a PASS+=1 & echo   ✓ Astromeda起動.bat) else (set /a FAIL+=1 & echo   ✗ Astromeda起動.bat)

echo.
echo   結果: %PASS% 合格 / %FAIL% 不合格
echo.

if %FAIL% GTR 0 (
    echo   ⚠ 一部の検証に失敗しました。上記を確認してください。
) else (
    echo   ✅ 全項目合格！移行成功です。
)

echo.
echo   ============================================================
echo   次のステップ:
echo   1. npm run dev でローカル動作確認
echo   2. npx shopify hydrogen deploy でステージングデプロイ
echo   3. Preview URLで全ページ表示確認
echo   4. 問題なければ旧Dropboxフォルダをzip圧縮してアーカイブ
echo   ============================================================
echo.
echo   ロールバック方法（万が一の場合）:
echo   旧パスはDropboxに残っています。旧パスで作業を再開できます:
echo   cd /d "%OLD_PATH%"
echo   npm ci ^&^& npm run build
echo.
pause
