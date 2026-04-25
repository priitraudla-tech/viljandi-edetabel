@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo ============================================================
echo   GitHub push parandus (force push)
echo ============================================================
echo.
echo See lykkab sinu lokaalsed failid uleruleta GitHub-i,
echo kirjutades ule mis seal varem oli. Kuna sul on lokaalselt
echo oige ja taielik versioon, siis see on turvaline.
echo.
pause

git push --force origin main

if errorlevel 1 (
    echo.
    echo Push ebaonnestus.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo   Push edukas! Failid on nuud GitHub-is.
echo.
echo   JARGMINE:
echo.
echo   1. Mine repo lehele:
echo      https://github.com/priitraudla-tech/viljandi-edetabel
echo      Veendu et failid on naha (index.html, app.js, jne)
echo.
echo   2. Settings -^> Actions -^> General -^> Workflow permissions
echo      Vali: Read and write permissions -^> Save
echo.
echo   3. Actions tab -^> "Uuenda edetabel" -^> Run workflow
echo      Oota et tuleb roheline linnuke (~30 sek)
echo.
echo   4. Tule tagasi Claude juurde, kontrollime Netlify
echo      ja seome saidi GitHub-iga.
echo ============================================================
echo.
start "" "https://github.com/priitraudla-tech/viljandi-edetabel/settings/actions"
pause
