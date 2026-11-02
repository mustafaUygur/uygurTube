#!/usr/bin/env python3
"""Classify and filter locally fetched YouTube video metadata."""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
RAW_FILE = ROOT / "data" / "videos_raw.json"
CLEAN_FILE = ROOT / "data" / "videos_clean.json"
REVIEW_FILE = ROOT / "data" / "review.json"
DURATION_PATTERN = re.compile(
    r"^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$"
)


def parse_duration(value: str) -> int | None:
    match = DURATION_PATTERN.fullmatch(value)
    if not match:
        return None
    days, hours, minutes, seconds = match.groups()
    return (
        int(days or 0) * 86400
        + int(hours or 0) * 3600
        + int(minutes or 0) * 60
        + int(float(seconds or 0))
    )


def unicode_script(char: str) -> str | None:
    point = ord(char)
    if (
        0x0600 <= point <= 0x06FF
        or 0x0750 <= point <= 0x077F
        or 0x08A0 <= point <= 0x08FF
        or 0xFB50 <= point <= 0xFDFF
        or 0xFE70 <= point <= 0xFEFF
        or 0x10E60 <= point <= 0x10E7F
        or 0x10EC0 <= point <= 0x10EFF
    ):
        return "arab"
    if (
        0x0400 <= point <= 0x052F
        or 0x2DE0 <= point <= 0x2DFF
        or 0xA640 <= point <= 0xA69F
    ):
        return "kiril"
    if (
        0x0041 <= point <= 0x024F
        or 0x1E00 <= point <= 0x1EFF
        or 0xA720 <= point <= 0xA7FF
        or 0xAB30 <= point <= 0xAB6F
    ):
        return "latin"
    return None


def uyghur_hint_score(text: str, script: str) -> int:
    lowered = text.casefold()
    if script == "kiril":
        return sum(lowered.count(char) for char in "өүғқңһ")
    if script == "latin":
        score = sum(lowered.count(char) for char in "ëöü")
        score += sum(len(re.findall(pattern, lowered)) for pattern in (r"ch", r"gh", r"sh", r"ng"))
        return score
    return 0


def classify_script(text: str) -> str | None:
    counts = {"arab": 0, "latin": 0, "kiril": 0}
    for char in text:
        if not unicodedata.category(char).startswith("L"):
            continue
        script = unicode_script(char)
        if script:
            counts[script] += 1

    present = {script: count for script, count in counts.items() if count}
    if not present:
        return None
    if len(present) == 1:
        script, count = next(iter(present.items()))
        if count >= 4 or (count >= 2 and uyghur_hint_score(text, script) > 0):
            return script
        return None

    substantial = [count for count in present.values() if count >= 2]
    if len(substantial) >= 2 and sum(present.values()) >= 5:
        return "karisik"
    script, count = max(present.items(), key=lambda item: item[1])
    if count >= 4 and count / sum(present.values()) >= 0.9:
        if count >= 4 or uyghur_hint_score(text, script) > 0:
            return script
    return None


def is_unavailable(video: dict[str, Any]) -> bool:
    privacy = video.get("privacyStatus")
    upload_status = video.get("uploadStatus")
    return privacy in {"private", "unlisted"} or upload_status in {
        "deleted",
        "failed",
        "rejected",
    }


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_file = path.with_suffix(path.suffix + ".tmp")
    temporary_file.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    temporary_file.replace(path)


def clean(include_shorts: bool = False) -> tuple[int, int]:
    try:
        payload = json.loads(RAW_FILE.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise RuntimeError(f"Ham video dosyası bulunamadı: {RAW_FILE}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Ham video JSON'u geçersiz: {exc}") from exc
    videos = payload.get("videos") if isinstance(payload, dict) else None
    if not isinstance(videos, list):
        raise RuntimeError("videos_raw.json içinde videos listesi bulunamadı.")

    clean_videos: list[dict[str, Any]] = []
    review: list[dict[str, Any]] = []
    for video in videos:
        if not isinstance(video, dict):
            review.append({"reason": "Kayıt nesne biçiminde değil.", "video": video})
            continue
        if is_unavailable(video):
            continue

        duration_value = video.get("duration")
        duration = (
            parse_duration(duration_value)
            if isinstance(duration_value, str)
            else None
        )
        if duration is None:
            review.append({"reason": "Video süresi eksik veya geçersiz.", "video": video})
            continue
        if duration < 60 and not include_shorts:
            continue

        title = video.get("title")
        if not isinstance(title, str) or not title.strip():
            review.append({"reason": "Başlık boş; elle incelenmeli.", "video": video})
            continue
        text = f"{title}\n{video.get('description', '')}"
        script = classify_script(text)
        if script is None:
            review.append(
                {
                    "reason": "Yazı türü için yeterli güvenilir Unicode metni bulunamadı.",
                    "video": video,
                }
            )
            continue

        cleaned = dict(video)
        cleaned["duration"] = duration
        cleaned["script"] = script
        clean_videos.append(cleaned)

    timestamp = datetime.now(timezone.utc).isoformat()
    write_json(CLEAN_FILE, {"updatedAt": timestamp, "videos": clean_videos})
    write_json(REVIEW_FILE, {"updatedAt": timestamp, "videos": review})
    return len(clean_videos), len(review)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--include-shorts",
        action="store_true",
        help="60 saniyeden kısa videoları da dahil et (varsayılan: hariç tut).",
    )
    args = parser.parse_args()
    try:
        accepted, reviewed = clean(include_shorts=args.include_shorts)
    except RuntimeError as error:
        parser.exit(1, f"Hata: {error}\n")
    print(f"Temizlendi: {accepted} video; elle incelenecek: {reviewed}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
