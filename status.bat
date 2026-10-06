@echo off
title ProChat Server Status
echo Checking ProChat Server Status...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001 ^| findstr LISTENING') do (
    echo [RUNNING] ProChat server is ACTIVE on http://localhost:3001 (PID: %%a)
    echo You can access http://localhost:3001 in any browser or Chrome extension.
    pause
    exit /b 0
)
echo [STOPPED] ProChat server is NOT currently running.
pause
