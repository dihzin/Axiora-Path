from app.models import MoodType
from app.services.axion_emotion import AxionEmotionInput, AxionEmotionService


def test_axion_emotion_celebrating_from_completion() -> None:
    service = AxionEmotionService()
    mood_state = service.resolve(
        AxionEmotionInput(
            streak=1,
            weekly_completion_rate=82.0,
            last_mood=MoodType.OK,
            goal_progress_percent=10.0,
            inactivity_days=0,
        ),
    )
    assert mood_state == "CELEBRATING"


def test_axion_emotion_proud_from_streak() -> None:
    service = AxionEmotionService()
    mood_state = service.resolve(
        AxionEmotionInput(
            streak=7,
            weekly_completion_rate=50.0,
            last_mood=MoodType.OK,
            goal_progress_percent=20.0,
            inactivity_days=0,
        ),
    )
    assert mood_state == "PROUD"


def test_axion_emotion_concerned_from_inactivity() -> None:
    service = AxionEmotionService()
    mood_state = service.resolve(
        AxionEmotionInput(
            streak=2,
            weekly_completion_rate=40.0,
            last_mood=MoodType.OK,
            goal_progress_percent=30.0,
            inactivity_days=2,
        ),
    )
    assert mood_state == "CONCERNED"


def test_axion_emotion_excited_from_goal_progress() -> None:
    service = AxionEmotionService()
    mood_state = service.resolve(
        AxionEmotionInput(
            streak=1,
            weekly_completion_rate=20.0,
            last_mood=MoodType.OK,
            goal_progress_percent=85.0,
            inactivity_days=0,
        ),
    )
    assert mood_state == "EXCITED"


def test_axion_emotion_neutral_default() -> None:
    service = AxionEmotionService()
    mood_state = service.resolve(
        AxionEmotionInput(
            streak=1,
            weekly_completion_rate=20.0,
            last_mood=MoodType.OK,
            goal_progress_percent=20.0,
            inactivity_days=0,
        ),
    )
    assert mood_state == "NEUTRAL"
