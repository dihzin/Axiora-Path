from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


MultiplayerModeLiteral = Literal["PVP_PRIVATE", "COOP_PRIVATE"]
SessionStatusLiteral = Literal["WAITING", "IN_PROGRESS", "FINISHED", "CANCELLED"]
GameTypeLiteral = Literal["TICTACTOE", "QUIZ_BATTLE", "MATH_CHALLENGE", "PUZZLE_COOP", "FINANCE_BATTLE"]


class MultiplayerCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    game_type: GameTypeLiteral = Field(alias="gameType")
    mode: MultiplayerModeLiteral = "PVP_PRIVATE"
    join_method: Literal["QR_CODE", "SHORT_CODE"] = Field(default="QR_CODE", alias="joinMethod")
    ttl_minutes: int = Field(default=30, ge=5, le=120, alias="ttlMinutes")
    config: dict[str, Any] | None = None


class MultiplayerCreateResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    session_id: str = Field(alias="sessionId")
    join_code: str = Field(alias="joinCode")
    join_token: str = Field(alias="joinToken")
    join_url: str = Field(alias="joinUrl")
    game_type: GameTypeLiteral = Field(alias="gameType")
    engine_key: str = Field(alias="engineKey")
    status: SessionStatusLiteral
    expires_at: datetime = Field(alias="expiresAt")


class MultiplayerJoinRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    join_code: str | None = Field(default=None, alias="joinCode")
    join_token: str | None = Field(default=None, alias="joinToken")


class MultiplayerMoveRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    cell_index: int | None = Field(default=None, alias="cellIndex", ge=0, le=8)
    action: str | None = None
    payload: dict[str, Any] | None = None


class MultiplayerParticipantOut(BaseModel):
    user_id: int = Field(alias="userId")
    is_host: bool = Field(alias="isHost")
    player_role: str = Field(alias="playerRole")


class MultiplayerMoveOut(BaseModel):
    move_index: int = Field(alias="moveIndex")
    user_id: int = Field(alias="userId")
    cell_index: int = Field(alias="cellIndex")
    player_role: str = Field(alias="playerRole")
    created_at: datetime = Field(alias="createdAt")


class MultiplayerStateResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    game_type: GameTypeLiteral = Field(alias="gameType")
    engine_key: str = Field(alias="engineKey")
    session_id: str = Field(alias="sessionId")
    status: SessionStatusLiteral
    multiplayer_mode: MultiplayerModeLiteral = Field(alias="multiplayerMode")
    board: list[str | None]
    participants: list[MultiplayerParticipantOut]
    moves: list[MultiplayerMoveOut]
    next_turn: str | None = Field(alias="nextTurn")
    winner: str | None = None
    can_play: bool = Field(alias="canPlay")
    expires_at: datetime | None = Field(default=None, alias="expiresAt")
    engine_state: dict[str, Any] = Field(default_factory=dict, alias="engineState")


class MultiplayerCloseRequest(BaseModel):
    reason: str | None = None
