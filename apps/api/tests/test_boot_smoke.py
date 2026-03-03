from __future__ import annotations

import importlib


def test_app_main_import_smoke() -> None:
    module = importlib.import_module("app.main")
    assert module is not None
