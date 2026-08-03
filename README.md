# AL-1S Frontend

AL-1S 脚本站的 Vue 3 前端。页面通过 `/api` 访问平台后端，并在编辑器中提供 Android 设备控制、脚本标注、任务和失败记录管理。

## 开发

```powershell
npm.cmd install
$env:VITE_BACKEND_TARGET = "http://127.0.0.1:8000"
npm.cmd run dev
```

生产构建：

```powershell
npm.cmd run typecheck
npm.cmd run build
```

平台后端位于 [al1s-platform](https://github.com/KizunaAkari/al1s-platform)，终端 Agent 位于 [al1s-terminal](https://github.com/KizunaAkari/al1s-terminal)。
