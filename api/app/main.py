from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.routes.health import router as health_router
from app.api.routes.plugins import router as plugin_router
from app.api.routes.published_endpoint_activity import router as published_endpoint_activity_router
from app.api.routes.published_endpoint_cache import router as published_endpoint_cache_router
from app.api.routes.published_endpoint_keys import router as published_endpoint_key_router
from app.api.routes.published_gateway import router as published_gateway_router
from app.api.routes.run_callback_tickets import router as run_callback_ticket_router
from app.api.routes.run_views import router as run_view_router
from app.api.routes.runs import router as run_router
from app.api.routes.system import router as system_router
from app.api.routes.workflow_library import router as workflow_library_router
from app.api.routes.workflow_publish import router as workflow_publish_router
from app.api.routes.workflows import router as workflow_router
from app.api.routes.workspace_starters import router as workspace_starter_router
from app.core.config import get_settings
from app.core.database import initialize_database


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title=settings.app_name,
        debug=settings.debug,
        version="0.1.0",
        lifespan=lifespan,
    )
    application.include_router(health_router)
    application.include_router(published_gateway_router)
    application.include_router(plugin_router, prefix="/api")
    application.include_router(system_router, prefix="/api")
    application.include_router(workflow_router, prefix="/api")
    application.include_router(workflow_publish_router, prefix="/api")
    application.include_router(published_endpoint_activity_router, prefix="/api")
    application.include_router(published_endpoint_cache_router, prefix="/api")
    application.include_router(published_endpoint_key_router, prefix="/api")
    application.include_router(workflow_library_router, prefix="/api")
    application.include_router(workspace_starter_router, prefix="/api")
    application.include_router(run_router, prefix="/api")
    application.include_router(run_callback_ticket_router, prefix="/api")
    application.include_router(run_view_router, prefix="/api")
    return application


app = create_app()
