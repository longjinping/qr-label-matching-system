' 无窗口启动 BarTender 代理（PowerShell 版，无需 Node.js）
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell -ExecutionPolicy Bypass -File proxy.ps1", 0, False
Set WshShell = Nothing
