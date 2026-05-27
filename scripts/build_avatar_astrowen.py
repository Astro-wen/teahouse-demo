#!/usr/bin/env python3
"""
build_avatar_astrowen.py
将 ~/Downloads 下 10 张 astrowen 站姿立绘：
  - 抠掉棋盘格 / 白灰背景为透明
  - 紧凑裁剪
  - 等比缩放到高度 140
  - 横向拼接为站姿 sprite sheet
  - 输出 public/assets/teahouse-room/avatars/avatar-astrowen-stand.png
  - 原图归档到 docs/raw-avatars/avatar-astrowen-source-XX.png
"""
import re
import sys
from collections import deque
from pathlib import Path
from PIL import Image

DOWNLOADS = Path.home() / "Downloads"
PROJECT = Path(__file__).resolve().parent.parent
AVATAR_DIR = PROJECT / "public" / "assets" / "teahouse-room" / "avatars"
RAW_DIR = PROJECT / "docs" / "raw-avatars"
RAW_DIR.mkdir(parents=True, exist_ok=True)

SOURCE_GLOB = "ChatGPT Image May 27, 2026, 12_44_*.png"
TARGET_FRAME_HEIGHT = 140
BG_LIGHT_MIN = 222
BG_CHANNEL_TOLERANCE = 12


def source_index(path: Path) -> int:
    m = re.search(r"\((\d+)\)", path.name)
    if not m:
        return 10_000
    return int(m.group(1))


def is_bg_like(r: int, g: int, b: int) -> bool:
    """识别透明棋盘格 / 白灰背景。只作为 flood-fill 条件，避免误删角色内部白色区域。"""
    return (
        min(r, g, b) >= BG_LIGHT_MIN
        and max(abs(r - g), abs(g - b), abs(r - b)) <= BG_CHANNEL_TOLERANCE
    )


def remove_connected_bg(im: Image.Image) -> Image.Image:
    """从画布边缘 flood fill，只移除与边缘连通的白灰/棋盘格背景。"""
    im = im.convert("RGBA")
    w, h = im.size
    pixels = im.load()
    visited = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()

    def idx(x: int, y: int) -> int:
        return y * w + x

    def try_add(x: int, y: int) -> None:
        if x < 0 or x >= w or y < 0 or y >= h:
            return
        i = idx(x, y)
        if visited[i]:
            return
        r, g, b, a = pixels[x, y]
        if a == 0 or is_bg_like(r, g, b):
            visited[i] = 1
            q.append((x, y))

    for x in range(w):
        try_add(x, 0)
        try_add(x, h - 1)
    for y in range(h):
        try_add(0, y)
        try_add(w - 1, y)

    while q:
        x, y = q.popleft()
        r, g, b, _ = pixels[x, y]
        pixels[x, y] = (r, g, b, 0)
        try_add(x + 1, y)
        try_add(x - 1, y)
        try_add(x, y + 1)
        try_add(x, y - 1)

    return im


def trim(im: Image.Image) -> Image.Image:
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def scale_to_height(im: Image.Image, target_h: int) -> Image.Image:
    w, h = im.size
    new_w = max(1, round(w * target_h / h))
    return im.resize((new_w, target_h), Image.LANCZOS)


def main() -> int:
    sources = sorted(DOWNLOADS.glob(SOURCE_GLOB), key=source_index)
    if len(sources) != 10:
        print(f"[ERR] 预期 10 张源图，实际找到 {len(sources)} 张：", file=sys.stderr)
        for p in sources:
            print(f"  - {p}", file=sys.stderr)
        return 1

    frames: list[Image.Image] = []
    for i, src in enumerate(sources, start=1):
        archived = RAW_DIR / f"avatar-astrowen-source-{i:02d}.png"
        if not archived.exists():
            archived.write_bytes(src.read_bytes())
        print(f"[OK] 归档 -> {archived.relative_to(PROJECT)}")

        im = Image.open(src)
        im = remove_connected_bg(im)
        im = trim(im)
        im = scale_to_height(im, TARGET_FRAME_HEIGHT)
        print(f"     {src.name} -> 帧尺寸 {im.size}")
        frames.append(im)

    frame_w = max(f.size[0] for f in frames)
    frame_h = TARGET_FRAME_HEIGHT
    sheet = Image.new("RGBA", (frame_w * len(frames), frame_h), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        x = i * frame_w + (frame_w - frame.size[0]) // 2
        sheet.paste(frame, (x, 0), frame)

    out = AVATAR_DIR / "avatar-astrowen-stand.png"
    sheet.save(out)
    print(f"\n[DONE] 输出 sprite sheet: {out.relative_to(PROJECT)}")
    print(f"       sheetWidth={sheet.size[0]}, frameWidth={frame_w}, frameHeight={frame_h}, frameCount={len(frames)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
