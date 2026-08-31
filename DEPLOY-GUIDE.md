# QR 标签校验系统 — 云端部署指南

> 适用场景：将系统部署到云服务器，让另一台电脑的用户 B 通过浏览器访问云端页面，
> 并在自己电脑上用 BarTender 打印标签。

## 架构总览

```
                      云端服务器 (Linux)
┌─────────────────────────────────────────────────────┐
│  Nginx / Caddy (反向代理 + SSL，可选)                 │
│    └── https://your-domain.com ──→ Next.js :3000    │
│                                                     │
│  Docker Compose (docker-compose.prod.yml)           │
│  ┌─────────────────────┐  ┌───────────────────────┐ │
│  │ qr-nextjs (prod)    │  │ qr-db (postgres:16)   │ │
│  │ 端口 3000            │  │ 不暴露公网端口         │ │
│  └─────────────────────┘  └───────────────────────┘ │
└─────────────────────────────────────────────────────┘
                           │ HTTPS
                           ▼ 浏览器访问
┌─────────────────────────────────────────────────────┐
│                用户 B 的 Windows 电脑                 │
│                                                     │
│  浏览器: https://your-domain.com                     │
│                                                     │
│  BarTender 打印代理 (本地后台服务)                    │
│    └── http://localhost:3001/print                   │
│         ↑ 浏览器 JS 直接调用本机 localhost            │
└─────────────────────────────────────────────────────┘
```

**关键原理**：页面打印时浏览器端执行 `fetch('http://localhost:3001/print')`，
这个请求会连到**用户 B 自己电脑**上的本地代理，而不是云服务器。因此 proxy.js
天然支持多用户，无需任何修改。

---

## 第一部分：云服务器部署

### 1. 服务器准备

- 云服务器（建议 2核4G 以上，Linux）
- 安装 Docker + Docker Compose：
  ```bash
  curl -fsSL https://get.docker.com | sh
  docker compose version   # 确认可用
  ```

### 2. 上传代码

把项目根目录（含 `qr-label-nextjs-app/`、`docker-compose.prod.yml`、`.env.production`）上传到服务器，例如 `/opt/qr-label`。

### 3. 配置环境变量

编辑 `.env.production`：

```env
DB_HOST=postgres
DB_PORT=5432
DB_NAME=qr_label_matching
DB_USER=qruser
DB_PASS=替换为强密码
DB_SSL=false
```

> 若使用云数据库（如 RDS），将 `DB_HOST` 改为数据库地址，`DB_SSL=true`。

### 4. 构建并启动

```bash
cd /opt/qr-label
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

### 5. 初始化数据库

首次启动后数据库为空，需要初始化表结构和导入数据：

```bash
# 表结构（schema.sql 在 qr-label-nextjs-app/ 目录）
docker exec -i qr-db psql -U qruser -d qr_label_matching < qr-label-nextjs-app/schema.sql

# 初始数据：打开网页 http://服务器IP:3000，用 Excel 上传功能导入
```

### 6. （可选）域名 + HTTPS

推荐用 Caddy（自动 HTTPS）或 Nginx：

```caddyfile
your-domain.com {
    reverse_proxy localhost:3000
}
```

### 7. 一键部署脚本（备用）

已有 `scripts/deploy-prod.sh`，在 Linux/macOS/WSL 上执行可自动完成
「本地构建镜像 → 导出 → 上传 → 服务器加载启动」全流程。

---

## 第二部分：用户 B 本地配置（Windows）

### 1. 安装 Node.js 20+

下载地址：https://nodejs.org/ （选择 LTS 20.x 或更新版本）

验证：
```powershell
node -v
npm -v
```

### 2. 拷贝打印代理文件夹

将 `qr-label-nextjs-app/bar-tender-proxy/` 整个文件夹拷贝到用户 B 电脑，如 `C:\bar-tender-proxy`。

### 3. 安装 BarTender 2022

- 必须包含 **Automation / COM 组件**（安装时勾选）
- 安装完成后确认注册表存在 `Interop.BarTender.dll` 或 COM 组件可被 PowerShell 调用

### 4. 放置标签模板

- 在用户 B 的桌面创建 `moban` 文件夹：`Desktop\moban\`
- 将打印所需的 `.btw` 标签模板放入该目录
- 确保模板中的命名数据源与打印代码一致（如 `material_code`、`material_desc`、`batch_no`、`qty`、`delivery_no` 等）

### 5. 安装标签打印机驱动

- 安装打印机驱动并设为默认打印机
- 在 BarTender 中确认模板绑定正确的打印机

### 6. 启动打印代理（设置开机自启）

在 `bar-tender-proxy` 文件夹内：

```powershell
# 首次：安装依赖
npm install

# 启动代理（保持窗口运行）
node proxy.js
```

> 如需开机自启，可运行 `install-startup.bat`（或手动创建计划任务）。
> 代理默认监听 `http://localhost:3001`。

### 7. 浏览器访问云端页面

打开：`http://服务器IP:3000`（或 https 域名）

**注意**：若云端页面是 HTTPS 而代理是 HTTP，浏览器会拦截混合内容。
此时需要将代理也升级为 HTTPS（`proxy.js` 已支持 HTTPS 配置），
或使用 HTTP 访问云端页面。

---

## 常见问题排查

| 问题 | 排查方向 |
|------|----------|
| 页面打不开 | 检查服务器防火墙是否放行 3000 端口 |
| 打印无反应 | 确认用户 B 本机 `proxy.js` 已启动、访问 `http://localhost:3001/health` 有响应 |
| 浏览器拦截打印请求 | 检查代理 CORS 头（`Access-Control-Allow-Origin: *`）是否生效 |
| 数据库连接失败 | 检查 `.env.production` 中 `DB_HOST/DB_USER/DB_PASS` 是否正确 |
| 模板打印错误 | 确认模板文件名/路径、命名数据源、打印机名称与代码一致 |

---

## 安全注意事项

- 数据库使用强密码，不要用默认密码
- `.env.production` 包含敏感信息，不要提交到 Git
- 生产环境建议通过 Nginx/Caddy 加 HTTPS
- 如有需要，后续可添加登录认证、IP 白名单等
