#!/bin/bash

set -e

if [[ "${SEVENFLOWS_MIGRATION_ENABLED}" == "true" ]]; then
  echo "Applying database migrations"
  uv run alembic upgrade head
fi

exec "$@"
