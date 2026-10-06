@echo off
title Stop ProChat Server
echo Stopping ProChat Server running on port 3001...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001 ^| findstr LISTENING') do (
    echo Terminating process PID: %%a
    taskkill /F /PID %%a
)
echo ProChat Server stopped.
pause
