from __future__ import annotations

from datetime import UTC, datetime, timedelta
from secrets import token_urlsafe
from string import ascii_uppercase, digits
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import Select, select

from app.api.deps import DBSession, get_current_tenant, get_current_user, require_role
from app.models import GameMove, GameParticipant, GameSession, GameType, Membership, Tenant, User
from app.schemas.games_multiplayer import (
    MultiplayerCloseRequest,
    MultiplayerCreateRequest,
    MultiplayerCreateResponse,
    MultiplayerJoinRequest,
    MultiplayerMoveRequest,
    MultiplayerMoveOut,
    MultiplayerParticipantOut,
    MultiplayerStateResponse,
)

router = APIRouter(prefix="/api/games/multiplayer", tags=["games-multiplayer"])

_JOIN_ALPHABET = "".join(ch for ch in (ascii_uppercase + digits) if ch not in {"0", "1", "I", "O"})


def _now() -> datetime:
    return datetime.now(tz=UTC)


def _generate_join_code(length: int = 6) -> str:
    import random

    return "".join(random.choice(_JOIN_ALPHABET) for _ in range(length))


def _winner_for_board(board: list[str | None]) -> str | None:
    wins = [
        (0, 1, 2),
        (3, 4, 5),
        (6, 7, 8),
        (0, 3, 6),
        (1, 4, 7),
        (2, 5, 8),
        (0, 4, 8),
        (2, 4, 6),
    ]
    for a, b, c in wins:
        if board[a] and board[a] == board[b] == board[c]:
            return board[a]
    return None


def _participant_role_map(participants: list[GameParticipant]) -> dict[int, str]:
    return {int(item.user_id): str(item.player_role) for item in participants}


def _build_state(*, session: GameSession, participants: list[GameParticipant], moves: list[GameMove], user_id: int) -> MultiplayerStateResponse:
    board: list[str | None] = [None] * 9
    move_out: list[MultiplayerMoveOut] = []
    role_map = _participant_role_map(participants)

    for mv in moves:
        payload = mv.move_payload if isinstance(mv.move_payload, dict) else {}
        cell = int(payload.get("cell", -1))
        role = str(payload.get("role", role_map.get(int(mv.user_id), "X")))
        if 0 <= cell <= 8:
            board[cell] = role
        move_out.append(
            MultiplayerMoveOut(
                moveIndex=int(mv.move_index),
                userId=int(mv.user_id),
                cellIndex=max(0, cell),
                playerRole=role if role in {"X", "O"} else "X",
                createdAt=mv.created_at,
            ),
        )

    winner = _winner_for_board(board)
    if winner is None and all(cell is not None for cell in board):
        winner = "DRAW"

    if winner and session.session_status != "FINISHED":
        session.session_status = "FINISHED"

    next_turn: str | None = None
    if winner is None:
        next_turn = "X" if len(moves) % 2 == 0 else "O"

    user_role = role_map.get(int(user_id))
    can_play = bool(next_turn and user_role == next_turn and session.session_status == "IN_PROGRESS")

    return MultiplayerStateResponse(
        sessionId=session.id,
        status=session.session_status if session.session_status in {"WAITING", "IN_PROGRESS", "FINISHED", "CANCELLED"} else "WAITING",
        multiplayerMode="PVP_PRIVATE",
        board=board,
        participants=[
            MultiplayerParticipantOut(userId=int(item.user_id), isHost=bool(item.is_host), playerRole="X" if item.player_role == "X" else "O")
            for item in participants
        ],
        moves=move_out,
        nextTurn=next_turn if next_turn in {"X", "O"} else None,
        winner=winner if winner in {"X", "O", "DRAW"} else None,
        canPlay=can_play,
        expiresAt=session.expires_at,
    )


def _session_query(*, tenant_id: int, session_id: str) -> Select[tuple[GameSession]]:
    return (
        select(GameSession)
        .where(
            GameSession.id == session_id,
            GameSession.tenant_id == tenant_id,
            GameSession.multiplayer_mode == "PVP_PRIVATE",
        )
        .with_for_update()
    )


@router.post("/session/create", response_model=MultiplayerCreateResponse)
def create_multiplayer_session(
    payload: MultiplayerCreateRequest,
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __membership: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> MultiplayerCreateResponse:
    if payload.game_type != "TICTACTOE":
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Only TICTACTOE is enabled for multiplayer MVP")

    expires_at = _now() + timedelta(minutes=payload.ttl_minutes)
    join_token = token_urlsafe(24)
    join_code = _generate_join_code(6)
    for _ in range(5):
        conflict = db.scalar(
            select(GameSession.id).where(
                GameSession.join_code == join_code,
                GameSession.multiplayer_mode == "PVP_PRIVATE",
                GameSession.expires_at > _now(),
            ),
        )
        if conflict is None:
            break
        join_code = _generate_join_code(6)

    session = GameSession(
        tenant_id=tenant.id,
        user_id=user.id,
        game_type=GameType.TICTACTOE,
        session_status="WAITING",
        multiplayer_mode="PVP_PRIVATE",
        join_token=join_token,
        join_code=join_code,
        expires_at=expires_at,
        metadata_payload={"boardSize": 3, "winLength": 3},
        score=0,
        xp_earned=0,
        coins_earned=0,
    )
    db.add(session)
    db.flush()

    db.add(
        GameParticipant(
            session_id=session.id,
            user_id=user.id,
            is_host=True,
            player_role="X",
        ),
    )
    db.commit()
    return MultiplayerCreateResponse(
        sessionId=session.id,
        joinCode=join_code,
        joinToken=join_token,
        joinUrl=f"/child/games/tictactoe?join={join_code}",
        status="WAITING",
        expiresAt=expires_at,
    )


@router.post("/session/join", response_model=MultiplayerStateResponse)
def join_multiplayer_session(
    payload: MultiplayerJoinRequest,
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __membership: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> MultiplayerStateResponse:
    code = payload.join_code.strip().upper() if payload.join_code else None
    token = payload.join_token.strip() if payload.join_token else None
    if not code and not token:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="joinCode or joinToken is required")

    filters = [
        GameSession.tenant_id == tenant.id,
        GameSession.multiplayer_mode == "PVP_PRIVATE",
        GameSession.expires_at > _now(),
    ]
    if code:
        filters.append(GameSession.join_code == code)
    if token:
        filters.append(GameSession.join_token == token)
    session = db.scalar(select(GameSession).where(*filters))
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Multiplayer session not found")
    if session.session_status in {"FINISHED", "CANCELLED"}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Session already closed")

    participants = db.scalars(
        select(GameParticipant).where(GameParticipant.session_id == session.id).order_by(GameParticipant.joined_at.asc()),
    ).all()
    if any(int(item.user_id) == int(user.id) for item in participants):
        moves = db.scalars(select(GameMove).where(GameMove.session_id == session.id).order_by(GameMove.move_index.asc())).all()
        return _build_state(session=session, participants=participants, moves=moves, user_id=user.id)
    if len(participants) >= 2:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Session is full")

    db.add(
        GameParticipant(
            session_id=session.id,
            user_id=user.id,
            is_host=False,
            player_role="O",
        ),
    )
    session.session_status = "IN_PROGRESS"
    db.flush()
    participants = db.scalars(
        select(GameParticipant).where(GameParticipant.session_id == session.id).order_by(GameParticipant.joined_at.asc()),
    ).all()
    moves = db.scalars(select(GameMove).where(GameMove.session_id == session.id).order_by(GameMove.move_index.asc())).all()
    state = _build_state(session=session, participants=participants, moves=moves, user_id=user.id)
    db.commit()
    return state


@router.get("/session/{session_id}", response_model=MultiplayerStateResponse)
def get_multiplayer_session_state(
    session_id: str,
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __membership: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> MultiplayerStateResponse:
    session = db.scalar(
        select(GameSession).where(
            GameSession.id == session_id,
            GameSession.tenant_id == tenant.id,
            GameSession.multiplayer_mode == "PVP_PRIVATE",
        ),
    )
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Multiplayer session not found")

    participants = db.scalars(
        select(GameParticipant).where(GameParticipant.session_id == session.id).order_by(GameParticipant.joined_at.asc()),
    ).all()
    if not any(int(item.user_id) == int(user.id) for item in participants):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is not a participant in this session")

    moves = db.scalars(select(GameMove).where(GameMove.session_id == session.id).order_by(GameMove.move_index.asc())).all()
    return _build_state(session=session, participants=participants, moves=moves, user_id=user.id)


@router.post("/session/{session_id}/move", response_model=MultiplayerStateResponse)
def post_multiplayer_move(
    session_id: str,
    payload: MultiplayerMoveRequest,
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __membership: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> MultiplayerStateResponse:
    session = db.scalar(_session_query(tenant_id=tenant.id, session_id=session_id))
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Multiplayer session not found")
    if session.expires_at and session.expires_at <= _now():
        session.session_status = "CANCELLED"
        db.commit()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Session expired")

    participants = db.scalars(
        select(GameParticipant).where(GameParticipant.session_id == session.id).order_by(GameParticipant.joined_at.asc()),
    ).all()
    if len(participants) < 2:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Waiting for second player")
    role_map = _participant_role_map(participants)
    user_role = role_map.get(int(user.id))
    if user_role is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is not a participant in this session")
    if session.session_status not in {"WAITING", "IN_PROGRESS"}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Session is not active")
    session.session_status = "IN_PROGRESS"

    moves = db.scalars(select(GameMove).where(GameMove.session_id == session.id).order_by(GameMove.move_index.asc())).all()
    expected_role = "X" if len(moves) % 2 == 0 else "O"
    if user_role != expected_role:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="It is not this player's turn")

    board: list[str | None] = [None] * 9
    for mv in moves:
        data = mv.move_payload if isinstance(mv.move_payload, dict) else {}
        cell = int(data.get("cell", -1))
        role = str(data.get("role", "X"))
        if 0 <= cell <= 8:
            board[cell] = role
    if board[payload.cell_index] is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cell already occupied")

    db.add(
        GameMove(
            session_id=session.id,
            user_id=user.id,
            move_index=len(moves) + 1,
            move_payload={"cell": payload.cell_index, "role": user_role},
        ),
    )
    db.flush()

    refreshed_moves = db.scalars(select(GameMove).where(GameMove.session_id == session.id).order_by(GameMove.move_index.asc())).all()
    state = _build_state(session=session, participants=participants, moves=refreshed_moves, user_id=user.id)
    db.commit()
    return state


@router.post("/session/{session_id}/close", response_model=MultiplayerStateResponse)
def close_multiplayer_session(
    session_id: str,
    payload: MultiplayerCloseRequest,
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __membership: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> MultiplayerStateResponse:
    _ = payload
    session = db.scalar(_session_query(tenant_id=tenant.id, session_id=session_id))
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Multiplayer session not found")

    participants = db.scalars(
        select(GameParticipant).where(GameParticipant.session_id == session.id).order_by(GameParticipant.joined_at.asc()),
    ).all()
    if not any(int(item.user_id) == int(user.id) for item in participants):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is not a participant in this session")
    session.session_status = "CANCELLED"
    moves = db.scalars(select(GameMove).where(GameMove.session_id == session.id).order_by(GameMove.move_index.asc())).all()
    state = _build_state(session=session, participants=participants, moves=moves, user_id=user.id)
    db.commit()
    return state
