# QR Label Matching System (Next.js)

This app is a full Next.js redesign of the QR matching demo.

## Run In Development

1. Install dependencies:

```bash
npm install
```

2. Start dev server:

```bash
npm run dev
```

3. Open:

https://localhost:3000

If you want to open it on your phone, use your Mac's LAN IP over HTTPS, for example:

https://192.168.16.175:3000

## Main Features

- Supplier scan (simulated picker or real camera)
- Buyer label generation
- Buyer scan (simulated or real camera)
- Match verification through API route
- Database preview tabs

## Project Structure

- src/app/page.js: Main client UI flow
- src/components/StepProgress.jsx: 7-step progress indicator
- src/components/CameraScannerModal.jsx: Camera QR scanner modal
- src/components/DataPreviewTabs.jsx: Supplier/Buyer/Mapping preview tables
- src/lib/store.js: In-memory data store and matching logic
- src/app/api/*: API route handlers

## API Endpoints

- GET /api/health
- GET /api/suppliers
- GET /api/buyers?supplier_desc=A1B3
- POST /api/scan/supplier
- POST /api/scan/verify
- GET /api/scan-log
- POST /api/print/label

## Camera Notes

- Camera access requires HTTPS or localhost.
- If the browser shows a certificate warning the first time, trust the local dev certificate before trying the camera.
- The printer target defaults to `http://192.168.16.142:631/ipp/print` and can be overridden with `PRINTER_URI`.

## USB Thermal Printer (ESC/POS) on macOS

If your printer is a 58mm USB ESC/POS model (for example AY-D5811), use CUPS raw queue mode.

1. Detect USB device URI:

```bash
lpinfo -v
```

2. Create a raw queue (replace URI with your detected usb://... value):

```bash
sudo lpadmin -p AY_D5811_RAW -E -v "usb://TECH/CLA58?serial=4250315730383618" -m raw
sudo cupsenable AY_D5811_RAW
sudo cupsaccept AY_D5811_RAW
```

If macOS reports that raw queues are not supported, add the printer in System Settings first,
then use that queue name with `PRINTER_MODE=cups_raw`. The app sends bytes using `lp -o raw`.

3. Set environment mode before starting app:

```bash
export PRINTER_MODE=cups_raw
export CUPS_QUEUE_NAME=AY_D5811_RAW
npm run dev
```

In `cups_raw` mode, `/api/print/label` sends ESC/POS bytes to CUPS with `lp -o raw`.
In default `ipp` mode, `/api/print/label` sends PDF/IPP to network printer URI.

## BarTender 模板打印集成

本应用支持使用 **BarTender Enterprise Automation** 的 Integration Service REST API 打印预设标签模板（.btw），替代原有的 PDF/IPP 打印方式。

### 架构说明

```
┌──────────────────┐    fetch('/api/print/bar-tender-data')   ┌────────────────────┐
│   浏览器          │ ─────────────────────────────────────────  │   Next.js API      │
│   (客户端PC)      │                                           │   (服务器 Docker)   │
│                   │   fetch('http://localhost:51621/api/v1/print')                  │
│   页面点击打印     │ ────────────────────────────────────────  │                     │
│                   │   BarTender Integration Service                               │
│                   │   (客户端PC - localhost:51621)                                │
└──────────────────┘                                           └────────────────────┘
```

由于 BarTender 安装在客户端 Windows PC 上（而非服务器），前端浏览器直接调用客户端本地的 BarTender IS REST API。

### 客户端准备工作

1. **安装 BarTender Enterprise Automation**（已包含 Integration Service）
2. **确认 Integration Service 正在运行**：
   - 默认监听端口：`localhost:51621`
   - 验证：浏览器访问 `http://localhost:51621/api/v1/swagger`
3. **标签模板文件**：
   - 将 `.btw` 模板放置于固定路径（如 `C:\BarTender\Templates\LaberTemplate.btw`）
   - 模板中需包含以下命名数据源（NamedDataSources）：
     - `material_code` - 物料编码
     - `material_desc` - 物料描述
     - `batch_no` - 批次号
     - `qty` - 数量
     - `delivery_no` - 发货单号
4. **CORS 配置**（必需）：
   - 编辑 Integration Service 配置文件：
     `C:\Program Files\Seagull\BarTender Suite\Integration Service\appsettings.json`
   - 添加/修改：
     ```json
     "CorsOrigins": ["http://<WEB服务器IP>:3000"]
     ```
   - 如开发环境通过 `localhost:3000` 访问，则配置：
     ```json
     "CorsOrigins": ["http://localhost:3000"]
     ```
   - 修改完成后**重启 BarTender Integration Service**
5. **打印机配置**：在 BarTender 中为模板配置好打印机

### 环境变量

在 `docker-compose.yml` 或 `.env.local` 中配置：

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `NEXT_PUBLIC_PRINT_MODE` | 打印模式：`bar_tender` 或 `ipp` | `ipp` |
| `NEXT_PUBLIC_BT_TEMPLATE_PATH` | BarTender 模板文件路径 | `C:\BarTender\Templates\LaberTemplate.btw` |
| `NEXT_PUBLIC_BT_PRINTER_NAME` | 打印机名称（可选，空则使用模板默认打印机） | 空 |
| `NEXT_PUBLIC_BAR_TENDER_IS_URL` | BarTender IS 地址 | `http://localhost:51621` |

### 切换打印模式

- 设置 `NEXT_PUBLIC_PRINT_MODE=bar_tender` 启用 BarTender 打印
- 设置 `NEXT_PUBLIC_PRINT_MODE=ipp` 恢复原有 PDF/IPP 打印（默认）

### 新增 API 端点

- `POST /api/print/bar-tender-data` — 根据 `materialDesc` + `batchNo` 查询 delivery 表，返回打印所需数据
