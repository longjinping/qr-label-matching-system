# QR 标签校验系统 — 运行指南（同事版）

## 前置条件

**只需安装 Docker Desktop**（Windows/Mac）：  
https://www.docker.com/products/docker-desktop/

不需要安装 Node.js、npm 或任何其他工具。

---

## 方式一：从 tar 文件导入（U 盘/共享文件夹）

> 由项目负责人先执行一次构建导出：
> ```powershell
> .\scripts\build-export.ps1
> ```
> 将生成的 `qr-label-frontend-latest.tar` 发给同事。

同事拿到文件后：

```powershell
# 1. 导入镜像
docker load -i qr-label-frontend-latest.tar

# 2. 启动项目
docker compose -f docker-compose.run.yml up -d

# 3. 打开浏览器访问
# http://localhost:3000/label-check
```

---

## 方式二：从镜像仓库拉取

> 由项目负责人先执行一次 `.\scripts\build-push.ps1` 推送到仓库。

同事执行：

```powershell
# 1. 拉取镜像
docker pull 你的仓库/qr-label-frontend:latest

# 2. 修改 docker-compose.run.yml 中的 image 为你的仓库地址
# 将 image: qr-label-frontend:latest
# 改为 image: 你的仓库/qr-label-frontend:latest

# 3. 启动项目
docker compose -f docker-compose.run.yml up -d

# 4. 打开浏览器访问
# http://localhost:3000/label-check
```

---

## 停止 / 重启 / 更新

```powershell
# 停止
docker compose -f docker-compose.run.yml down

# 重启
docker compose -f docker-compose.run.yml restart

# 更新镜像后重新部署
docker compose -f docker-compose.run.yml down
docker compose -f docker-compose.run.yml up -d
```

---

## 端口说明

| 服务 | 端口 |
|------|------|
| 前端页面 | `3000` |
| 数据库 | `5432` |
