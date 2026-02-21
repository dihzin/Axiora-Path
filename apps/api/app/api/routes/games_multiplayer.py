from __future__ import annotations

from datetime import UTC, datetime, timedelta
from secrets import token_urlsafe
from string import ascii_uppercase, digits
from typing import Annotated

import anyio
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy import Select, select

from app.api.deps import DBSession, get_current_tenant, get_current_user, require_role
from app.core.security import decode_token
from app.db.session import SessionLocal
from app.models import AxionSignalType, GameMove, GameParticipant, GameSession, Membership, Tenant, User
from app.schemas.games_multiplayer import (
    MultiplayerCloseRequest,
    MultiplayerCreateRequest,
    MultiplayerCreateResponse,
    MultiplayerJoinRequest,
    MultiplayerMoveRequest,
    MultiplayerStateResponse,
)
from app.services.multiplayer import EngineMoveError, build_state_payload, get_multiplayer_engine
from app.services.axion_core_v2 import recordAxionSignal

router = APIRouter(prefix="/api/games/multiplayer", tags=["games-multiplayer"])

_JOIN_ALPHABET = "".join(ch for ch in (ascii_uppercase + digits) if ch not in {"0", "1", "I", "O"})


class _MultiplayerWsHub:
    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = {}

    async def connect(self, session_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.setdefault(session_id, set()).add(websocket)

    def disconnect(self, session_id: str, websocket: WebSocket) -> None:
        bucket = self._connections.get(session_id)
        if not bucket:
            return
        bucket.discard(websocket)
        if not bucket:
            self._connections.pop(session_id, None)

    async def broadcast_state(self, session_id: str, payload: dict[str, object]) -> None:
        bucket = list(self._connections.get(session_id, set()))
        if not bucket:
            return
        stale: list[WebSocket] = []
        for ws in bucket:
            try:
                await ws.send_json(payload)
            except Exception:
                stale.append(ws)
        for ws in stale:
            self.disconnect(session_id, ws)


_WS_HUB = _MultiplayerWsHub()


def _now() -> datetime:
    return datetime.now(tz=UTC)


def _generate_join_code(length: int = 6) -> str:
    import random

    return "".join(random.choice(_JOIN_ALPHABET) for _ in range(length))


def _participant_role_map(participants: list[GameParticipant]) -> dict[int, str]:
    return {int(item.user_id): str(item.player_role) for item in participants}


def _build_state(*, session: GameSession, participants: list[GameParticipant], moves: list[GameMove], user_id: int) -> MultiplayerStateResponse:
    try:
        payload = build_state_payload(session=session, participants=participants, moves=moves, user_id=user_id)
    except EngineMoveError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return MultiplayerStateResponse.model_validate(payload)


def _emit_axion_multiplayer_signals(*, db: DBSession, session: GameSession, state: MultiplayerStateResponse) -> None:
    already_emitted = False
    if isinstance(session.metadata_payload, dict):
        already_emitted = bool(session.metadata_payload.get("axionSignalsEmitted"))
    if already_emitted:
        return
    if state.winner is None:
        return
    for participant in state.participants:
        is_winner = bool(state.winner) and state.winner not in {"DRAW"} and (
            state.winner == "TEAM" or participant.player_role == state.winner
        )
        payload = {
            "source": "multiplayer_engine",
            "gameType": state.game_type,
            "engineKey": state.engine_key,
            "sessionId": session.id,
            "winner": state.winner,
            "playerRole": participant.player_role,
            "result": "WIN" if is_winner else ("DRAW" if state.winner == "DRAW" else "LOSS"),
            "movesCount": len(state.moves),
        }
        recordAxionSignal(
            userId=int(participant.user_id),
            type=AxionSignalType.GAME_PLAYED,
            payload=payload,
            db=db,
        )
    metadata = dict(session.metadata_payload or {})
    metadata["axionSignalsEmitted"] = True
    session.metadata_payload = metadata


def _publish_state_realtime(state: MultiplayerStateResponse) -> None:
    payload = state.model_dump(by_alias=True)
    try:
        anyio.from_thread.run(_WS_HUB.broadcast_state, state.session_id, payload)
    except Exception:
        # WebSocket broadcast is best-effort. HTTP flow remains source of truth.
        return


def _session_query(*, tenant_id: int, session_id: str) -> Select[tuple[GameSession]]:
    return (
        select(GameSession)
        .where(
            GameSession.id == session_id,
            GameSession.tenant_id == tenant_id,
            GameSession.multiplayer_mode.in_(["PVP_PRIVATE", "COOP_PRIVATE"]),
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
    adapter = get_multiplayer_engine(payload.game_type)
    if adapter is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unsupported multiplayer game")

    expires_at = _now() + timedelta(minutes=payload.ttl_minutes)
    join_token = token_urlsafe(24)
    join_code = _generate_join_code(6)
    for _ in range(5):
        conflict = db.scalar(
            select(GameSession.id).where(
                GameSession.join_code == join_code,
                GameSession.multiplayer_mode == adapter.default_mode,
                GameSession.expires_at > _now(),
            ),
        )
        if conflict is None:
            break
        join_code = _generate_join_code(6)

    session = GameSession(
        tenant_id=tenant.id,
        user_id=user.id,
        game_type=adapter.game_type,
        session_status="WAITING",
        multiplayer_mode=adapter.default_mode,
        join_token=join_token,
        join_code=join_code,
        expires_at=expires_at,
        metadata_payload={"engineKey": adapter.engine_key, "engineState": adapter.start_session(payload.config)},
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
            player_role=adapter.supported_roles[0],
        ),
    )
    db.commit()
    return MultiplayerCreateResponse(
        sessionId=session.id,
        joinCode=join_code,
        joinToken=join_token,
        joinUrl=f"/join/{join_token}",
        gameType=adapter.game_type.value,
        engineKey=adapter.engine_key,
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
        GameSession.multiplayer_mode.in_(["PVP_PRIVATE", "COOP_PRIVATE"]),
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

    adapter = get_multiplayer_engine(session.game_type)
    if adapter is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unsupported multiplayer game")
    used_roles = {str(item.player_role) for item in participants}
    available_role = next((role for role in adapter.supported_roles if role not in used_roles), adapter.supported_roles[1])
    db.add(
        GameParticipant(
            session_id=session.id,
            user_id=user.id,
            is_host=False,
            player_role=available_role,
        ),
    )
    session.session_status = "IN_PROGRESS"
    metadata = dict(session.metadata_payload or {})
    metadata["engineState"] = adapter.join_session(metadata.get("engineState") or {}, len(participants) + 1)
    session.metadata_payload = metadata
    db.flush()
    participants = db.scalars(
        select(GameParticipant).where(GameParticipant.session_id == session.id).order_by(GameParticipant.joined_at.asc()),
    ).all()
    moves = db.scalars(select(GameMove).where(GameMove.session_id == session.id).order_by(GameMove.move_index.asc())).all()
    state = _build_state(session=session, participants=participants, moves=moves, user_id=user.id)
    db.commit()
    _publish_state_realtime(state)
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
            GameSession.multiplayer_mode.in_(["PVP_PRIVATE", "COOP_PRIVATE"]),
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

    adapter = get_multiplayer_engine(session.game_type)
    if adapter is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unsupported multiplayer game")
    engine_state = dict((session.metadata_payload or {}).get("engineState") or {})
    move_payload: dict[str, object] = {}
    if payload.cell_index is not None:
        move_payload["cellIndex"] = payload.cell_index
    if payload.action:
        move_payload["action"] = payload.action
    if payload.payload:
        move_payload.update(payload.payload)
    try:
        applied = adapter.apply_move(
            state=engine_state,
            role=user_role,
            move_payload=move_payload,
            session_status=session.session_status,
        )
    except EngineMoveError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    moves = db.scalars(select(GameMove).where(GameMove.session_id == session.id).order_by(GameMove.move_index.asc())).all()

    db.add(
        GameMove(
            session_id=session.id,
            user_id=user.id,
            move_index=len(moves) + 1,
            move_payload=applied.normalized_payload,
        ),
    )
    metadata = dict(session.metadata_payload or {})
    metadata["engineState"] = engine_state
    session.metadata_payload = metadata
    if applied.winner is not None:
        session.session_status = "FINISHED"
    elif session.session_status == "WAITING":
        session.session_status = "IN_PROGRESS"
    db.flush()

    refreshed_moves = db.scalars(select(GameMove).where(GameMove.session_id == session.id).order_by(GameMove.move_index.asc())).all()
    state = _build_state(session=session, participants=participants, moves=refreshed_moves, user_id=user.id)
    _emit_axion_multiplayer_signals(db=db, session=session, state=state)
    db.commit()
    _publish_state_realtime(state)
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
    session = db.scalar(_session_query(tenant_id=tenant.id, session_id=session_id))
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Multiplayer session not found")

    participants = db.scalars(
        select(GameParticipant).where(GameParticipant.session_id == session.id).order_by(GameParticipant.joined_at.asc()),
    ).all()
    if not any(int(item.user_id) == int(user.id) for item in participants):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is not a participant in this session")
    adapter = get_multiplayer_engine(session.game_type)
    if adapter:
        metadata = dict(session.metadata_payload or {})
        metadata["engineState"] = adapter.end_session(metadata.get("engineState") or {}, payload.reason)
        session.metadata_payload = metadata
    session.session_status = "CANCELLED"
    moves = db.scalars(select(GameMove).where(GameMove.session_id == session.id).order_by(GameMove.move_index.asc())).all()
    state = _build_state(session=session, participants=participants, moves=moves, user_id=user.id)
    _emit_axion_multiplayer_signals(db=db, session=session, state=state)
    db.commit()
    _publish_state_realtime(state)
    return state


@router.websocket("/ws/{session_id}")
async def multiplayer_ws(
    websocket: WebSocket,
    session_id: str,
    token: Annotated[str | None, Query()] = None,
    tenant: Annotated[str | None, Query()] = None,
) -> None:
    if not token or not tenant:
        await websocket.close(code=4401)
        return
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            await websocket.close(code=4401)
            return
        sub = payload.get("sub")
        if not isinstance(sub, str) or not sub.isdigit():
            await websocket.close(code=4401)
            return
        user_id = int(sub)
    except Exception:
        await websocket.close(code=4401)
        return

    db = SessionLocal()
    try:
        tenant_row = db.scalar(select(Tenant).where(Tenant.slug == tenant, Tenant.deleted_at.is_(None)))
        if tenant_row is None:
            await websocket.close(code=4404)
            return
        session = db.scalar(
            select(GameSession).where(
                GameSession.id == session_id,
                GameSession.tenant_id == tenant_row.id,
                GameSession.multiplayer_mode.in_(["PVP_PRIVATE", "COOP_PRIVATE"]),
            ),
        )
        if session is None:
            await websocket.close(code=4404)
            return
        participants = db.scalars(select(GameParticipant).where(GameParticipant.session_id == session.id)).all()
        if not any(int(item.user_id) == user_id for item in participants):
            await websocket.close(code=4403)
            return

        await _WS_HUB.connect(session_id, websocket)
        moves = db.scalars(select(GameMove).where(GameMove.session_id == session.id).order_by(GameMove.move_index.asc())).all()
        initial_state = _build_state(session=session, participants=participants, moves=moves, user_id=user_id)
        await websocket.send_json(initial_state.model_dump(by_alias=True))
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        return
    finally:
        _WS_HUB.disconnect(session_id, websocket)
        db.close()
