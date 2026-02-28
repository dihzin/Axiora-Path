from __future__ import annotations

from contextvars import ContextVar, Token
from typing import Any

from sqlalchemy import event
from sqlalchemy.engine import Engine

_query_count_var: ContextVar[int] = ContextVar("query_count", default=0)
_query_counter_active_var: ContextVar[bool] = ContextVar("query_counter_active", default=False)
_query_counter_registered = False


def start_request_query_counter() -> tuple[Token[int], Token[bool]]:
    count_token = _query_count_var.set(0)
    active_token = _query_counter_active_var.set(True)
    return count_token, active_token


def finish_request_query_counter(tokens: tuple[Token[int], Token[bool]]) -> int:
    count = _query_count_var.get()
    count_token, active_token = tokens
    _query_counter_active_var.reset(active_token)
    _query_count_var.reset(count_token)
    return count


def get_query_count() -> int:
    return _query_count_var.get()


def register_query_counter_listener() -> None:
    global _query_counter_registered
    if _query_counter_registered:
        return

    event.listen(Engine, "before_cursor_execute", _before_cursor_execute)
    _query_counter_registered = True


def _before_cursor_execute(
    conn: Any,
    cursor: Any,
    statement: str,
    parameters: Any,
    context: Any,
    executemany: bool,
) -> None:
    if not _query_counter_active_var.get():
        return
    _query_count_var.set(_query_count_var.get() + 1)
