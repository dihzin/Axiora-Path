# PROJECT_MAP

## 1) Architecture Style

- **Style:** modular monolith inside a monorepo, with two runtime applications:
  - `apps/web` (Next.js frontend)
  - `apps/api` (FastAPI backend)
- **Data plane:** shared PostgreSQL via SQLAlchemy/Alembic; Redis for runtime/schedulers.
- **Evidence:**
  - Monorepo definition: `README.md`
  - API composition in one process with many routers: `apps/api/app/main.py:82-129`

## 2) Main Directories and Responsibilities

- `apps/web`
  - Next.js App Router pages and layouts (`app/...`)
  - Child learning UX (`app/(app)/child/aprender/...`, `components/trail/...`, `hooks/useTrailData.ts`)
  - API client abstraction (`lib/api/client.ts`)
- `apps/api`
  - FastAPI app bootstrap (`app/main.py`)
  - Route layer (`app/api/routes/*.py`)
  - Domain services (`app/services/*.py`)
  - ORM models (`app/models.py`, `app/models_learning.py`)
  - DB migration history (`alembic/versions/*.py`)
  - Curriculum source files (`app/curriculum/subjects/*.yaml`)
- `packages/shared`
  - shared TS types/schemas for web package consumption (`packages/shared/src/*`)
- `infra/docker`
  - local infra composition (Postgres/Redis)

## 3) Frontend Framework and Structure

- **Framework:** Next.js 15 + React 19 + TypeScript (`apps/web/package.json`).
- **Routing style:** App Router with grouped segment `(app)`.
- **Key learning routes:**
  - Path hub: `apps/web/app/(app)/child/aprender/page.tsx:12-42`
  - Lesson runtime: `apps/web/app/(app)/child/aprender/lesson/[id]/page.tsx:818+`
- **Data access:** centralized in `apps/web/lib/api/client.ts` (`startLearningSession`, `getAdaptiveLearningNext`, `submitAdaptiveLearningAnswer`, `finishLearningSession`, `completeAprenderLesson` at `:2566-2627`, `:2504-2511`).

## 4) Backend Framework and Services

- **Framework:** FastAPI + dependency-injected SQLAlchemy sessions.
- **App bootstrap:** `apps/api/app/main.py:82-129`.
- **Learning-related route modules:**
  - `apps/api/app/api/routes/learning.py`
  - `apps/api/app/api/routes/aprender.py`
  - `apps/api/app/api/routes/learn_v2.py`
- **Service layer highlights:**
  - Adaptive/session engine: `apps/api/app/services/adaptive_learning.py`
  - Question selection/orchestration: `apps/api/app/services/lesson_engine.py`
  - Lesson completion/path rules: `apps/api/app/services/aprender.py`
  - Curriculum parsing: `apps/api/app/services/curriculum_loader.py`

## 5) Data Layer

- **ORM:** SQLAlchemy models in:
  - `apps/api/app/models.py` (core + learning + platform)
  - `apps/api/app/models_learning.py` (student-centric v2 tables)
- **Session factory:** `apps/api/app/db/session.py:6-7`
- **Migration chain:** `apps/api/alembic/versions/*.py` (including learning module evolutions like `0031+`, `0086+`, `0090+`, `0101+`).

## 6) Domain Modules (Learning-Centric)

- `aprender` legacy/gamified lesson path APIs (`/api/aprender/*`) and completion economy.
- `learning` adaptive runtime APIs (`/api/learning/*`) for session start/next/answer/finish.
- `learn_v2` alternative curriculum graph APIs (`/learn/*`) using YAML curriculum + skill graph.
- `axion_*` modules layered over learning for policy/messaging/boost/experiments.

## Architecture Summary

Axiora is a **single backend service with strong internal modularization**, serving a **single Next.js frontend** in the same monorepo. Learning is implemented by overlapping modules (`aprender`, `learning`, `learn_v2`) sharing common entities (`subjects`, `skills`, `lessons`, progress/session models), with age gating enforced both at subject selection and adaptive session question retrieval.
