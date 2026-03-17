# LEARNING_ARCHITECTURE

## Scope

Learning stack spans three overlapping domains:

- `aprender` domain (path + legacy lesson completion): `apps/api/app/api/routes/aprender.py`
- `learning` adaptive runtime domain (session/question loop): `apps/api/app/api/routes/learning.py`
- `learn_v2` curriculum graph domain: `apps/api/app/api/routes/learn_v2.py`

## Core Entities and Where They Live

- **Subjects**
  - ORM: `apps/api/app/models.py:1491-1538`
  - Includes `age_group`, derived `age_min/age_max`.
- **Skills**
  - ORM: `apps/api/app/models.py:1615-1636`
  - Linked to `subject_id`, own `age_group`.
- **Lessons**
  - ORM: `apps/api/app/models.py:1555-1576`
  - Linked to `unit_id`; carries `difficulty`, `xp_reward`, `type`.
- **Lesson generators**
  - Template sources: `QuestionTemplate` (`models.py:1703-1733`)
  - Generated variants: `GeneratedVariant` (`models.py:1735-1756`)
  - Generation logic: `adaptive_learning.py:702-842`, `lesson_engine.py:275-415`
- **Progression nodes**
  - Path nodes consumed in UI: `LearningPathUnitOut/LearningPathNodeOut` from `learning.py:251-305`
  - Path events model: `PathEvent` (`models.py:1960+`)
- **Student progress**
  - Main runtime mastery: `UserSkillMastery` (`models.py:1758-1781`)
  - Lesson completion ledger: `LessonProgress` (`models.py:1595-1613`)
  - Alternative student tables: `models_learning.py:12-66`
- **Learning sessions**
  - `LearningSession` model: `models.py:1822-1845`
  - Start/finish service: `adaptive_learning.py:359-418`, `:1461-1633`

## Relationship Map

Subject -> Unit -> Lesson -> (LessonSkill) -> Skill
Skill -> QuestionTemplate -> GeneratedVariant
Skill -> Question -> QuestionVariant
User -> LearningSession
User + Skill -> UserSkillMastery
User + Lesson -> LessonProgress

## Canonical Adaptive Pipeline

1. Resolve subject/lesson context
   - `learning.py:561-574`, `:385-391`
2. Select focus skills
   - `adaptive_learning.py:421-443`, `:483-512`
3. Build candidate questions
   - templates + generated variants (`adaptive_learning.py:1177-1230`)
   - static question bank (`adaptive_learning.py:1244-1288`)
4. Rank/filter and emit next items
   - `adaptive_learning.py:1290-1310`
5. Track answer outcome and update mastery
   - `adaptive_learning.py:1344+`
6. Finish session and grant rewards
   - `adaptive_learning.py:1461-1633`

## Subject -> Skill -> Lesson -> Generator -> Session (Requested Chain)

- Subject chosen/remapped on child age:
  - `learning.py:143-175`, `:201-224`
- Skills selected from lesson/subject context:
  - `adaptive_learning.py:421-443`
- Lesson-scoped filtering:
  - template/query filters by `lesson_id` in
    - `adaptive_learning.py:1185-1191`, `:1253-1265`
- Generator chooses concrete question payloads:
  - `adaptive_learning.py:844-1113`, `lesson_engine.py:275-415`
- Session persists state and scoring:
  - `learning.py:549-631` (start)
  - `learning.py:634-697` + `adaptive_learning.py:1461-1633` (finish)
