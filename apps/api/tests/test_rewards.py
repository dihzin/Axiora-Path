from app.models import TaskDifficulty
from app.services.rewards import REWARD_BASE_TABLE, calculate_reward_cents


def test_reward_table_values() -> None:
    assert REWARD_BASE_TABLE[TaskDifficulty.EASY] == 50
    assert REWARD_BASE_TABLE[TaskDifficulty.MEDIUM] == 100
    assert REWARD_BASE_TABLE[TaskDifficulty.HARD] == 200
    assert REWARD_BASE_TABLE[TaskDifficulty.LEGENDARY] == 400


def test_reward_formula_base_times_weight() -> None:
    assert calculate_reward_cents(difficulty=TaskDifficulty.EASY, weight=3) == 150
    assert calculate_reward_cents(difficulty=TaskDifficulty.LEGENDARY, weight=2) == 800

