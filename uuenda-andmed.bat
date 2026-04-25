@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo ============================================================
echo   Viljandi edetabel: andmete uuendus enne Netlify upload-i
echo ============================================================
echo.

echo Tombame varskeimad andmed Google Sheetsist...
echo.
python scripts\fetch.py
if errorlevel 1 (
    echo.
    echo VIGA: fetch.py ei tootanud.
    echo Kontrolli, et Python oleks installitud ^(python --version^)
    pause
    exit /b 1
)

echo.
echo ============================================================
echo   Andmed uuendatud!
echo.
echo   JARGMINE - Netlify-le upload:
echo.
echo   1. Mine brauseris oma Netlify projekti lehele
echo      ^(ornate-meringue-293407.netlify.app projekt^)
echo.
echo   2. Sektsioonis "Production deploys" leiad ala
echo      "Drag and drop your project folder here"
echo.
echo   3. Lohista SELLE kausta ^(viljandi-edetabel^) ikoon Windows
echo      Explorer-ist sellele alale.
echo.
echo   4. Oota ~10 sek - sait uueneb sama URL-i all.
echo ============================================================
echo.
pause
