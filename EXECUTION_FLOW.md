# EXECUTION_FLOW

## Frontend Entry Points

- Root layout bootstraps app shell/PWA/offline systems:
  - `apps/web/app/layout.tsx:47-64`
- Learning path page entry:
  - `apps/web/app/(app)/child/aprender/page.tsx:12-42`
- Lesson runtime entry (`/child/aprender/lesson/{id}`):
  - `apps/web/app/(app)/child/aprender/lesson/[id]/page.tsx:818-873`

## Backend Entry Points

- API process and route registration:
  - `apps/api/app/main.py:82-129`
- Main learning routers:
  - `apps/api/app/api/routes/learning.py`
  - `apps/api/app/api/routes/aprender.py`
  - `apps/api/app/api/routes/learn_v2.py`

## Primary Runtime Flow (Lesson Session)

User opens lesson page (`/child/aprender/lesson/{id}`)
↓
Frontend component `AdaptiveLessonSessionPage`
- parses route param and optional `subjectId` query (`page.tsx:819-823`, `:887-890`)
↓
Frontend starts adaptive session
- `startLearningSession({ lessonId })` (`page.tsx:985-997`)
- client API wrapper `/api/learning/session/start` (`client.ts:2566-2577`)
↓
Backend route `/api/learning/session/start`
- `start_session` (`learning.py:549-631`)
- resolves `lesson -> unit -> subject` (`:561-574`)
- enforces age gate (`:575-580`)
- creates `LearningSession` via service (`:592-599`)
↓
Frontend fetches adaptive questions
- `/api/learning/next` via `getAdaptiveLearningNext` (`client.ts:2593-2606`)
- invoked from lesson page (`page.tsx:1005-1010`)
↓
Backend route `/api/learning/next`
- `get_learning_next_questions` (`learning.py:377-480`)
- age gate enforced again (`:392-398`)
- calls `LessonEngine.generate_lesson_contents` (`:401-408`)
↓
Service layer question generation
- `LessonEngine.generate_lesson_contents` (`lesson_engine.py:100-235`)
- template/question candidate collection (`:275-415`)
- adaptive engine internals (`adaptive_learning.py:1116-1310`)
- optional LLM variant generation with validation (`adaptive_learning.py:702-842`)
↓
Frontend renders content
- question evaluators and UI state machine (`page.tsx:154-176`, `:1370-1478`)
↓
Frontend submits answers `/api/learning/answer`
- API call wrapper (`client.ts:2608-2623`)
- backend `submit_learning_answer` (`learning.py:483-546`)
- mastery + history update via `track_question_answer` (`adaptive_learning.py:1344+`)
↓
Session finish + lesson completion
- `finishLearningSession` `/api/learning/session/finish` (`client.ts:2579-2591`)
- route `finish_session` (`learning.py:634-697`)
- service `finish_adaptive_learning_session` (`adaptive_learning.py:1461-1633`)
- additional completion via `/api/aprender/lessons/{lesson_id}/complete` (`client.ts:2504-2511`, `aprender.py:554-611`)
↓
Response updates profile/path and UI navigates back to `/child/aprender`
- return URL builder/push (`page.tsx:1576-1611`)

## Secondary Flow (Path Screen)

User opens `/child/aprender`
↓
`TrailScreen` + `useTrailData`
- `TrailScreen` route navigation to lesson nodes (`TrailScreen.tsx:213-248`)
- subject/path data loading (`useTrailData.ts:303-384`)
↓
API calls
- `/api/aprender/subjects` with `childId` when available (`useTrailData.ts:308-317`, `client.ts:2634-2646`)
- `/api/learning/path` (`useTrailData.ts:336-343`, `client.ts:2625-2632`)
↓
Backend path assembly
- `get_learning_path` (`learning.py:201-305`)
- age-based subject remap (`learning.py:143-175`)
- path builder service (`learning_path_events.build_learning_path`, call at `learning.py:220-224`)
