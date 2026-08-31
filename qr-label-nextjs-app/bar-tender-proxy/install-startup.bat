@echo off
cd /d "%~dp0"

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "TARGET=wscript.exe"
set "ARGS=%~dp0start-hidden.vbs"

powershell -Command "$ws = New-Object -ComObject WScript.Shell; $sc = $ws.CreateShortcut('%STARTUP%\BarTenderProxy.lnk'); $sc.TargetPath = '%TARGET%'; $sc.Arguments = '%ARGS%'; $sc.WorkingDirectory = '%~dp0'; $sc.WindowStyle = 7; $sc.Save()"

echo OK! Proxy will auto-start in background without window.
pause
