#!/usr/bin/env python3
"""Build the public, static-site video catalog."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
CLEAN_FILE = ROOT / "data" / "videos_clean.json"
OUTPUT_FILE = ROOT / "site" / "data" / "videos.json"
PUBLIC_FIELDS = (
    "id",
    "title",
    "channel",
    "channelId",
    "thumbnail",
    "duration",
    "views",
    "publishedAt",
    "category",
    "script",
)


def build() -> int:
    try:
        payload = json.loads(CLEAN_FILE.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise RuntimeError(f"Temiz video dosyası bulunamadı: {CLEAN_FILE}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Temiz video JSON'u geçersiz: {exc}") from exc
    videos = payload.get("videos") if isinstance(payload, dict) else None
    if not isinstance(videos, list):
        raise RuntimeError("videos_clean.json içinde videos listesi bulunamadı.")

    public_videos: list[dict[str, Any]] = []
    for index, video in enumerate(videos):
        if not isinstance(video, dict):
            raise RuntimeError(f"Temiz katalogdaki {index}. kayıt nesne değil.")
        missing = [field for field in PUBLIC_FIELDS if field not in video]
        if missing:
            raise RuntimeError(
                f"{index}. videoda zorunlu alan(lar) eksik: {', '.join(missing)}"
            )
        public_videos.append({field: video[field] for field in PUBLIC_FIELDS})

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    temporary_file = OUTPUT_FILE.with_suffix(".json.tmp")
    temporary_file.write_text(
        json.dumps(public_videos, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary_file.replace(OUTPUT_FILE)
    return len(public_videos)


if __name__ == "__main__":
    try:
        count = build()
    except RuntimeError as error:
        raise SystemExit(f"Hata: {error}") from error
    print(f"Site katalogu olusturuldu: {count} video ({OUTPUT_FILE})")
