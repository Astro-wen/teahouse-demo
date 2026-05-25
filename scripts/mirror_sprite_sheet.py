#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sprite sheet 镜像工具（horizontal flip）
==========================================================================

目的
----
项目里 avatar-03-sit-right.png 是另一种"大头 Q 版"画风，与同角色其它 sheet
（sit-left / stand 都是"小头正常比例"画风）不一致，看起来像两个不同的人。

按"画风以 sit-left 为真值，sit-right 改用 sit-left 水平镜像"的思路，本脚本：
  1. 读源 sheet（如 avatar-03-sit-left.png）
  2. 按帧切片（meta.json 指定 frameCount）
  3. 每帧单独水平镜像（避免整张镜像导致帧顺序反转，动画播放方向出错）
  4. 拼回新 sheet 写到目标路径
  5. 如目标已存在则备份为 *.original.png，便于回滚

为什么要"逐帧镜像"而非"整张镜像"？
  原始 sheet 第 0/1/2 帧从左到右排列。整张水平翻转后帧顺序变成 2/1/0，
  CSS steps() 仍按 0→1→2 播放 → 视觉上动画"倒放"。逐帧镜像能保留帧次序。

用法
----
单文件镜像：
    python scripts/mirror_sprite_sheet.py \
        public/assets/teahouse-room/avatars/avatar-03-sit-left.png \
        --frames 3 \
        --out public/assets/teahouse-room/avatars/avatar-03-sit-right.png

修复 avatar-03 大头版（推荐方式）：
    python scripts/mirror_sprite_sheet.py --fix-avatar-03

依赖：仅 Pillow
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    sys.stderr.write('[err] 缺少 Pillow，请安装：pip install pillow\n')
    sys.exit(1)


def mirror_sheet(src: Path, dst: Path, frame_count: int, backup: bool = True) -> dict:
    """
    把 src 的每一帧水平镜像，输出到 dst。
    若 dst 已存在则写一份 dst.original.png 备份。
    """
    if not src.exists():
        raise FileNotFoundError(f'源文件不存在：{src}')

    sheet = Image.open(src).convert('RGBA')
    w, h = sheet.size
    if w % frame_count != 0:
        sys.stderr.write(
            f'[warn] 表宽 {w} 不能被帧数 {frame_count} 整除，按整除值切割。\n'
        )
    fw = w // frame_count

    if backup and dst.exists():
        backup_path = dst.with_name(dst.stem + '.original' + dst.suffix)
        if not backup_path.exists():
            Image.open(dst).save(backup_path, 'PNG')
        else:
            # 备份已存在不重复覆盖
            backup_path = None
    else:
        backup_path = None

    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    for i in range(frame_count):
        frame = sheet.crop((i * fw, 0, (i + 1) * fw, h))
        flipped = frame.transpose(Image.FLIP_LEFT_RIGHT)
        out.paste(flipped, (i * fw, 0), flipped)

    dst.parent.mkdir(parents=True, exist_ok=True)
    out.save(dst, 'PNG')

    return {
        'src': str(src),
        'dst': str(dst),
        'backup': str(backup_path) if backup_path else None,
        'size': [w, h],
        'frame_size': [fw, h],
        'frame_count': frame_count,
    }


def cmd_one(args: argparse.Namespace) -> None:
    info = mirror_sheet(
        Path(args.src).resolve(),
        Path(args.out).resolve(),
        frame_count=args.frames,
        backup=not args.no_backup,
    )
    print('[ok] 镜像完成：')
    for k, v in info.items():
        print(f'  {k}: {v}')


def cmd_fix_avatar_03() -> None:
    """
    修复 avatar-03 的"大头版" sit-right：用 sit-left（小头版）镜像覆盖。
    备份原 sit-right 为 avatar-03-sit-right.original.png。
    """
    base = Path('public/assets/teahouse-room/avatars').resolve()
    src = base / 'avatar-03-sit-left.png'
    dst = base / 'avatar-03-sit-right.png'
    if not src.exists():
        sys.stderr.write(f'[err] 找不到 {src}\n')
        sys.exit(2)
    info = mirror_sheet(src, dst, frame_count=3, backup=True)
    print('[ok] 已用 avatar-03-sit-left 镜像替换 avatar-03-sit-right')
    for k, v in info.items():
        print(f'  {k}: {v}')


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument('src', nargs='?', help='源 sprite sheet PNG（单文件镜像模式）')
    p.add_argument('--out', help='输出 PNG 路径（单文件模式必填）')
    p.add_argument('--frames', type=int, default=3, help='帧数（默认 3）')
    p.add_argument('--no-backup', action='store_true', help='不备份目标文件')
    p.add_argument(
        '--fix-avatar-03',
        action='store_true',
        help='一键修复：用 avatar-03-sit-left 镜像替换 avatar-03-sit-right',
    )
    return p


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    if args.fix_avatar_03:
        cmd_fix_avatar_03()
        return
    if not args.src or not args.out:
        parser.error('请指定 src 和 --out，或使用 --fix-avatar-03')
    cmd_one(args)


if __name__ == '__main__':
    main()
