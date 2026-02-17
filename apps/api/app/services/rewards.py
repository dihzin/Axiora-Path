from __future__ import annotations

from app.models import TaskDifficulty

REWARD_BASE_TABLE: dict[TaskDifficulty, int] = {
    TaskDifficulty.EASY: 50,
    TaskDifficulty.MEDIUM: 100,
    TaskDifficulty.HARD: 200,
    TaskDifficulty.LEGENDARY: 400,
}


def calculate_reward_cents(*, difficulty: TaskDifficulty, weight: int) -> int:
    return REWARD_BASE_TABLE[difficulty] * weight

