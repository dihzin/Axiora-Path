# ARCHITECTURE_RISKS

## Critical

1. **Parallel learning stacks with overlapping responsibilities**
- Files:
  - `apps/api/app/api/routes/aprender.py`
  - `apps/api/app/api/routes/learning.py`
  - `apps/api/app/api/routes/learn_v2.py`
- Risk:
  - three APIs (`/api/aprender`, `/api/learning`, `/learn`) manage related concepts (subject/skill/lesson/progress/session).
  - high drift probability in business rules and data interpretation.

2. **Duplicated progression stores (`lesson_progress` vs `student_lesson_progress`)**
- Files:
  - `apps/api/app/models.py:1595-1613` (`LessonProgress`)
  - `apps/api/app/models_learning.py:35-50` (`StudentLessonProgress`)
- Risk:
  - split source of truth for lesson completion and attempts.
  - reconciliation bugs likely across routes/services.

3. **Dual completion writes in one frontend lesson flow**
- Files:
  - `apps/web/app/(app)/child/aprender/lesson/[id]/page.tsx:1486-1503`
  - `apps/web/lib/api/client.ts:2504-2511`, `:2579-2591`
- Risk:
  - same user action can touch both `/api/learning/session/finish` and `/api/aprender/lessons/{id}/complete`.
  - idempotency and reward consistency pressure.

## High

4. **Age gate logic implemented in multiple places/messages**
- Files:
  - `learning.py:177-199` (Portuguese 403)
  - `aprender.py:506-510` (English 403)
  - `aprender.py:317-324` (subject filtering)
- Risk:
  - inconsistent UX semantics and potential divergence in enforcement paths.

5. **Heavy service coupling through internal helper imports**
- File:
  - `apps/api/app/services/lesson_engine.py:24`
- Risk:
  - `lesson_engine` depends on many private helpers from `adaptive_learning` (`adaptive._*`).
  - internals are coupled instead of stable public interface.

6. **Mixed curriculum sources (DB + YAML graph)**
- Files:
  - DB-driven entities: `models.py` (`subjects/skills/lessons`)
  - YAML-driven curriculum: `curriculum_loader.py:34-77`, `app/curriculum/subjects/*.yaml`
- Risk:
  - two canonical curricula can diverge (content rollout, ordering, age group semantics).

7. **Frontend lesson component is too large and multi-concerned**
- File:
  - `apps/web/app/(app)/child/aprender/lesson/[id]/page.tsx` (2000+ lines)
- Risk:
  - UI, orchestration, fallback engine, analytics, state machine, and persistence in one file.
  - high change risk/regression surface.

## Medium

8. **Error/fallback behavior complexity may hide backend data issues**
- Files:
  - frontend offline fallback `page.tsx:1178-1191`, `:1675-1753`
  - path fallback in hook `useTrailData.ts:336-343`
- Risk:
  - user flow continues while source content is missing/rejected; root-cause visibility reduced.

9. **Potential language/encoding inconsistency in source strings**
- Example:
  - `lesson_engine.py:503` string shows mojibake (`A crianÃ§a`)
- Risk:
  - content quality/noise in generated prompts, tests and user-facing text.

10. **Route-level business logic still substantial (not thin controllers)**
- Files:
  - `learning.py` and `aprender.py` contain orchestration + policy checks + fallback branches.
- Risk:
  - harder isolated testing and higher coupling between HTTP transport and domain rules.

## Missing Validation / Guard Gaps

11. **No explicit unified contract ensuring single canonical completion path**
- Symptom:
  - completion touches both adaptive session finish and aprender completion endpoints.
- Risk:
  - duplicated reward/streak updates if contracts evolve.

12. **No explicit cross-module invariants between `models.py` and `models_learning.py`**
- Risk:
  - drift between user-level and student-level aggregates/progress semantics.

## Dead/Unclear Boundary Signals

13. **`learn_v2` appears partially parallel to main `learning` runtime**
- File:
  - `apps/api/app/api/routes/learn_v2.py:220+`
- Risk:
  - unclear whether strategic path is migration target or active production path.

14. **`aprender` and `learning` both expose path/lesson concepts**
- Files:
  - `aprender.py` vs `learning.py`
- Risk:
  - domain boundaries are not crisp for new development.

## Suggested Priority

1. Define single authoritative completion and progress ledger.
2. Consolidate age gating into shared policy module + standardized error contract.
3. Split lesson frontend runtime into smaller orchestration/hooks/components.
4. Decide canonical curriculum source (DB vs YAML) and enforce sync pipeline.
