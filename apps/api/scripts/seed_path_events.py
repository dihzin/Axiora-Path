from __future__ import annotations

import json

from sqlalchemy import text

from app.db.session import SessionLocal

SEED_TAG = "seed_path_events_v1"


def _clear_previous_seed() -> tuple[int, int]:
    with SessionLocal() as db:
        event_ids = db.execute(
            text(
                """
                SELECT id::text
                FROM path_events
                WHERE (rules ->> 'seedTag') = :seed_tag
                """
            ),
            {"seed_tag": SEED_TAG},
        ).scalars().all()
        if not event_ids:
            return 0, 0

        user_rows_deleted = db.execute(
            text("DELETE FROM user_path_events WHERE event_id = ANY(CAST(:event_ids AS uuid[]))"),
            {"event_ids": event_ids},
        ).rowcount or 0
        events_deleted = db.execute(
            text("DELETE FROM path_events WHERE id = ANY(CAST(:event_ids AS uuid[]))"),
            {"event_ids": event_ids},
        ).rowcount or 0
        db.commit()
    return int(events_deleted), int(user_rows_deleted)


def _insert_event(
    *,
    subject_id: int,
    age_group: str,
    unit_id: int | None,
    lesson_id: int | None,
    event_type: str,
    title: str,
    description: str,
    icon_key: str,
    rarity: str,
    rules: dict,
    order_index: int,
) -> None:
    with SessionLocal() as db:
        db.execute(
            text(
                """
                INSERT INTO path_events
                    (subject_id, age_group, unit_id, lesson_id, type, title, description, icon_key, rarity, rules, order_index)
                VALUES
                    (
                        :subject_id,
                        :age_group,
                        :unit_id,
                        :lesson_id,
                        :event_type,
                        :title,
                        :description,
                        :icon_key,
                        :rarity,
                        CAST(:rules AS jsonb),
                        :order_index
                    )
                """
            ),
            {
                "subject_id": subject_id,
                "age_group": age_group,
                "unit_id": unit_id,
                "lesson_id": lesson_id,
                "event_type": event_type,
                "title": title,
                "description": description,
                "icon_key": icon_key,
                "rarity": rarity,
                "rules": json.dumps(rules),
                "order_index": order_index,
            },
        )
        db.commit()


def run_seed() -> None:
    events_deleted, user_rows_deleted = _clear_previous_seed()
    created = 0

    with SessionLocal() as db:
        subjects = db.execute(
            text(
                """
                SELECT id, name, age_group::text
                FROM subjects
                ORDER BY age_group::text, "order"
                """
            )
        ).all()

    for subject in subjects:
        subject_id = int(subject.id)
        subject_name = str(subject.name)
        age_group = str(subject.age_group)

        with SessionLocal() as db:
            units = db.execute(
                text(
                    """
                    SELECT id, title, "order"
                    FROM units
                    WHERE subject_id = :subject_id
                    ORDER BY "order"
                    """
                ),
                {"subject_id": subject_id},
            ).all()

        global_lesson_counter = 0
        for unit in units:
            unit_id = int(unit.id)
            unit_title = str(unit.title)
            with SessionLocal() as db:
                lessons = db.execute(
                    text(
                        """
                        SELECT id, title, "order"
                        FROM lessons
                        WHERE unit_id = :unit_id
                        ORDER BY "order"
                        """
                    ),
                    {"unit_id": unit_id},
                ).all()

            if not lessons:
                continue

            lesson_count = len(lessons)
            checkpoint_40_order = max(1, int(round(lesson_count * 0.4)))
            checkpoint_80_order = max(1, int(round(lesson_count * 0.8)))

            for lesson in lessons:
                global_lesson_counter += 1
                lesson_id = int(lesson.id)
                lesson_order = int(lesson.order)

                if global_lesson_counter % 5 == 0:
                    _insert_event(
                        subject_id=subject_id,
                        age_group=age_group,
                        unit_id=unit_id,
                        lesson_id=lesson_id,
                        event_type="CHEST",
                        title="Baú do Axion",
                        description="Uma surpresa para celebrar seu progresso na trilha.",
                        icon_key="chest",
                        rarity="RARE" if global_lesson_counter % 10 == 0 else "COMMON",
                        rules={
                            "seedTag": SEED_TAG,
                            "everyCompletedLessons": 5,
                            "triggerAtCompletedLessons": global_lesson_counter,
                            "rewards": {"coins": [5, 10, 15]},
                        },
                        order_index=(lesson_order * 10) + 2,
                    )
                    created += 1

                if global_lesson_counter % 10 == 3:
                    _insert_event(
                        subject_id=subject_id,
                        age_group=age_group,
                        unit_id=unit_id,
                        lesson_id=lesson_id,
                        event_type="STORY_STOP",
                        title="Parada Narrativa",
                        description="Um mini-capitulo divertido antes da proxima missao.",
                        icon_key="story",
                        rarity="COMMON",
                        rules={
                            "seedTag": SEED_TAG,
                            "chance": 0.1,
                            "storyTone": "playful",
                            "questionCount": 1,
                        },
                        order_index=(lesson_order * 10) + 3,
                    )
                    created += 1

                if lesson_order == checkpoint_40_order:
                    _insert_event(
                        subject_id=subject_id,
                        age_group=age_group,
                        unit_id=unit_id,
                        lesson_id=lesson_id,
                        event_type="CHECKPOINT",
                        title=f"Checkpoint 40% - {unit_title}",
                        description="Revisao rapida para consolidar as habilidades recentes.",
                        icon_key="checkpoint",
                        rarity="COMMON",
                        rules={
                            "seedTag": SEED_TAG,
                            "requiredUnitCompletion": 0.4,
                            "maxQuestions": 6,
                            "adaptive": True,
                        },
                        order_index=(lesson_order * 10) + 4,
                    )
                    created += 1

                if lesson_order == checkpoint_80_order:
                    _insert_event(
                        subject_id=subject_id,
                        age_group=age_group,
                        unit_id=unit_id,
                        lesson_id=lesson_id,
                        event_type="CHECKPOINT",
                        title=f"Checkpoint 80% - {unit_title}",
                        description="Mais um resumo adaptativo para fechar a unidade com confianca.",
                        icon_key="checkpoint",
                        rarity="RARE",
                        rules={
                            "seedTag": SEED_TAG,
                            "requiredUnitCompletion": 0.8,
                            "maxQuestions": 6,
                            "adaptive": True,
                        },
                        order_index=(lesson_order * 10) + 8,
                    )
                    created += 1

            last_lesson = lessons[-1]
            last_order = int(last_lesson.order)
            last_lesson_id = int(last_lesson.id)

            _insert_event(
                subject_id=subject_id,
                age_group=age_group,
                unit_id=unit_id,
                lesson_id=last_lesson_id,
                event_type="REVIEW_GATE",
                title="Portal de Revisao",
                description="Conclua suas revisoes pendentes para liberar a proxima regiao.",
                icon_key="gate",
                rarity="COMMON",
                rules={
                    "seedTag": SEED_TAG,
                    "dueReviewsThreshold": 10,
                },
                order_index=(last_order * 10) + 7,
            )
            created += 1

            _insert_event(
                subject_id=subject_id,
                age_group=age_group,
                unit_id=unit_id,
                lesson_id=last_lesson_id,
                event_type="MINI_BOSS",
                title=f"Mini Chefe - {unit_title}",
                description="Desafio final com 5 perguntas focadas nas habilidades mais fracas.",
                icon_key="mini_boss",
                rarity="EPIC",
                rules={
                    "seedTag": SEED_TAG,
                    "questions": 5,
                    "requiredScore": 70,
                    "focus": "weakest_skills",
                },
                order_index=(last_order * 10) + 9,
            )
            created += 1

        # Subject-level streak boost event.
        _insert_event(
            subject_id=subject_id,
            age_group=age_group,
            unit_id=None,
            lesson_id=None,
            event_type="BOOST",
            title=f"Turbo de Exploracao - {subject_name}",
            description="Ao atingir 7 dias de sequencia, ganhe +20% XP por 24h.",
            icon_key="boost",
            rarity="RARE",
            rules={
                "seedTag": SEED_TAG,
                "requiredStreakDays": 7,
                "xpMultiplier": 1.2,
                "durationHours": 24,
            },
            order_index=1,
        )
        created += 1

    print("=== PATH EVENTS SEED RESULT ===")
    print(f"deleted_events: {events_deleted}")
    print(f"deleted_user_path_events: {user_rows_deleted}")
    print(f"created_events: {created}")


def main() -> None:
    run_seed()


if __name__ == "__main__":
    main()
