@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo        ProChat - Automated GitHub Free Hosting
echo ========================================================
echo.

:: Check Git installation
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Git is not installed or not in PATH!
    echo Please install Git from https://git-scm.com/
    pause
    exit /b 1
)

:: Check if git remote origin is configured
git remote get-url origin >nul 2>nul
if %errorlevel% neq 0 (
    echo [!] No GitHub repository is linked yet.
    echo.
    echo Follow these 2 steps if you haven't created a GitHub repository yet:
    echo  1. Go to https://github.com/new
    echo  2. Create a new repository named "prochat" (Public or Private)
    echo.
    set /p REPO_URL="Enter your GitHub repository URL (e.g. https://github.com/yourname/prochat.git): "
    if "!REPO_URL!"=="" (
        echo [ERROR] Repository URL cannot be empty.
        pause
        exit /b 1
    )
    git remote add origin !REPO_URL!
    echo [OK] Remote origin added: !REPO_URL!
) else (
    for /f "tokens=*" %%a in ('git remote get-url origin') do set CURRENT_REMOTE=%%a
    echo [*] Current GitHub Remote: !CURRENT_REMOTE!
)

echo.
echo [*] Staging all files and committing...
git add -A
git commit -m "Auto deploy update: %date% %time%" 2>nul

echo [*] Setting branch to main...
git branch -M main

echo [*] Pushing to GitHub...
git push -u origin main

if %errorlevel% neq 0 (
    echo.
    echo [!] Push failed. If this is your first push to an existing repo, try:
    echo     git pull origin main --rebase
    echo     git push -u origin main
    pause
    exit /b %errorlevel%
)

echo.
echo ========================================================
echo   SUCCESS! Your code is now pushed to GitHub!
echo ========================================================
echo.
echo AUTOMATIC DEPLOYMENT INSTRUCTIONS:
echo.
echo 1. FREE GITHUB PAGES HOSTING (Frontend):
echo    - Go to your repo on GitHub:
echo      Settings -^> Pages -^> "Build and deployment" Source
echo    - Select: "GitHub Actions" (instead of Deploy from branch)
echo    - That's it! GitHub Actions (.github/workflows/deploy.yml)
echo      will automatically build and deploy your site for FREE!
echo.
echo 2. FREE CLOUD SERVER HOSTING (Backend + WebSockets + DB):
echo    - Go to https://dashboard.render.com/
echo    - Click "New +" -^> "Blueprint"
echo    - Connect this GitHub repo (render.yaml is already configured)
echo    - Render will automatically launch your live Node/Socket.io backend!
echo.
echo Every future time you run this script, your changes will push
echo and automatically deploy everywhere without any manual work!
echo ========================================================
echo.
pause
