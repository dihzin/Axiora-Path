from app.services.ai.personality import PersonalityProfile, generate_personality_from_seed


def test_generate_personality_is_deterministic() -> None:
    one = generate_personality_from_seed("axion-1")
    two = generate_personality_from_seed("axion-1")
    assert one == two


def test_generate_personality_levels_in_range() -> None:
    profile = generate_personality_from_seed("axion-42")
    assert 1 <= profile.energy_level <= 3
    assert 1 <= profile.humor_level <= 3
    assert 1 <= profile.wisdom_level <= 3


def test_sentence_and_vocab_style_rules() -> None:
    energetic = PersonalityProfile(energy_level=3, humor_level=2, wisdom_level=1)
    wise = PersonalityProfile(energy_level=2, humor_level=1, wisdom_level=3)
    playful = PersonalityProfile(energy_level=2, humor_level=3, wisdom_level=1)

    assert energetic.sentence_style == "short"
    assert wise.sentence_style == "long"
    assert playful.vocabulary_style == "playful"
