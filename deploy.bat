@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo.
echo ============================================================
echo   Viljandi edetabel: GitHub + Netlify setup
echo ============================================================
echo.

:: --- 1. Check git ---
where git >nul 2>&1
if errorlevel 1 (
    echo VIGA: Git pole installitud.
    echo Lae alla: https://git-scm.com/download/win
    pause
    exit /b 1
)

:: --- 2. Ensure git user config ---
for /f "delims=" %%i in ('git config --global user.name 2^>nul') do set GITNAME=%%i
if "%GITNAME%"=="" (
    echo Git pole konfiguritud. Sisesta oma nimi ja email:
    set /p GITNAME="Nimi (nt Priit Raudla): "
    set /p GITEMAIL="Email: "
    git config --global user.name "!GITNAME!"
    git config --global user.email "!GITEMAIL!"
    echo OK, git konfigureeritud.
    echo.
)

:: --- 3. GitHub repo URL ---
echo --------------------------------------------------------
echo  SAMM 1: Loo GitHubis uus repo ^(kui pole veel teinud^)
echo --------------------------------------------------------
echo.
echo Avan brauseris GitHub'i lehe...
start "" "https://github.com/new"
echo.
echo Brauseris:
echo   - Repository name: viljandi-edetabel
echo   - Vali: Public  ^(tasuta Netlify ja Actions toimivad ainult avaliku reposega^)
echo   - AARA initialiseeri README/gitignore/license-iga ^(jata koik tuhjaks^)
echo   - Klops: Create repository
echo.
echo Parast loomist nadid GitHub URL'i kujul:
echo   https://github.com/sinu-nimi/viljandi-edetabel.git
echo.

set /p REPO_URL="Kleebi siia repo URL ^(.git lopuga^): "

if "%REPO_URL%"=="" (
    echo Ei sisestanud URL'i. Lopetatud.
    pause
    exit /b 1
)

:: --- 4. Init + commit + push ---
echo.
echo --------------------------------------------------------
echo  SAMM 2: Push GitHub'i
echo --------------------------------------------------------
echo.

if not exist ".git" (
    echo Initialiseerin git repo...
    git init -b main >nul
    if errorlevel 1 (
        :: Older git versions don't support -b
        git init >nul
        git checkout -b main >nul 2>&1
    )
)

echo Lisan failid...
git add .

echo Tegen commit'i...
git commit -m "init: edetabel + ElevenLabs disain + delta indikaator + detail-paneel" >nul 2>&1
if errorlevel 1 (
    echo ^(Commit on juba olemas voi midagi pole muutnud - jatkan^)
)

echo Lisan remote...
git remote remove origin >nul 2>&1
git remote add origin "%REPO_URL%"

echo Push'in GitHub'i ^(brauser voib avada autentimise akna^)...
git push -u origin main
if errorlevel 1 (
    echo.
    echo Push ebaonnestus.
    echo Kontrolli:
    echo   - URL on oige ja loppeb .git-iga
    echo   - GitHub konto loginud ^(brauseris peaks akna avama^)
    echo   - Repo on tuhi GitHubis ^(ei initsialiseeritud^)
    pause
    exit /b 1
)

:: --- 5. Open Actions settings page ---
echo.
echo --------------------------------------------------------
echo  SAMM 3: Anna Actions'ile push'imis-oigus
echo --------------------------------------------------------
echo.
echo Avan brauseris repo Actions seaded...
echo.

:: Strip .git suffix from URL for browser link
set BROWSER_URL=%REPO_URL:.git=%
start "" "%BROWSER_URL%/settings/actions"
echo.
echo Brauseris ^(Settings -^> Actions -^> General^):
echo   1. Keri alla "Workflow permissions"
echo   2. Vali: Read and write permissions
echo   3. Klops: Save
echo.
pause

:: --- 6. Trigger first workflow run ---
echo.
echo --------------------------------------------------------
echo  SAMM 4: Kaivita workflow esimest korda
echo --------------------------------------------------------
echo.
echo Avan brauseris Actions'i...
start "" "%BROWSER_URL%/actions"
echo.
echo Brauseris:
echo   1. Vasakul nimekirjas klops: "Uuenda edetabel"
echo   2. Paremal: Run workflow -^> main -^> Run workflow
echo   3. Oota et tuleb roheline linnuke ^(~30 sek^)
echo.
pause

:: --- 7. Netlify ---
echo.
echo --------------------------------------------------------
echo  SAMM 5: Netlify ^(autodeploy iga GitHub commit-i jarel^)
echo --------------------------------------------------------
echo.
echo Avan Netlify import lehe...
start "" "https://app.netlify.com/start"
echo.
echo Brauseris ^(Netlify^):
echo   1. Logi sisse ^(GitHub konto - lihtsaim^)
echo   2. Klops: Import an existing project
echo   3. Vali: GitHub
echo   4. Authorize ^(annab Netlify ligipaasu reposse^)
echo   5. Vali repo: viljandi-edetabel
echo   6. Build settings ^(jata koik tuhjaks - netlify.toml teeb tood^)
echo   7. Klops: Deploy site
echo.
echo Saad URL'i ~30 sek parast.
echo.
echo Korralikuks nimeks:
echo   Site configuration -^> Change site name -^> nt "viljandi-edetabel"
echo.

echo ============================================================
echo   VALMIS! Edaspidi koik on automaatne:
echo   - Iga paev kell 04:00 UTC: Actions tombab Sheetsist andmed
echo   - Kui andmed muutusid: commit + push GitHub-i
echo   - Netlify naeb commit-i: deploy ~30 sek
echo   - Sait uueneb ise.
echo ============================================================
echo.
pause
