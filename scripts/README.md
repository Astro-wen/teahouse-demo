# scripts/

辅助脚本目录（不参与 Vite 构建）。

## center_sprite_sheet.py

**目的**：把每个 sprite sheet 的逐帧"脚底锚点"严格对齐到同一像素位置，
解决像素小人（特别是 avatar-03 女）站立动画中肉眼可见的"前后乱晃"。

**原理**：CSS `steps()` 切帧时帧位置原地不动，但 sprite sheet 自己每帧人物中心
位置可能漂移，导致渲染观感像晃动。脚本用 alpha 通道找每帧紧凑 bbox，平移每帧
到 (帧宽/2, 帧高) 这个目标锚点，再拼回新 sheet。

**依赖**：

```bash
pip install pillow
```

**单文件**：

```bash
python scripts/center_sprite_sheet.py \
  public/assets/teahouse-room/avatars/avatar-03-stand.png \
  --frames 4
# 输出：public/assets/teahouse-room/avatars/avatar-03-stand-centered.png
```

**批量（推荐）**：

```bash
python scripts/center_sprite_sheet.py --all
# 输出：avatars/*-centered.png + avatars/centered-report-centered.json
```

**接入运行时**：在 `PixelAvatar.tsx` 把 `${spriteKey}.png` 改成
`${spriteKey}-centered.png` 即可。建议先跑批量，肉眼对比 before/after，
确认没把人物推出帧外再切换文件名。

> 注意：本脚本只在出现明显抖动时使用；常规站立 idle 模式（`motion='idle'`）
> 已能从根本上消除"动画切帧"带来的晃动，多数情况下不需要重生成 sheet。
