SHELL := /bin/sh

.PHONY: dev migrate upgrade

dev:
	docker compose -f infra/docker/docker-compose.yml up -d
	cd apps/api && python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

migrate:
	cd apps/api && alembic revision --autogenerate -m "auto"

upgrade:
	cd apps/api && alembic upgrade head

