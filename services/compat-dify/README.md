# compat:dify Stub Service

这是 `7Flows` 的 `compat:dify` 最小适配服务骨架。

当前目标不是实现完整的 Dify 插件安装与运行，而是先提供一套稳定、可测试的独立服务边界：

- `GET /healthz`
- `POST /invoke`

## 本地运行

```powershell
cd services/compat-dify
..\..\api\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8091
```

## 环境变量

- `SEVENFLOWS_COMPAT_DIFY_ADAPTER_ID`
- `SEVENFLOWS_COMPAT_DIFY_STUB_MODE`
- `SEVENFLOWS_COMPAT_DIFY_HEALTH_STATUS`
- `SEVENFLOWS_COMPAT_DIFY_DEFAULT_LATENCY_MS`

## 当前边界

- 只支持 `compat:dify`
- `/invoke` 仅返回 echo/stub 结果
- 不负责 manifest 安装、工具发现、凭证解密和真实插件执行
