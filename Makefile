SHELL := /bin/sh

.PHONY: dev migrate upgrade purge-placeholder worker queue-weekly-summary queue-purge

dev:
	docker compose -f infra/docker/docker-compose.yml up -d
	cd apps/api && python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

migrate:
	cd apps/api && alembic revision --autogenerate -m "auto"

upgrade:
	cd apps/api && alembic upgrade head

purge-placeholder:
	cd apps/api && python -c "from app.jobs.purge_deleted_data import run_purge_placeholder; print(run_purge_placeholder())"

worker:
	cd apps/api && python -m app.worker

queue-weekly-summary:
	cd apps/api && python -c "from app.jobs.enqueue import enqueue_weekly_summary; print(enqueue_weekly_summary())"

queue-purge:
	cd apps/api && python -c "from app.jobs.enqueue import enqueue_purge_deleted_data; print(enqueue_purge_deleted_data())"
