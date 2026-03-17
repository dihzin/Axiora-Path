# LESSON_EXECUTION_FLOW

## Traced Route

`/child/aprender/lesson/{id}`

## End-to-End Lifecycle

1. **Frontend page initialization**
- File: `apps/web/app/(app)/child/aprender/lesson/[id]/page.tsx:818-873`
- Reads lesson id from URL params (`:819-823`) and optional `subjectId` query.
- Initializes queue/session/energy/result states.

2. **Session bootstrap call**
- Frontend starts session with lesson id:
  - `page.tsx:985-997` -> `startLearningSession({ lessonId })`
- API client wrapper:
  - `apps/web/lib/api/client.ts:2566-2577` (`POST /api/learning/session/start`)

3. **Backend session creation**
- Route: `apps/api/app/api/routes/learning.py:549-631`
- Resolves lesson->unit->subject (`:561-574`).
- Validates age eligibility (`:575-580`).
- Applies daily lesson limit (`:582-589`).
- Calls service `start_learning_session(...)` (`:592-599`).
- `LearningSession` row is created in `adaptive_learning.py:409-418`.

4. **Adaptive lesson content loading**
- Frontend requests first batch:
  - `page.tsx:1005-1010`
  - `client.ts:2593-2606` (`POST /api/learning/next`)
- Backend route:
  - `learning.py:377-480`
  - age gate check (`:392-398`)
  - generator call `LessonEngine.generate_lesson_contents(...)` (`:401-408`)

5. **Lesson generator pipeline**
- Orchestrator: `apps/api/app/services/lesson_engine.py:100-235`
- Candidate collection:
  - templates + generated variants (`:294-349`)
  - static question bank (`:363-409`)
- Deep adaptive logic in:
  - `adaptive_learning.py:1116-1310`
- Diagnostics for empty batch:
  - `lesson_engine.py:228-233`, `learning.py:432-446`

6. **Frontend content rendering + interaction**
- Renders question based on type, metadata and evaluation functions:
  - evaluators: `page.tsx:154-176`
  - submit flow: `page.tsx:1370-1478`
- Handles empty/unavailable content states:
  - `page.tsx:1087-1119`
- Has offline fallback path for transient failures:
  - bootstrap fallback `:1178-1191`, continuation `:1675-1753`

7. **Answer submission loop**
- Frontend call: `submitAdaptiveLearningAnswer` (`client.ts:2608-2623`)
- Backend route: `learning.py:483-546`
- Service updates mastery/history/energy:
  - `adaptive_learning.py:1344+`

8. **Session completion + lesson completion**
- Frontend finish call:
  - `page.tsx:1497-1502` -> `finishLearningSession` (`client.ts:2579-2591`)
- Backend finish route:
  - `learning.py:634-697`
  - service `finish_adaptive_learning_session` (`adaptive_learning.py:1461-1633`)
- Additional lesson completion endpoint:
  - frontend `completeAprenderLesson` (`client.ts:2504-2511`)
  - backend `aprender.py:554-611` -> service `aprender.complete_lesson` (`aprender.py service file:347+`)

9. **Post-finish navigation and UI sync**
- Frontend builds return URL with rewards and subject context:
  - `page.tsx:1576-1611`
- Pushes to `/child/aprender?...` and refreshes path/profile caches.

## Validation Logic Highlights in this Flow

- Age validation before session and question generation:
  - `learning.py:575-580` and `:392-398`
- Difficulty/age compatibility for lesson authoring:
  - `aprender route: 393-400`
  - service `is_difficulty_allowed_for_age_group` in `app/services/aprender.py:144-153`
- Empty batch diagnostics surfaced to UI:
  - backend diagnostics (`learning.py:432-446`)
  - frontend reason mapping (`page.tsx:531-569`)
