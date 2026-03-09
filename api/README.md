# 7Flows API

## 本地开发

```powershell
Copy-Item .env.example .env
py -m venv .venv
.venv\Scripts\Activate.ps1
py -m pip install -e .[dev]
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Worker

```powershell
celery -A app.core.celery_app.celery_app worker --loglevel INFO --pool solo
```
