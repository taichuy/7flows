# 7Flows Docker

## 仅启动中间件

```powershell
Copy-Item .\middleware.env.example .\middleware.env
docker compose -f .\docker-compose.middleware.yaml up -d
```

默认映射端口：

- PostgreSQL: `35432`
- Redis: `36379`
- RustFS API: `39000`
- RustFS Console: `39001`
- Sandbox: `38194`

`docker/sandbox/config.yaml` 是默认沙盒配置模板，后续如果要接代理、限网或更严格隔离，可以直接在这里扩展。

## 启动整套容器

```powershell
Copy-Item .\.env.example .\.env
docker compose up -d --build
```
