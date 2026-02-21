from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from app.models import GameMove, GameParticipant, GameSession, GameType


class EngineMoveError(ValueError):
    pass


@dataclass(slots=True)
class EngineMoveApplyResult:
    normalized_payload: dict[str, Any]
    winner: str | None
    next_turn: str | None


@dataclass(slots=True)
class EngineComputedState:
    engine_key: str
    board: list[str | None]
    moves: list[dict[str, Any]]
    next_turn: str | None
    winner: str | None
    can_play: bool
    engine_state: dict[str, Any]


class MultiplayerEngineAdapter(Protocol):
    game_type: GameType
    engine_key: str
    supported_roles: tuple[str, str]
    default_mode: str

    def start_session(self, config: dict[str, Any] | None = None) -> dict[str, Any]:
        ...

    def join_session(self, state: dict[str, Any], participant_count: int) -> dict[str, Any]:
        ...

    def apply_move(
        self,
        *,
        state: dict[str, Any],
        role: str,
        move_payload: dict[str, Any],
        session_status: str,
    ) -> EngineMoveApplyResult:
        ...

    def get_state(
        self,
        *,
        state: dict[str, Any],
        role: str | None,
        moves: list[dict[str, Any]],
        session_status: str,
    ) -> EngineComputedState:
        ...

    def end_session(self, state: dict[str, Any], reason: str | None = None) -> dict[str, Any]:
        ...


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


class TicTacToeAdapter:
    game_type = GameType.TICTACTOE
    engine_key = "strategy_tictactoe"
    supported_roles = ("X", "O")
    default_mode = "PVP_PRIVATE"

    def start_session(self, config: dict[str, Any] | None = None) -> dict[str, Any]:
        state = {"boardSize": 3, "winLength": 3, "board": [None] * 9}
        if config:
            state.update(config)
        return state

    def join_session(self, state: dict[str, Any], participant_count: int) -> dict[str, Any]:
        _ = participant_count
        return state

    def apply_move(
        self,
        *,
        state: dict[str, Any],
        role: str,
        move_payload: dict[str, Any],
        session_status: str,
    ) -> EngineMoveApplyResult:
        if session_status not in {"WAITING", "IN_PROGRESS"}:
            raise EngineMoveError("Session is not active")
        if role not in self.supported_roles:
            raise EngineMoveError("Invalid player role")
        cell = move_payload.get("cellIndex", move_payload.get("cell"))
        if not isinstance(cell, int) or cell < 0 or cell > 8:
            raise EngineMoveError("Invalid cell index")
        board = list(state.get("board") or [None] * 9)
        winner = _winner_for_board(board)
        if winner is not None:
            raise EngineMoveError("Session already finished")
        if board[cell] is not None:
            raise EngineMoveError("Cell already occupied")
        expected_role = "X" if sum(1 for v in board if v is not None) % 2 == 0 else "O"
        if role != expected_role:
            raise EngineMoveError("It is not this player's turn")
        board[cell] = role
        winner = _winner_for_board(board)
        if winner is None and all(v is not None for v in board):
            winner = "DRAW"
        next_turn = None if winner else ("O" if role == "X" else "X")
        return EngineMoveApplyResult(
            normalized_payload={"cell": cell, "role": role, "engine": self.engine_key},
            winner=winner,
            next_turn=next_turn,
        )

    def get_state(
        self,
        *,
        state: dict[str, Any],
        role: str | None,
        moves: list[dict[str, Any]],
        session_status: str,
    ) -> EngineComputedState:
        board: list[str | None] = [None] * 9
        normalized_moves: list[dict[str, Any]] = []
        for idx, item in enumerate(moves, start=1):
            payload = item.get("payload", {})
            cell = int(payload.get("cell", -1))
            move_role = str(payload.get("role", "X"))
            if 0 <= cell <= 8:
                board[cell] = move_role
            normalized_moves.append(
                {
                    "moveIndex": int(item.get("moveIndex", idx)),
                    "userId": int(item.get("userId")),
                    "cellIndex": max(0, cell),
                    "playerRole": move_role if move_role in self.supported_roles else "X",
                    "createdAt": item.get("createdAt"),
                },
            )
        winner = _winner_for_board(board)
        if winner is None and all(cell is not None for cell in board):
            winner = "DRAW"
        next_turn = None if winner else ("X" if len(moves) % 2 == 0 else "O")
        can_play = bool(next_turn and role == next_turn and session_status == "IN_PROGRESS")
        return EngineComputedState(
            engine_key=self.engine_key,
            board=board,
            moves=normalized_moves,
            next_turn=next_turn,
            winner=winner,
            can_play=can_play,
            engine_state={
                "board": board,
                "boardSize": int(state.get("boardSize", 3)),
                "winLength": int(state.get("winLength", 3)),
            },
        )

    def end_session(self, state: dict[str, Any], reason: str | None = None) -> dict[str, Any]:
        next_state = dict(state)
        if reason:
            next_state["endReason"] = reason
        return next_state


class _ScoreDuelAdapter:
    def __init__(self, game_type: GameType, engine_key: str, target_score: int, default_mode: str = "PVP_PRIVATE") -> None:
        self.game_type = game_type
        self.engine_key = engine_key
        self.supported_roles = ("P1", "P2")
        self.default_mode = default_mode
        self._target_score = target_score

    def start_session(self, config: dict[str, Any] | None = None) -> dict[str, Any]:
        state = {"targetScore": self._target_score, "scores": {"P1": 0, "P2": 0}, "round": 1}
        if config:
            state.update(config)
        return state

    def join_session(self, state: dict[str, Any], participant_count: int) -> dict[str, Any]:
        state = dict(state)
        state["participantCount"] = participant_count
        return state

    def apply_move(
        self,
        *,
        state: dict[str, Any],
        role: str,
        move_payload: dict[str, Any],
        session_status: str,
    ) -> EngineMoveApplyResult:
        if session_status not in {"WAITING", "IN_PROGRESS"}:
            raise EngineMoveError("Session is not active")
        if role not in self.supported_roles:
            raise EngineMoveError("Invalid player role")
        points = int(move_payload.get("points", 1))
        points = max(0, min(points, 10))
        next_turn = "P2" if role == "P1" else "P1"
        return EngineMoveApplyResult(
            normalized_payload={
                "points": points,
                "role": role,
                "action": str(move_payload.get("action", "answer")),
                "engine": self.engine_key,
            },
            winner=None,
            next_turn=next_turn,
        )

    def get_state(
        self,
        *,
        state: dict[str, Any],
        role: str | None,
        moves: list[dict[str, Any]],
        session_status: str,
    ) -> EngineComputedState:
        scores = {"P1": 0, "P2": 0}
        normalized_moves: list[dict[str, Any]] = []
        for idx, item in enumerate(moves, start=1):
            payload = item.get("payload", {})
            move_role = str(payload.get("role", "P1"))
            points = int(payload.get("points", 0))
            if move_role in scores:
                scores[move_role] += points
            normalized_moves.append(
                {
                    "moveIndex": int(item.get("moveIndex", idx)),
                    "userId": int(item.get("userId")),
                    "cellIndex": 0,
                    "playerRole": move_role,
                    "createdAt": item.get("createdAt"),
                    "payload": payload,
                },
            )
        winner: str | None = None
        target = int(state.get("targetScore", self._target_score))
        if scores["P1"] >= target or scores["P2"] >= target:
            winner = "P1" if scores["P1"] > scores["P2"] else ("P2" if scores["P2"] > scores["P1"] else "DRAW")
        next_turn = None if winner else ("P1" if len(moves) % 2 == 0 else "P2")
        can_play = bool(next_turn and role == next_turn and session_status == "IN_PROGRESS")
        return EngineComputedState(
            engine_key=self.engine_key,
            board=[],
            moves=normalized_moves,
            next_turn=next_turn,
            winner=winner,
            can_play=can_play,
            engine_state={"scores": scores, "targetScore": target, "round": len(moves) + 1},
        )

    def end_session(self, state: dict[str, Any], reason: str | None = None) -> dict[str, Any]:
        next_state = dict(state)
        if reason:
            next_state["endReason"] = reason
        return next_state


class PuzzleCoopAdapter(_ScoreDuelAdapter):
    def __init__(self) -> None:
        super().__init__(game_type=GameType.PUZZLE_COOP, engine_key="puzzle_coop", target_score=100, default_mode="COOP_PRIVATE")

    def apply_move(
        self,
        *,
        state: dict[str, Any],
        role: str,
        move_payload: dict[str, Any],
        session_status: str,
    ) -> EngineMoveApplyResult:
        result = super().apply_move(state=state, role=role, move_payload=move_payload, session_status=session_status)
        result.normalized_payload["action"] = str(move_payload.get("action", "progress"))
        return result

    def get_state(
        self,
        *,
        state: dict[str, Any],
        role: str | None,
        moves: list[dict[str, Any]],
        session_status: str,
    ) -> EngineComputedState:
        base = super().get_state(state=state, role=role, moves=moves, session_status=session_status)
        total = int(base.engine_state["scores"]["P1"]) + int(base.engine_state["scores"]["P2"])
        target = int(base.engine_state["targetScore"])
        winner = "TEAM" if total >= target else None
        base.winner = winner
        base.next_turn = None
        base.can_play = session_status == "IN_PROGRESS"
        base.engine_state = {
            "progress": total,
            "targetProgress": target,
            "progressRatio": round(min(1.0, total / max(target, 1)), 3),
        }
        return base


_ENGINE_REGISTRY: dict[GameType, MultiplayerEngineAdapter] = {
    GameType.TICTACTOE: TicTacToeAdapter(),
    GameType.QUIZ_BATTLE: _ScoreDuelAdapter(GameType.QUIZ_BATTLE, "quiz_battle", target_score=8),
    GameType.MATH_CHALLENGE: _ScoreDuelAdapter(GameType.MATH_CHALLENGE, "timed_math_duel", target_score=10),
    GameType.PUZZLE_COOP: PuzzleCoopAdapter(),
    GameType.FINANCE_BATTLE: _ScoreDuelAdapter(GameType.FINANCE_BATTLE, "finance_battle", target_score=120),
}


def get_multiplayer_engine(game_type: str | GameType) -> MultiplayerEngineAdapter | None:
    parsed: GameType | None = None
    if isinstance(game_type, GameType):
        parsed = game_type
    else:
        try:
            parsed = GameType(game_type)
        except ValueError:
            return None
    return _ENGINE_REGISTRY.get(parsed)


def build_state_payload(
    *,
    session: GameSession,
    participants: list[GameParticipant],
    moves: list[GameMove],
    user_id: int,
) -> dict[str, Any]:
    adapter = get_multiplayer_engine(session.game_type)
    if adapter is None:
        raise EngineMoveError("Unsupported multiplayer game type")
    role_map = {int(item.user_id): str(item.player_role) for item in participants}
    raw_moves = [
        {
            "moveIndex": int(mv.move_index),
            "userId": int(mv.user_id),
            "payload": mv.move_payload if isinstance(mv.move_payload, dict) else {},
            "createdAt": mv.created_at,
        }
        for mv in moves
    ]
    engine_state = dict(session.metadata_payload or {})
    computed = adapter.get_state(
        state=engine_state,
        role=role_map.get(int(user_id)),
        moves=raw_moves,
        session_status=session.session_status,
    )
    if computed.winner and session.session_status != "FINISHED":
        session.session_status = "FINISHED"
    normalized_status = session.session_status if session.session_status in {"WAITING", "IN_PROGRESS", "FINISHED", "CANCELLED"} else "WAITING"
    return {
        "sessionId": session.id,
        "status": normalized_status,
        "multiplayerMode": session.multiplayer_mode,
        "gameType": session.game_type.value if isinstance(session.game_type, GameType) else str(session.game_type),
        "engineKey": computed.engine_key,
        "board": computed.board,
        "participants": [
            {"userId": int(item.user_id), "isHost": bool(item.is_host), "playerRole": str(item.player_role)}
            for item in participants
        ],
        "moves": computed.moves,
        "nextTurn": computed.next_turn,
        "winner": computed.winner,
        "canPlay": computed.can_play,
        "expiresAt": session.expires_at,
        "engineState": computed.engine_state,
    }
