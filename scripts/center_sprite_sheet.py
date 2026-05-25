#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
逐帧锚点居中（用于解决像素 sprite 在动画中"前后乱晃 / 上下跳"的问题）
==========================================================================

背景
----
我们的 NPC sprite sheet 由若干等宽帧水平拼接（如 avatar-03-stand：372×140，4 帧 93×140）。
肉眼看到的"晃动"通常并不是动画本身的问题，而是 **每一帧人物在自身帧内的像素列不一致**：
- 第 0 帧人物中心可能在 x=46
- 第 1 帧人物中心漂到 x=42
- 第 2 帧又跳回 x=48 ……

CSS `steps()` 切帧时，渲染容器原地不动，于是观感就是"人物左右一抖一抖、前后晃"。

本脚本的修法是：
1. 把 sheet 切成 N 帧
2. 对每帧通过 alpha 通道找到"最紧凑包围盒"
3. 计算该帧的"脚底中心点" = (bbox 横向中点, bbox 底部)
4. 以"目标脚底锚点 = (单帧宽度/2, 单帧高度)"为基准，将每帧整体平移
5. 拼回新 sheet（同尺寸，背景透明），写出 *-centered.png

效果：每帧脚底锚点严格对齐，CSS `steps()` 播放时不再左右乱跳。

用法
----
单文件：
    python scripts/center_sprite_sheet.py \
        public/assets/teahouse-room/avatars/avatar-03-stand.png \
        --frames 4 \
        --out public/assets/teahouse-room/avatars/avatar-03-stand-centered.png

按 meta.json 批量（推荐）：
    python scripts/center_sprite_sheet.py --all \
        --meta public/assets/teahouse-room/meta.json \
        --avatars-dir public/assets/teahouse-room/avatars \
        --suffix -centered

依赖：仅 Pillow
    pip install pillow
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Iterable, Tuple

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    sys.stderr.write(
        "[err] 缺少 Pillow 依赖，请先安装：pip install pillow\n"
    )
    sys.exit(1)


def find_alpha_bbox(frame: Image.Image, alpha_threshold: int = 8) -> Tuple[int, int, int, int] | None:
    """
    返回非透明像素的最紧凑 bbox (left, top, right, bottom)。
    若整帧都是透明，返回 None。
    """
    if frame.mode != 'RGBA':
        frame = frame.convert('RGBA')
    alpha = frame.split()[-1]
    # 用阈值过滤掉极淡的反锯齿尾巴，避免 bbox 被半透明像素拉大
    mask = alpha.point(lambda v: 255 if v >= alpha_threshold else 0)
    return mask.getbbox()


def center_one_frame(
    frame: Image.Image,
    target_anchor: Tuple[int, int],
    alpha_threshold: int = 8,
) -> Image.Image:
    """
    将单帧的"脚底中心点"对齐到 target_anchor。
    脚底中心点 = (bbox.cx, bbox.bottom)
    """
    bbox = find_alpha_bbox(frame, alpha_threshold)
    if bbox is None:
        # 整帧透明，原样返回（避免除以 0）
        return frame.copy()

    left, top, right, bottom = bbox
    src_cx = (left + right) / 2.0
    src_bottom = bottom

    target_cx, target_bottom = target_anchor
    dx = round(target_cx - src_cx)
    dy = round(target_bottom - src_bottom)

    if dx == 0 and dy == 0:
        return frame.copy()

    canvas = Image.new('RGBA', frame.size, (0, 0, 0, 0))
    canvas.paste(frame, (dx, dy), frame if frame.mode == 'RGBA' else None)
    return canvas


def split_sheet(sheet: Image.Image, frame_count: int) -> list[Image.Image]:
    """水平切片：等宽 N 帧。"""
    w, h = sheet.size
    if w % frame_count != 0:
        sys.stderr.write(
            f"[warn] 表宽 {w} 不能被帧数 {frame_count} 整除，向下取整切割。\n"
        )
    fw = w // frame_count
    frames: list[Image.Image] = []
    for i in range(frame_count):
        box = (i * fw, 0, (i + 1) * fw, h)
        frames.append(sheet.crop(box).convert('RGBA'))
    return frames


def assemble_sheet(frames: Iterable[Image.Image]) -> Image.Image:
    frames = list(frames)
    if not frames:
        raise ValueError('frames is empty')
    fw, fh = frames[0].size
    out = Image.new('RGBA', (fw * len(frames), fh), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        out.paste(f, (i * fw, 0), f)
    return out


def process(
    src: Path,
    dst: Path,
    frame_count: int,
    alpha_threshold: int = 8,
    anchor_y: str = 'bottom',
) -> dict:
    """
    主流程：读 sheet → 切帧 → 各帧居中 → 拼回 → 写出。

    anchor_y:
      - 'bottom' (默认)：脚底锚点 = (帧宽/2, 帧高)
        适合站立 sprite（身体下端就是脚）
      - 'frame-bottom-of-bbox-mean'：脚底锚点 = (帧宽/2, 平均 bbox 底)
        适合坐姿 sprite（屁股位置不一定贴帧底）

    返回每帧调整记录的 dict，便于审计。
    """
    sheet = Image.open(src).convert('RGBA')
    frames = split_sheet(sheet, frame_count)
    fw, fh = frames[0].size

    # 决定目标锚点
    if anchor_y == 'bottom':
        target_anchor = (fw // 2, fh)
    elif anchor_y == 'frame-bottom-of-bbox-mean':
        bottoms: list[int] = []
        for f in frames:
            bb = find_alpha_bbox(f, alpha_threshold)
            if bb is not None:
                bottoms.append(bb[3])
        mean_bottom = int(round(sum(bottoms) / max(1, len(bottoms))))
        target_anchor = (fw // 2, mean_bottom)
    else:
        raise ValueError(f'unknown anchor_y: {anchor_y}')

    report: list[dict] = []
    centered: list[Image.Image] = []
    for i, f in enumerate(frames):
        bb = find_alpha_bbox(f, alpha_threshold)
        before_cx = ((bb[0] + bb[2]) / 2.0) if bb else None
        before_bottom = bb[3] if bb else None
        cf = center_one_frame(f, target_anchor, alpha_threshold)
        bb2 = find_alpha_bbox(cf, alpha_threshold)
        after_cx = ((bb2[0] + bb2[2]) / 2.0) if bb2 else None
        after_bottom = bb2[3] if bb2 else None
        report.append(
            {
                'frame': i,
                'before_cx': before_cx,
                'before_bottom': before_bottom,
                'after_cx': after_cx,
                'after_bottom': after_bottom,
            }
        )
        centered.append(cf)

    out = assemble_sheet(centered)
    dst.parent.mkdir(parents=True, exist_ok=True)
    out.save(dst, 'PNG')
    return {
        'src': str(src),
        'dst': str(dst),
        'frame_count': frame_count,
        'frame_size': [fw, fh],
        'target_anchor': list(target_anchor),
        'frames': report,
    }


def cmd_single(args: argparse.Namespace) -> None:
    src = Path(args.src).resolve()
    if args.out:
        dst = Path(args.out).resolve()
    else:
        dst = src.with_name(src.stem + '-centered' + src.suffix)
    info = process(
        src,
        dst,
        frame_count=args.frames,
        alpha_threshold=args.alpha,
        anchor_y=args.anchor_y,
    )
    print(json.dumps(info, ensure_ascii=False, indent=2))


def cmd_all(args: argparse.Namespace) -> None:
    meta_path = Path(args.meta).resolve()
    avatars_dir = Path(args.avatars_dir).resolve()
    suffix = args.suffix or '-centered'

    meta = json.loads(meta_path.read_text(encoding='utf-8'))
    sprites = meta.get('sprites', {})
    if not sprites:
        sys.stderr.write('[err] meta.json 中未找到 sprites 段\n')
        sys.exit(2)

    results: list[dict] = []
    for key, info in sprites.items():
        frame_count = int(info['frameCount'])
        src = avatars_dir / f'{key}.png'
        if not src.exists():
            sys.stderr.write(f'[warn] 跳过：{src} 不存在\n')
            continue
        dst = avatars_dir / f'{key}{suffix}.png'
        # 站立用 bottom 锚点；坐姿屁股位置不在帧底，用 bbox 平均底对齐
        anchor_y = 'bottom' if key.endswith('-stand') else 'frame-bottom-of-bbox-mean'
        try:
            r = process(
                src,
                dst,
                frame_count=frame_count,
                alpha_threshold=args.alpha,
                anchor_y=anchor_y,
            )
            results.append(r)
            print(f'[ok]  {key}: anchor={r["target_anchor"]}  → {dst.name}')
        except Exception as e:  # pragma: no cover
            sys.stderr.write(f'[err] {key}: {e}\n')

    summary_path = avatars_dir / f'centered-report{suffix}.json'
    summary_path.write_text(
        json.dumps(results, ensure_ascii=False, indent=2),
        encoding='utf-8',
    )
    print(f'\n报告：{summary_path}')


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('src', nargs='?', help='单文件模式：源 sprite sheet PNG 路径')
    p.add_argument('--out', help='单文件模式：输出 PNG 路径（默认在源文件同目录加 -centered 后缀）')
    p.add_argument('--frames', type=int, default=4, help='单文件模式：帧数（默认 4）')
    p.add_argument('--alpha', type=int, default=8, help='alpha 阈值（默认 8，>=该值视为不透明）')
    p.add_argument(
        '--anchor-y',
        choices=['bottom', 'frame-bottom-of-bbox-mean'],
        default='bottom',
        help='锚点策略：bottom=帧底；frame-bottom-of-bbox-mean=各帧 bbox 平均底（坐姿用）',
    )
    p.add_argument('--all', action='store_true', help='批量模式：根据 meta.json 处理所有 sprite')
    p.add_argument('--meta', default='public/assets/teahouse-room/meta.json')
    p.add_argument('--avatars-dir', default='public/assets/teahouse-room/avatars')
    p.add_argument('--suffix', default='-centered', help='输出文件后缀（默认 -centered）')
    return p


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    if args.all:
        cmd_all(args)
    else:
        if not args.src:
            parser.error('单文件模式需要传入 src（或使用 --all 批量模式）')
        cmd_single(args)


if __name__ == '__main__':
    main()
