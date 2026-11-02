#!/usr/bin/env python3
"""Copy the static site into the GitHub Pages docs directory."""

from __future__ import annotations

import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "site"
DESTINATION = ROOT / "docs"


def sync() -> None:
    if not SOURCE.is_dir():
        raise RuntimeError(f"Site klasoru bulunamadi: {SOURCE}")
    shutil.copytree(SOURCE, DESTINATION, dirs_exist_ok=True)


if __name__ == "__main__":
    try:
        sync()
    except (OSError, RuntimeError) as error:
        raise SystemExit(f"Hata: {error}") from error
    print(f"GitHub Pages dosyalari kopyalandi: {SOURCE} -> {DESTINATION}")
