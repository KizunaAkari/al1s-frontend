# AL-1S Platform Frontend

独立 Vue 3 管理端工程，业务页面按模块实现，支持日间/夜间/跟随系统主题。
完整运行环境由[平台仓库](https://github.com/KizunaAkari/al1s-platform)统一构建；平台镜像已包含前端。本 README 只说明公开构建入口，不维护现场版本。

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
```

## 克隆与开发

需要 Node.js 24；Linux/macOS 使用 `npm`，Windows PowerShell 可使用 `npm.cmd`。

```sh
git clone https://github.com/KizunaAkari/al1s-frontend.git
cd al1s-frontend
npm ci
npm run dev
```

按需将 `.env.example` 复制为 `.env.local`。`VITE_*` 值会进入浏览器构建，只填写公开配置，不放 Token 或密码。生产静态资源输出到 `dist/`。

## 独立前端容器

从本仓库根目录执行，无需先在宿主机运行 npm：

```sh
docker build -t al1s-frontend:local .
```

容器内 Nginx 监听 `8080`，将 `/api/` 转发到同一 Docker 网络中的 `backend:8000`。该镜像只包含前端，单独启动不会自动创建后端。完整平台镜像按照[平台构建说明](https://github.com/KizunaAkari/al1s-platform#构建容器镜像)从平台仓库根目录构建。
