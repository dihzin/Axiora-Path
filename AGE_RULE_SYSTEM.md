# AGE_RULE_SYSTEM

## Message Source(s)

Target symptom: _"This content is not available for your age group"_

In current codebase there are two equivalent messages:

- Portuguese hard block:
  - `apps/api/app/api/routes/learning.py:197`
  - text: `"Este conteúdo não está disponível para a sua faixa etária."`
- English hard block:
  - `apps/api/app/api/routes/aprender.py:509`
  - text: `"Subject not available for this age group"`

## 1) Where age is calculated

- Core helper:
  - `apps/api/app/services/child_age.py:6-10` (`get_child_age(date_of_birth, today)`)
- Learning route usage:
  - `apps/api/app/api/routes/learning.py:193-194`
- Aprender route child resolution:
  - `apps/api/app/api/routes/aprender.py:109-114`
- Service-level age group resolution:
  - `apps/api/app/services/aprender.py:112-133`

## 2) Where restriction is enforced

### A. Adaptive learning runtime guard (strict content block)
- Function: `_ensure_subject_allowed_for_child_age`
- File: `apps/api/app/api/routes/learning.py:177-199`
- Condition:
  - if `child_age < subject.age_min` OR `child_age > subject.age_max`
- Result:
  - raises `HTTP 403` with Portuguese message (`:195-198`)
- Used in:
  - `/api/learning/path` indirectly via remap behavior
  - `/api/learning/next`: `learning.py:392-398`
  - `/api/learning/session/start`: `learning.py:575-580`

### B. Aprender subject-path guard
- File: `apps/api/app/api/routes/aprender.py:493-510`
- Condition:
  - if `path.subject.age_group != target_age_group`
- Result:
  - `HTTP 403` with English message (`:507-510`)

### C. Subject list filtering by resolved child age
- File: `apps/api/app/api/routes/aprender.py:317-322`
- Condition:
  - query filtered by `Subject.age_min <= child_age <= Subject.age_max`

### D. Lesson authoring restriction by age group x difficulty
- File: `apps/api/app/services/aprender.py:144-153`
- Enforced at create lesson route:
  - `apps/api/app/api/routes/aprender.py:393-400`
- Rule:
  - age 6-8 => only `EASY`
  - age 9-12 => `EASY|MEDIUM`
  - age 13-15 => all

## 3) Entity defining age limits

Primary entity: **`Subject`**

- `apps/api/app/models.py:1491-1538`
- Stored field: `age_group`
- Derived constraints:
  - `age_min` hybrid property (`:1507-1522`)
  - `age_max` hybrid property (`:1523-1537`)

Related entities with age signals:

- `Skill.age_group` for template suitability:
  - `models.py:1631-1634`
- `ChildProfile.date_of_birth`:
  - `models.py:820-833`
- `StudentProfile.date_of_birth`:
  - `models.py:869-880`
- Separate content catalog age bounds (Axion safety/catalog domain):
  - `AxionContentCatalog.age_min/age_max` in `models.py:2334-2335`

## Database Fields Used in Restriction Decisions

- `child_profiles.date_of_birth` (`models.py:833`)
- `subjects.age_group` (`models.py:1499-1502`)
- Derived via SQLAlchemy hybrid expression:
  - `subjects.age_min` (`models.py:1515-1521`)
  - `subjects.age_max` (`models.py:1531-1537`)

## Tests Covering This Mechanism

- `apps/api/tests/test_child_cannot_access_content_outside_age_range.py:11-18`
- `apps/api/tests/test_subjects_filtered_by_child_age.py:17-20`
- `apps/api/tests/test_learning_path_subject_remap_by_child_age.py:11-18`
