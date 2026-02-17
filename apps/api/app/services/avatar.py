from __future__ import annotations


def compute_avatar_stage(xp_total: int) -> int:
    if xp_total >= 900:
        return 3
    if xp_total >= 300:
        return 2
    return 1
