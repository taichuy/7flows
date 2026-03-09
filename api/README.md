# 7Flows API

## 本地开发

```powershell
Copy-Item .env.example .env
uv sync --extra dev
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Worker

```powershell
uv run celery -A app.core.celery_app.celery_app worker --loglevel INFO --pool solo
```

## 迁移

```powershell
uv run alembic upgrade head
uv run alembic downgrade -1
```
