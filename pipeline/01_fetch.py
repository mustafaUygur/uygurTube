#!/usr/bin/env python3
"""Fetch public video metadata from configured YouTube channels."""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError


ROOT = Path(__file__).resolve().parents[1]
CHANNELS_FILE = ROOT / "channels.json"
OUTPUT_FILE = ROOT / "data" / "videos_raw.json"


class QuotaExceededError(RuntimeError):
    """Raised when YouTube rejects a request because the daily quota is exhausted."""


def load_channels() -> list[dict[str, str]]:
    try:
        channels = json.loads(CHANNELS_FILE.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise RuntimeError(f"Kanallar dosyası bulunamadı: {CHANNELS_FILE}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Geçersiz JSON: {CHANNELS_FILE} ({exc})") from exc

    if not isinstance(channels, list):
        raise RuntimeError("channels.json en üst düzeyde bir liste olmalıdır.")

    validated: list[dict[str, str]] = []
    for index, channel in enumerate(channels):
        if not isinstance(channel, dict):
            raise RuntimeError(f"channels.json[{index}] bir nesne olmalıdır.")
        handle = channel.get("handle")
        channel_id = channel.get("channelId")
        category = channel.get("category")
        if bool(handle) == bool(channel_id):
            raise RuntimeError(
                f"channels.json[{index}] için handle veya channelId alanlarından "
                "tam olarak biri doldurulmalıdır."
            )
        if not isinstance(category, str) or not category.strip():
            raise RuntimeError(f"channels.json[{index}] için category boş olamaz.")
        if handle is not None and (not isinstance(handle, str) or not handle.strip()):
            raise RuntimeError(f"channels.json[{index}].handle geçersiz.")
        if channel_id is not None and (
            not isinstance(channel_id, str) or not channel_id.strip()
        ):
            raise RuntimeError(f"channels.json[{index}].channelId geçersiz.")
        validated.append(
            {
                **({"handle": handle.strip()} if handle else {}),
                **({"channelId": channel_id.strip()} if channel_id else {}),
                "category": category.strip(),
            }
        )
    return validated


def load_cache() -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]]]:
    if not OUTPUT_FILE.exists():
        return {}, []
    try:
        raw = json.loads(OUTPUT_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Önbellek JSON'u okunamadı: {OUTPUT_FILE} ({exc})") from exc

    videos = raw.get("videos", []) if isinstance(raw, dict) else None
    if not isinstance(videos, list):
        raise RuntimeError(f"Önbellek biçimi geçersiz: {OUTPUT_FILE}")
    cache = {
        video["id"]: video
        for video in videos
        if isinstance(video, dict) and isinstance(video.get("id"), str)
    }
    return cache, videos


def save_cache(
    videos: dict[str, dict[str, Any]], channels: list[dict[str, Any]]
) -> None:
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "channels": channels,
        "videos": list(videos.values()),
    }
    temporary_file = OUTPUT_FILE.with_suffix(".json.tmp")
    temporary_file.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    temporary_file.replace(OUTPUT_FILE)


def error_reasons(error: HttpError) -> set[str]:
    try:
        payload = json.loads(error.content.decode("utf-8"))
    except (AttributeError, UnicodeDecodeError, json.JSONDecodeError):
        return set()
    errors = payload.get("error", {}).get("errors", [])
    return {
        item.get("reason", "")
        for item in errors
        if isinstance(item, dict) and isinstance(item.get("reason"), str)
    }


def execute(request: Any) -> dict[str, Any]:
    try:
        return request.execute()
    except HttpError as exc:
        if "quotaExceeded" in error_reasons(exc):
            raise QuotaExceededError from exc
        raise


def channel_details(youtube: Any, channel: dict[str, str]) -> dict[str, Any]:
    params: dict[str, Any] = {"part": "snippet,contentDetails"}
    if "handle" in channel:
        params["forHandle"] = channel["handle"]
    else:
        params["id"] = channel["channelId"]

    response = execute(youtube.channels().list(**params))
    items = response.get("items", [])
    if not items:
        identity = channel.get("handle", channel.get("channelId", ""))
        print(f"Uyari: Kanal bulunamadi veya erisilemiyor: {identity}", file=sys.stderr)
        return {}
    item = items[0]
    return {
        "id": item["id"],
        "name": item.get("snippet", {}).get("title", ""),
        "uploadsPlaylistId": (
            item.get("contentDetails", {})
            .get("relatedPlaylists", {})
            .get("uploads")
        ),
    }


def playlist_video_ids(youtube: Any, playlist_id: str) -> list[str]:
    video_ids: list[str] = []
    page_token: str | None = None
    while True:
        params: dict[str, Any] = {
            "part": "snippet,contentDetails",
            "playlistId": playlist_id,
            "maxResults": 50,
        }
        if page_token:
            params["pageToken"] = page_token
        response = execute(youtube.playlistItems().list(**params))
        for item in response.get("items", []):
            video_id = (
                item.get("contentDetails", {}).get("videoId")
                or item.get("snippet", {}).get("resourceId", {}).get("videoId")
            )
            if video_id:
                video_ids.append(video_id)
        page_token = response.get("nextPageToken")
        if not page_token:
            return video_ids


def video_record(
    item: dict[str, Any], channel: dict[str, Any], category: str
) -> dict[str, Any]:
    snippet = item.get("snippet", {})
    statistics = item.get("statistics", {})
    thumbnails = snippet.get("thumbnails", {})
    thumbnail = next(
        (
            thumbnails[size]["url"]
            for size in ("maxres", "standard", "high", "medium", "default")
            if size in thumbnails and thumbnails[size].get("url")
        ),
        "",
    )
    return {
        "id": item["id"],
        "title": snippet.get("title", ""),
        "description": snippet.get("description", ""),
        "channel": channel.get("name", snippet.get("channelTitle", "")),
        "channelId": channel.get("id", snippet.get("channelId", "")),
        "category": category,
        "thumbnail": thumbnail,
        "duration": item.get("contentDetails", {}).get("duration", ""),
        "views": int(statistics.get("viewCount", 0)),
        "publishedAt": snippet.get("publishedAt", ""),
        "privacyStatus": item.get("status", {}).get("privacyStatus", ""),
        "uploadStatus": item.get("status", {}).get("uploadStatus", ""),
    }


def fetch() -> int:
    load_dotenv(ROOT / ".env")
    api_key = os.getenv("YOUTUBE_API_KEY", "").strip()
    if not api_key or api_key == "your_youtube_data_api_key_here":
        raise RuntimeError(
            ".env dosyasina gecerli YOUTUBE_API_KEY degerini ekleyin "
            "(.env.example dosyasini kopyalayabilirsiniz)."
        )

    channels = load_channels()
    if not channels:
        raise RuntimeError(
            "channels.json bos. En az bir kanal handle'i veya channelId'si "
            "ve category degeri ekleyin."
        )

    cached_videos, _ = load_cache()
    channel_cache: dict[str, dict[str, Any]] = {}
    youtube = build("youtube", "v3", developerKey=api_key, cache_discovery=False)

    try:
        for configured_channel in channels:
            details = channel_details(youtube, configured_channel)
            if not details:
                continue
            channel_cache[details["id"]] = details
            category = configured_channel["category"]
            playlist_id = details.get("uploadsPlaylistId")
            if not playlist_id:
                print(f"Uyari: {details['name']} icin uploads listesi bulunamadi.")
                continue

            video_ids = playlist_video_ids(youtube, playlist_id)
            missing_ids = list(dict.fromkeys(
                video_id for video_id in video_ids if video_id not in cached_videos
            ))
            for start in range(0, len(missing_ids), 50):
                batch_ids = missing_ids[start : start + 50]
                response = execute(
                    youtube.videos().list(
                        part="snippet,contentDetails,statistics,status",
                        id=",".join(batch_ids),
                        maxResults=50,
                    )
                )
                for item in response.get("items", []):
                    cached_videos[item["id"]] = video_record(item, details, category)
            for video_id in video_ids:
                cached = cached_videos.get(video_id)
                if cached:
                    cached["category"] = category
                    cached["channel"] = details["name"]
                    cached["channelId"] = details["id"]
    except QuotaExceededError:
        save_cache(cached_videos, list(channel_cache.values()))
        print(
            "YouTube gunluk API kotasi (quotaExceeded) doldu. "
            f"O ana kadar alinan veriler kaydedildi: {OUTPUT_FILE}",
            file=sys.stderr,
        )
        return 2
    except Exception:
        save_cache(cached_videos, list(channel_cache.values()))
        raise

    save_cache(cached_videos, list(channel_cache.values()))
    print(
        f"Tamamlandi: {len(cached_videos)} video kaydedildi: {OUTPUT_FILE}"
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(fetch())
    except (RuntimeError, HttpError) as error:
        print(f"Hata: {error}", file=sys.stderr)
        raise SystemExit(1) from error
