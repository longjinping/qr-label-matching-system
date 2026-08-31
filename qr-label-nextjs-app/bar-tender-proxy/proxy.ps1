<#
  BarTender 打印代理（纯 PowerShell 版）
  无需 Node.js，Windows 自带 PowerShell 即可运行
  启动: powershell -ExecutionPolicy Bypass -File proxy.ps1
#>

$port = 3001
$template = $null

# 查找 .btw 模板
$searchDirs = @(
    "$env:USERPROFILE\Desktop\moban",
    "$env:USERPROFILE\Desktop",
    "E:\kuake"
)
foreach ($dir in $searchDirs) {
    if (Test-Path $dir) {
        $found = Get-ChildItem -Path $dir -Recurse -Filter "*.btw" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($found) { $template = $found.FullName; break }
    }
}
if (-not $template) { Write-Error "未找到 .btw 模板文件"; exit 1 }

# ── 查找 Interop.BarTender.dll（先查 C 盘默认安装路径，找不到则全盘搜索）──
function Find-BarTenderDll {
    # 1. C 盘默认安装路径（优先，速度快）
    $defaultPaths = @(
        "C:\Program Files\Seagull\BarTender 2022\Interop.BarTender.dll",
        "C:\Program Files\Seagull\BarTender 2022 R1\Interop.BarTender.dll",
        "C:\Program Files\Seagull\BarTender 2022 R2\Interop.BarTender.dll",
        "C:\Program Files\Seagull\BarTender\Interop.BarTender.dll",
        "C:\Program Files (x86)\Seagull\BarTender 2022\Interop.BarTender.dll",
        "C:\Program Files (x86)\Seagull\BarTender\Interop.BarTender.dll"
    )
    foreach ($p in $defaultPaths) {
        if (Test-Path $p) { return $p }
    }

    # 2. 全盘搜索兜底
    Write-Host "  C盘默认路径未找到，正在全盘搜索 Interop.BarTender.dll ..." -ForegroundColor Yellow
    $drives = (Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Root }).Root
    foreach ($drive in $drives) {
        try {
            $found = Get-ChildItem -Path $drive -Recurse -Filter "Interop.BarTender.dll" -ErrorAction SilentlyContinue -Force | Select-Object -First 1
            if ($found) { return $found.FullName }
        } catch { }
    }
    return $null
}

$btDll = Find-BarTenderDll
if (-not $btDll) {
    Write-Error "未找到 Interop.BarTender.dll，请确认已安装 BarTender（含 Automation 组件）"
    exit 1
}

Write-Host "========================================"
Write-Host "  BarTender 打印代理（PowerShell 版）"
Write-Host "  地址: http://localhost:$port"
Write-Host "  模板: $template"
Write-Host "  BarTender: $btDll"
Write-Host "========================================"

# PowerShell HTTP 监听器
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://+:$port/")
$listener.Start()

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $req = $context.Request
    $res = $context.Response

    # CORS
    $res.Headers.Add("Access-Control-Allow-Origin", "*")
    $res.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    $res.Headers.Add("Access-Control-Allow-Headers", "Content-Type")
    $res.ContentType = "application/json"

    if ($req.HttpMethod -eq "OPTIONS") {
        $res.StatusCode = 200
        $res.Close()
        continue
    }

    if ($req.HttpMethod -eq "GET") {
        $bytes = [Text.Encoding]::UTF8.GetBytes('{"ok":true,"ready":true}')
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
        $res.Close()
        continue
    }

    if ($req.HttpMethod -ne "POST" -or $req.Url.AbsolutePath -ne "/print") {
        $res.StatusCode = 404
        $bytes = [Text.Encoding]::UTF8.GetBytes('{"error":"Not found"}')
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
        $res.Close()
        continue
    }

    # 读取请求体
    $reader = New-Object System.IO.StreamReader($req.InputStream)
    $body = $reader.ReadToEnd()
    $reader.Close()

    try {
        $d = $body | ConvertFrom-Json
        $time = (Get-Date).ToString("HH:mm:ss")
        Write-Host "[$time] $($d.delivery_no)/$($d.batch_no)"

        # 调用 BarTender COM 打印
        Add-Type -Path $btDll -ErrorAction Stop
        $bt = New-Object BarTender.ApplicationClass
        $fmt = $bt.Formats.Open($template, 0, "")

        # 设置 NamedSubStrings
        $fmt.SetNamedSubStringValue("material_code", $d.material_code)
        $fmt.SetNamedSubStringValue("material_desc", $d.material_desc)
        $fmt.SetNamedSubStringValue("batch_no", $d.batch_no)
        $fmt.SetNamedSubStringValue("batch_no1", $d.production_batch)
        $fmt.SetNamedSubStringValue("production_batch", $d.production_batch)
        $fmt.SetNamedSubStringValue("qty", "$($d.qty)")
        $fmt.SetNamedSubStringValue("delivery_no", $d.delivery_no)

        Write-Host "  PRINT_START"
        $fmt.PrintOut(0, 0)
        Write-Host "  PRINT_END"
        $fmt.Close(2)
        $bt.Quit(2)
        Write-Host "  成功"

        $bytes = [Text.Encoding]::UTF8.GetBytes('{"ok":true}')
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } catch {
        Write-Host "  失败: $_"
        $errJson = '{"error":"' + ($_.ToString() -replace '"', "'") + '"}'
        $bytes = [Text.Encoding]::UTF8.GetBytes($errJson)
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
    }
    $res.Close()
}

$listener.Stop()
