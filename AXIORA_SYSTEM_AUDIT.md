# AXIORA_SYSTEM_AUDIT

## 1) Architecture Summary

Axiora is a monorepo modular monolith with:

- Frontend: Next.js App Router (`apps/web`)
- Backend: FastAPI single service with modular route/service packages (`apps/api`)
- Persistence: PostgreSQL (SQLAlchemy/Alembic) + Redis

Primary assembly:
- API bootstrap and router wiring: `apps/api/app/main.py:82-129`
- Web layout/root shell: `apps/web/app/layout.tsx:47-64`

## 2) Learning Engine Overview

The active learning runtime is centered on `/api/learning/*`:

- Session lifecycle: `learning.py:549-697`
- Next-question generation: `learning.py:377-480`
- Answer tracking: `learning.py:483-546`
- Core adaptive engine: `adaptive_learning.py:1116-1310`, `:1344+`, `:1461+`
- Candidate orchestration and diagnostics: `lesson_engine.py:100-235`

Legacy/parallel learning modules remain active:

- `/api/aprender/*` with path and completion economy (`aprender.py`)
- `/learn/*` v2 graph/curriculum APIs (`learn_v2.py`)

## 3) Lesson Execution Pipeline

`/child/aprender/lesson/{id}`

1. Frontend lesson page mounts and reads params
   - `apps/web/app/(app)/child/aprender/lesson/[id]/page.tsx:818-823`
2. Starts session via `/api/learning/session/start`
   - client `client.ts:2566-2577`
   - backend `learning.py:549-631`
3. Backend resolves `lesson -> unit -> subject`, validates age, creates `LearningSession`
   - `learning.py:561-580`
   - `adaptive_learning.py:409-418`
4. Frontend requests `/api/learning/next`
   - `page.tsx:1005-1010`
   - `client.ts:2593-2606`
5. Generator builds candidates from question bank + templates/variants
   - `lesson_engine.py:275-415`
   - `adaptive_learning.py:1177-1310`
6. Frontend renders, evaluates, submits `/api/learning/answer`
   - `page.tsx:1370-1478`
   - `learning.py:483-546`
7. Finish session `/api/learning/session/finish` + completion `/api/aprender/lessons/{id}/complete`
   - `page.tsx:1486-1503`
   - `client.ts:2579-2591`, `:2504-2511`

## 4) Age Restriction Mechanism

Where age is computed:
- `child_age.py:6-10`
- used in `learning.py:193-194`, `aprender.py:109-114`

Where restrictions are enforced:
- Hard gate in adaptive runtime:
  - `learning.py:177-199`
  - message: `"Este conteúdo não está disponível para a sua faixa etária."`
- Subject path mismatch gate:
  - `aprender.py:506-510`
  - message: `"Subject not available for this age group"`
- Subject listing filter by age range:
  - `aprender.py:317-322`

Entity defining limits:
- `Subject.age_group` with derived `age_min/age_max`
  - `models.py:1499-1537`

## 5) Critical Files

See full ranking in `CORE_LEARNING_FILES.md`.

Highest-impact subset:
- `apps/api/app/api/routes/learning.py`
- `apps/api/app/services/adaptive_learning.py`
- `apps/api/app/services/lesson_engine.py`
- `apps/api/app/models.py`
- `apps/web/app/(app)/child/aprender/lesson/[id]/page.tsx`

## 6) Architectural Risks

See full risk log in `ARCHITECTURE_RISKS.md`.

Top risks:
- overlapping learning modules (`aprender`, `learning`, `learn_v2`)
- duplicated progress models (`lesson_progress` vs `student_lesson_progress`)
- dual completion writes in one lesson UX flow
- age gating duplicated with inconsistent message contracts
- oversized lesson frontend runtime file with many responsibilities

## 7) Recommended Next Steps

1. Establish one canonical learning domain contract
- Decide whether `/api/learning` fully supersedes `/api/aprender` and `/learn` for runtime.

2. Consolidate progress/session source of truth
- Define authoritative tables and add invariant tests across both model sets.

3. Unify age-policy module
- Single policy function and shared error payload/message for all learning routes.

4. Refactor lesson frontend runtime
- Split `lesson/[id]/page.tsx` into:
  - session orchestrator hook
  - question renderer components
  - completion/analytics adapter

5. Curriculum governance
- Choose DB-first or YAML-first canonical curriculum and enforce sync tooling.

6. Add explicit contract tests
- End-to-end tests validating:
  - start -> next -> answer -> finish consistency
  - no double-reward on dual completion paths
  - age-gate parity across all relevant endpoints

---

This audit performed static reverse-engineering only (no code modifications), based on route/service/model/front-end flow inspection and existing tests.
