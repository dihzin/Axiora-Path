# CORE_LEARNING_FILES

Top 20 files controlling the learning system, ranked by architectural impact.

1. `apps/api/app/api/routes/learning.py`
- Adaptive runtime API contract: path, next, answer, session start/finish, age gate.

2. `apps/api/app/services/adaptive_learning.py`
- Core engine for focus skills, question selection, mastery updates, session rewards.

3. `apps/api/app/services/lesson_engine.py`
- Concrete candidate orchestration and diagnostics for adaptive content batches.

4. `apps/api/app/models.py`
- Canonical ORM definitions for subjects/skills/lessons/questions/sessions/progress.

5. `apps/web/app/(app)/child/aprender/lesson/[id]/page.tsx`
- Primary learning session UI runtime and backend integration choreography.

6. `apps/web/lib/api/client.ts`
- Frontend-to-backend learning API surface (`/api/learning/*`, `/api/aprender/*`).

7. `apps/web/hooks/useTrailData.ts`
- Path subject selection, child-aware subject loading, path hydration.

8. `apps/web/components/trail/TrailScreen.tsx`
- Entry UX that drives lesson route navigation and subject context.

9. `apps/api/app/api/routes/aprender.py`
- Subject/unit/lesson endpoints, completion endpoint, age filtering.

10. `apps/api/app/services/aprender.py`
- Subject path build, unlock rules, completion economy, difficulty-age policy.

11. `apps/api/app/services/learning_path_events.py`
- Builds path nodes and event progression consumed by `/api/learning/path`.

12. `apps/api/app/services/learning_insights.py`
- Generates insights used for path guidance and coaching context.

13. `apps/api/app/services/child_age.py`
- Shared age calculation primitive.

14. `apps/api/app/api/deps.py`
- Auth/tenant/membership guards that gate all learning routes.

15. `apps/api/app/services/curriculum_loader.py`
- YAML curriculum loader and validation for `learn_v2` domain.

16. `apps/api/app/services/skill_graph.py`
- Skill graph traversal and age-group-aware next-skill heuristics.

17. `apps/api/app/api/routes/learn_v2.py`
- Alternate learning API surface tied to graph/curriculum loader.

18. `apps/api/app/models_learning.py`
- Additional student progress tables (`student_*`) affecting v2 behavior.

19. `apps/api/app/main.py`
- API assembly, middleware chain, router registration.

20. `apps/api/app/services/learning_repository.py`
- Student mastery/progress write model used by `learn_v2` completion flow.
