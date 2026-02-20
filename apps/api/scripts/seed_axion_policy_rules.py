from __future__ import annotations

import json

from sqlalchemy import text

from app.db.session import SessionLocal


def _rules() -> list[dict[str, object]]:
    # 23 deterministic rules covering frustration, confidence, dropout risk,
    # inactivity, streak rewards and review gates across all Axion contexts.
    return [
        {
            "name": "Before: Frustration Critical",
            "context": "before_learning",
            "condition": {"frustrationScore": {"gt": 0.8}},
            "actions": [
                {"type": "ADJUST_DIFFICULTY", "mode": "down", "difficultyCap": "MEDIUM", "easyRatioBoost": 0.25},
                {"type": "REDUCE_ENERGY_COST", "value": 0.5, "ttlMinutes": 60},
                {"type": "OFFER_GAME_BREAK", "minutes": 4},
            ],
            "priority": 1200,
            "enabled": True,
        },
        {
            "name": "Before: Frustration High",
            "context": "before_learning",
            "condition": {"frustrationScore": {"gt": 0.7}},
            "actions": [
                {"type": "ADJUST_DIFFICULTY", "mode": "down", "difficultyCap": "MEDIUM", "easyRatioBoost": 0.2},
                {"type": "REDUCE_ENERGY_COST", "value": 0.5, "ttlMinutes": 45},
            ],
            "priority": 1100,
            "enabled": True,
        },
        {
            "name": "Before: Low Energy Safeguard",
            "context": "before_learning",
            "condition": {"energyCurrent": {"lte": 1}},
            "actions": [
                {"type": "REDUCE_ENERGY_COST", "value": 0.5, "ttlMinutes": 30},
                {"type": "OFFER_MICRO_MISSION", "durationMinutes": 2, "targetLessons": 1},
            ],
            "priority": 1080,
            "enabled": True,
        },
        {
            "name": "Before: Review Gate Heavy",
            "context": "before_learning",
            "condition": {"dueReviews": {"gte": 10}},
            "actions": [
                {"type": "TRIGGER_REVIEW", "force": True, "minDueReviews": 10},
            ],
            "priority": 1050,
            "enabled": True,
        },
        {
            "name": "Before: Review Gate Medium",
            "context": "before_learning",
            "condition": {"dueReviews": {"gte": 6}},
            "actions": [
                {"type": "TRIGGER_REVIEW", "force": True, "minDueReviews": 6},
            ],
            "priority": 1000,
            "enabled": True,
        },
        {
            "name": "Before: Dropout Risk High",
            "context": "before_learning",
            "condition": {"dropoutRiskScore": {"gt": 0.7}},
            "actions": [
                {"type": "OFFER_MICRO_MISSION", "durationMinutes": 2, "targetLessons": 1},
                {"type": "SURPRISE_REWARD", "coins": 10},
                {"type": "NUDGE_PARENT", "kind": "soft", "focus": "consistency"},
            ],
            "priority": 980,
            "enabled": True,
        },
        {
            "name": "Before: Inactivity Recovery",
            "context": "before_learning",
            "condition": {"rhythmScore": {"lt": 0.35}, "dropoutRiskScore": {"gt": 0.55}},
            "actions": [
                {"type": "OFFER_MICRO_MISSION", "durationMinutes": 2, "targetLessons": 1},
                {"type": "ADJUST_DIFFICULTY", "mode": "down", "difficultyCap": "EASY"},
            ],
            "priority": 960,
            "enabled": True,
        },
        {
            "name": "Before: Confidence Momentum Peak",
            "context": "before_learning",
            "condition": {"confidenceScore": {"gt": 0.82}, "learningMomentum": {"gt": 0.12}},
            "actions": [
                {"type": "OFFER_BOOST", "value": 1.25, "ttlMinutes": 1440},
                {"type": "ADJUST_DIFFICULTY", "mode": "up", "hardRatioBoost": 0.2},
            ],
            "priority": 940,
            "enabled": True,
        },
        {
            "name": "Before: Confidence Solid",
            "context": "before_learning",
            "condition": {"confidenceScore": {"gt": 0.75}, "learningMomentum": {"gt": 0.05}},
            "actions": [
                {"type": "OFFER_BOOST", "value": 1.2, "ttlMinutes": 720},
                {"type": "ADJUST_DIFFICULTY", "mode": "up", "hardRatioBoost": 0.12},
            ],
            "priority": 900,
            "enabled": True,
        },
        {
            "name": "ChildTab: Dropout Rescue",
            "context": "child_tab",
            "condition": {"dropoutRiskScore": {"gt": 0.68}},
            "actions": [
                {"type": "OFFER_MICRO_MISSION", "durationMinutes": 2, "targetLessons": 1},
                {"type": "SURPRISE_REWARD", "coins": 8},
                {"type": "NUDGE_PARENT", "kind": "soft", "focus": "support"},
            ],
            "priority": 1000,
            "enabled": True,
        },
        {
            "name": "ChildTab: Review Priority",
            "context": "child_tab",
            "condition": {"dueReviews": {"gte": 8}},
            "actions": [
                {"type": "TRIGGER_REVIEW", "force": True, "minDueReviews": 8},
                {"type": "OFFER_MICRO_MISSION", "durationMinutes": 3, "targetLessons": 1},
            ],
            "priority": 920,
            "enabled": True,
        },
        {
            "name": "ChildTab: Streak Reward",
            "context": "child_tab",
            "condition": {"streakDays": {"gte": 7}, "rhythmScore": {"gte": 0.55}},
            "actions": [
                {"type": "OFFER_BOOST", "value": 1.15, "ttlMinutes": 1440},
                {"type": "SURPRISE_REWARD", "coins": 6},
            ],
            "priority": 890,
            "enabled": True,
        },
        {
            "name": "After: Session Recovery",
            "context": "after_learning",
            "condition": {"frustrationScore": {"gt": 0.72}},
            "actions": [
                {"type": "ADJUST_DIFFICULTY", "mode": "down", "difficultyCap": "MEDIUM"},
                {"type": "REDUCE_ENERGY_COST", "value": 0.5, "ttlMinutes": 45},
                {"type": "OFFER_GAME_BREAK", "minutes": 5},
            ],
            "priority": 980,
            "enabled": True,
        },
        {
            "name": "After: Strong Session Push",
            "context": "after_learning",
            "condition": {"confidenceScore": {"gt": 0.8}, "learningMomentum": {"gt": 0.1}},
            "actions": [
                {"type": "OFFER_BOOST", "value": 1.2, "ttlMinutes": 720},
                {"type": "OFFER_MICRO_MISSION", "durationMinutes": 2, "targetLessons": 1},
            ],
            "priority": 930,
            "enabled": True,
        },
        {
            "name": "After: Weekly Completion Low",
            "context": "after_learning",
            "condition": {"weeklyCompletionRate": {"lt": 0.35}},
            "actions": [
                {"type": "OFFER_MICRO_MISSION", "durationMinutes": 2, "targetLessons": 1},
                {"type": "NUDGE_PARENT", "kind": "soft", "focus": "routine"},
            ],
            "priority": 900,
            "enabled": True,
        },
        {
            "name": "After: Review Debt",
            "context": "after_learning",
            "condition": {"dueReviews": {"gte": 7}},
            "actions": [
                {"type": "TRIGGER_REVIEW", "force": True, "minDueReviews": 7},
            ],
            "priority": 860,
            "enabled": True,
        },
        {
            "name": "Games: Frustration Offload",
            "context": "games_tab",
            "condition": {"frustrationScore": {"gt": 0.7}},
            "actions": [
                {"type": "OFFER_GAME_BREAK", "minutes": 6},
                {"type": "ADJUST_DIFFICULTY", "mode": "down", "difficultyCap": "MEDIUM"},
            ],
            "priority": 920,
            "enabled": True,
        },
        {
            "name": "Games: Confidence Challenge",
            "context": "games_tab",
            "condition": {"confidenceScore": {"gt": 0.78}, "learningMomentum": {"gt": 0.06}},
            "actions": [
                {"type": "ADJUST_DIFFICULTY", "mode": "up", "hardRatioBoost": 0.1},
                {"type": "OFFER_BOOST", "value": 1.1, "ttlMinutes": 480},
            ],
            "priority": 880,
            "enabled": True,
        },
        {
            "name": "Games: Inactivity Nudge",
            "context": "games_tab",
            "condition": {"rhythmScore": {"lt": 0.4}, "dropoutRiskScore": {"gt": 0.55}},
            "actions": [
                {"type": "OFFER_MICRO_MISSION", "durationMinutes": 2, "targetLessons": 1},
            ],
            "priority": 840,
            "enabled": True,
        },
        {
            "name": "Wallet: Low Momentum Re-engage",
            "context": "wallet_tab",
            "condition": {"learningMomentum": {"lt": -0.05}, "dropoutRiskScore": {"gt": 0.55}},
            "actions": [
                {"type": "OFFER_MICRO_MISSION", "durationMinutes": 2, "targetLessons": 1},
                {"type": "SURPRISE_REWARD", "coins": 5},
            ],
            "priority": 900,
            "enabled": True,
        },
        {
            "name": "Wallet: Streak Celebration",
            "context": "wallet_tab",
            "condition": {"streakDays": {"gte": 10}, "confidenceScore": {"gte": 0.65}},
            "actions": [
                {"type": "SURPRISE_REWARD", "coins": 10},
                {"type": "OFFER_BOOST", "value": 1.15, "ttlMinutes": 720},
            ],
            "priority": 860,
            "enabled": True,
        },
        {
            "name": "Wallet: Review Reminder",
            "context": "wallet_tab",
            "condition": {"dueReviews": {"gte": 5}},
            "actions": [
                {"type": "TRIGGER_REVIEW", "force": True, "minDueReviews": 5},
            ],
            "priority": 820,
            "enabled": True,
        },
        {
            "name": "ChildTab: Confidence Flow",
            "context": "child_tab",
            "condition": {"confidenceScore": {"gt": 0.78}, "rhythmScore": {"gte": 0.55}},
            "actions": [
                {"type": "OFFER_MICRO_MISSION", "durationMinutes": 3, "targetLessons": 1},
                {"type": "OFFER_BOOST", "value": 1.1, "ttlMinutes": 360},
            ],
            "priority": 850,
            "enabled": True,
        },
    ]


def run_seed() -> None:
    inserted = 0
    updated = 0
    rules = _rules()

    with SessionLocal() as db:
        for rule in rules:
            existing_id = db.execute(
                text(
                    """
                    SELECT id
                    FROM axion_policy_rules
                    WHERE name = :name
                      AND context = CAST(:context AS axion_decision_context)
                    """
                ),
                {"name": rule["name"], "context": rule["context"]},
            ).scalar_one_or_none()

            payload = {
                "name": rule["name"],
                "context": rule["context"],
                "condition": json.dumps(rule["condition"], ensure_ascii=False),
                "actions": json.dumps(rule["actions"], ensure_ascii=False),
                "priority": int(rule["priority"]),
                "enabled": bool(rule["enabled"]),
            }

            if existing_id is None:
                db.execute(
                    text(
                        """
                        INSERT INTO axion_policy_rules
                            (name, context, condition, actions, priority, enabled)
                        VALUES
                            (:name, CAST(:context AS axion_decision_context), CAST(:condition AS jsonb), CAST(:actions AS jsonb), :priority, :enabled)
                        """
                    ),
                    payload,
                )
                inserted += 1
            else:
                db.execute(
                    text(
                        """
                        UPDATE axion_policy_rules
                        SET
                            condition = CAST(:condition AS jsonb),
                            actions = CAST(:actions AS jsonb),
                            priority = :priority,
                            enabled = :enabled
                        WHERE id = :id
                        """
                    ),
                    {**payload, "id": int(existing_id)},
                )
                updated += 1
        db.commit()

    print("=== AXION POLICY RULES SEED RESULT ===")
    print(f"inserted: {inserted}")
    print(f"updated: {updated}")
    print(f"total_rules_target: {len(rules)}")


def main() -> None:
    run_seed()


if __name__ == "__main__":
    main()
