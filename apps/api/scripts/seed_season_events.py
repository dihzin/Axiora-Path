from __future__ import annotations

import json
from datetime import date

from sqlalchemy import text

from app.db.session import SessionLocal

SEED_TAG = "seed_season_events_v1"


def _event_rows(base_year: int) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for year in (base_year, base_year + 1):
        rows.extend(
            [
                {
                    "name": f"Volta as Aulas {year}",
                    "theme_key": "back_to_school",
                    "start_date": date(year, 2, 1),
                    "end_date": date(year, 2, 28),
                    "description": "Inicio de ciclo com energia e metas positivas de estudo.",
                    "background_style": {"accent": "#2563EB", "motif": "notebook-stars", "seedTag": SEED_TAG},
                    "bonus_xp_multiplier": 1.10,
                    "bonus_coin_multiplier": 1.05,
                },
                {
                    "name": f"Semana da Matematica {year}",
                    "theme_key": "math_week",
                    "start_date": date(year, 3, 10),
                    "end_date": date(year, 3, 16),
                    "description": "Desafios leves e recompensas extras para raciocinio logico.",
                    "background_style": {"accent": "#0EA5A4", "motif": "numbers-grid", "seedTag": SEED_TAG},
                    "bonus_xp_multiplier": 1.15,
                    "bonus_coin_multiplier": 1.10,
                },
                {
                    "name": f"Ferias de Julho {year}",
                    "theme_key": "july_break",
                    "start_date": date(year, 7, 1),
                    "end_date": date(year, 7, 31),
                    "description": "Aprender brincando com uma trilha de verao mais descontraida.",
                    "background_style": {"accent": "#06B6D4", "motif": "sunny-islands", "seedTag": SEED_TAG},
                    "bonus_xp_multiplier": 1.08,
                    "bonus_coin_multiplier": 1.12,
                },
                {
                    "name": f"Halloween {year}",
                    "theme_key": "halloween",
                    "start_date": date(year, 10, 20),
                    "end_date": date(year, 10, 31),
                    "description": "Aventura noturna com baus tematicos e desafios de mini-boss.",
                    "background_style": {"accent": "#EA580C", "motif": "pumpkin-stars", "seedTag": SEED_TAG},
                    "bonus_xp_multiplier": 1.20,
                    "bonus_coin_multiplier": 1.15,
                },
                {
                    "name": f"Natal {year}",
                    "theme_key": "xmas",
                    "start_date": date(year, 12, 10),
                    "end_date": date(year, 12, 31),
                    "description": "Temporada de celebracao com reforco de habitos e recompensas gentis.",
                    "background_style": {"accent": "#16A34A", "motif": "winter-stars", "seedTag": SEED_TAG},
                    "bonus_xp_multiplier": 1.12,
                    "bonus_coin_multiplier": 1.18,
                },
            ]
        )
    return rows


def run_seed() -> None:
    today = date.today()
    rows = _event_rows(today.year)

    with SessionLocal() as db:
        inserted = 0
        updated = 0
        for row in rows:
            existing_id = db.execute(
                text(
                    """
                    SELECT id::text
                    FROM season_events
                    WHERE theme_key = :theme_key
                      AND start_date = :start_date
                      AND end_date = :end_date
                    """
                ),
                {
                    "theme_key": row["theme_key"],
                    "start_date": row["start_date"],
                    "end_date": row["end_date"],
                },
            ).scalar_one_or_none()

            payload = {
                "name": row["name"],
                "theme_key": row["theme_key"],
                "start_date": row["start_date"],
                "end_date": row["end_date"],
                "description": row["description"],
                "background_style": json.dumps(row["background_style"]),
                "bonus_xp_multiplier": row["bonus_xp_multiplier"],
                "bonus_coin_multiplier": row["bonus_coin_multiplier"],
            }

            if existing_id is None:
                db.execute(
                    text(
                        """
                        INSERT INTO season_events
                            (name, theme_key, start_date, end_date, description, background_style, bonus_xp_multiplier, bonus_coin_multiplier)
                        VALUES
                            (:name, :theme_key, :start_date, :end_date, :description, CAST(:background_style AS jsonb), :bonus_xp_multiplier, :bonus_coin_multiplier)
                        """
                    ),
                    payload,
                )
                inserted += 1
            else:
                db.execute(
                    text(
                        """
                        UPDATE season_events
                        SET
                            name = :name,
                            description = :description,
                            background_style = CAST(:background_style AS jsonb),
                            bonus_xp_multiplier = :bonus_xp_multiplier,
                            bonus_coin_multiplier = :bonus_coin_multiplier
                        WHERE id = CAST(:id AS uuid)
                        """
                    ),
                    {**payload, "id": existing_id},
                )
                updated += 1

        db.commit()

    print("=== SEASON EVENTS SEED RESULT ===")
    print(f"inserted: {inserted}")
    print(f"updated: {updated}")


def main() -> None:
    run_seed()


if __name__ == "__main__":
    main()
