# DATA_MODEL

## Primary Tables (Requested)

## 1) `student_profiles`
- Model: `StudentProfile`
- File: `apps/api/app/models.py:869-914`
- Key fields:
  - `id`, `user_id`, `tenant_id`, `date_of_birth`, `grade`
- Purpose:
  - school/student profile data (parallel to `child_profiles` in family flow)

## 2) `subjects`
- Model: `Subject`
- File: `apps/api/app/models.py:1491-1538`
- Key fields:
  - `id`, `name`, `age_group`, `order`, `icon`, `color`
- Derived fields:
  - `age_min`, `age_max` hybrid properties

## 3) `skills`
- Model: `Skill`
- File: `apps/api/app/models.py:1615-1636`
- Key fields:
  - `id`, `subject_id`, `name`, `age_group`, `order`

## 4) `lessons`
- Model: `Lesson`
- File: `apps/api/app/models.py:1555-1576`
- Key fields:
  - `id`, `unit_id`, `title`, `order`, `difficulty`, `xp_reward`, `type`

## 5) `progress`
- Main production progress table:
  - `LessonProgress` (`lesson_progress`)
  - `apps/api/app/models.py:1595-1613`
- Also active:
  - `UserSkillMastery` (`models.py:1758-1781`)
  - `StudentLessonProgress` (`models_learning.py:35-50`)
  - `StudentSkillMastery` (`models_learning.py:12-32`)

## 6) `sessions`
- Model: `LearningSession`
- File: `apps/api/app/models.py:1822-1845`
- Key fields:
  - `id`, `user_id`, `subject_id`, `unit_id`, `lesson_id`,
  - `started_at`, `ended_at`, `total_questions`, `correct_count`, `xp_earned`, `coins_earned`

## Relationships (Core Learning)

- `subjects (1) -> (N) units`
  - `Unit.subject_id` (`models.py:1548`)
- `units (1) -> (N) lessons`
  - `Lesson.unit_id` (`models.py:1563`)
- `subjects (1) -> (N) skills`
  - `Skill.subject_id` (`models.py:1628`)
- `lessons (N) <-> (N) skills` via `lesson_skills`
  - `LessonSkill.lesson_id` / `LessonSkill.skill_id` (`models.py:1638-1649`)
- `skills (1) -> (N) questions`
  - `Question.skill_id` (`models.py:1665`)
- `skills (1) -> (N) question_templates`
  - `QuestionTemplate.skill_id` (`models.py:1717`)
- `question_templates (1) -> (N) generated_variants`
  - `GeneratedVariant.template_id` (`models.py:1748-1752`)
- `users (1) -> (N) learning_sessions`
  - `LearningSession.user_id` (`models.py:1835`)
- `users (1) -> (N) lesson_progress`
  - `LessonProgress.user_id` (`models.py:1604`)
- `lessons (1) -> (N) lesson_progress`
  - `LessonProgress.lesson_id` (`models.py:1605`)

## ER Sketch

```text
User
  |--< LearningSession >-- Subject
  |--< LessonProgress >-- Lesson >-- Unit >-- Subject
  |--< UserSkillMastery >-- Skill >-- Subject
Lesson --< LessonSkill >-- Skill
Skill --< QuestionTemplate --< GeneratedVariant
Skill --< Question --< QuestionVariant
```

## Age-Driven Columns Relevant to Data Model

- `child_profiles.date_of_birth` (`models.py:833`)
- `subjects.age_group` (+ derived `age_min/age_max`) (`models.py:1499-1537`)
- `skills.age_group` (`models.py:1631-1634`)
