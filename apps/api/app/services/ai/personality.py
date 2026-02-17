from __future__ import annotations

import hashlib
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class PersonalityProfile:
    energy_level: int
    humor_level: int
    wisdom_level: int

    @property
    def sentence_style(self) -> str:
        if self.energy_level >= 3:
            return "short"
        if self.wisdom_level >= 3:
            return "long"
        return "medium"

    @property
    def vocabulary_style(self) -> str:
        if self.wisdom_level >= 3:
            return "reflective"
        if self.humor_level >= 3:
            return "playful"
        return "direct"

    def tone_for_mode(self, mode: str) -> str:
        base = "playful" if mode == "CHILD" else "supportive"
        if self.energy_level >= 3:
            return f"{base}_energetic"
        if self.energy_level <= 1:
            return f"{base}_calm"
        return base


def generate_personality_from_seed(personality_seed: str) -> PersonalityProfile:
    digest = hashlib.sha256(personality_seed.encode("utf-8")).digest()
    # Deterministic levels in range 1..3
    energy_level = (digest[0] % 3) + 1
    humor_level = (digest[1] % 3) + 1
    wisdom_level = (digest[2] % 3) + 1
    return PersonalityProfile(
        energy_level=energy_level,
        humor_level=humor_level,
        wisdom_level=wisdom_level,
    )
