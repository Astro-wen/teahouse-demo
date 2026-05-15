/**
 * 单个像素小人组件
 * --------------------------------------------------
 * 接收 (avatarId, pose, x, y)：
 *   - 根据 (avatarId, pose) 选择对应 sprite sheet
 *   - 用 CSS background-position + animation: steps() 实现序列帧动画
 *   - x/y 是「脚底中心点」基于 1280×720 逻辑画布
 *   - 由父容器统一 transform: scale，本组件只输出逻辑坐标
 *
 * sprite sheet 元数据见 public/assets/teahouse-room/meta.json
 */

import type { AvatarId, Facing } from './seats.config';

export type Pose = 'stand' | 'sit-left' | 'sit-right';

interface SpriteMeta {
  /** sprite sheet 总宽 */
  sheetWidth: number;
  /** 单帧宽 */
  frameWidth: number;
  /** 单帧高 */
  frameHeight: number;
  /** 总帧数 */
  frameCount: number;
  /** 单次循环时长（ms） */
  duration: number;
}

/** sprite 元数据（与脚本 meta.json 保持同步；写死避免运行时 fetch） */
const SPRITE_META: Record<string, SpriteMeta> = {
  'avatar-01-stand':     { sheetWidth: 172, frameWidth: 43, frameHeight: 140, frameCount: 4, duration: 800 },
  'avatar-01-sit-left':  { sheetWidth: 171, frameWidth: 57, frameHeight: 120, frameCount: 3, duration: 750 },
  'avatar-01-sit-right': { sheetWidth: 153, frameWidth: 51, frameHeight: 120, frameCount: 3, duration: 750 },
  'avatar-03-stand':     { sheetWidth: 372, frameWidth: 93, frameHeight: 140, frameCount: 4, duration: 800 },
  'avatar-03-sit-left':  { sheetWidth: 267, frameWidth: 89, frameHeight: 120, frameCount: 3, duration: 750 },
  'avatar-03-sit-right': { sheetWidth: 195, frameWidth: 65, frameHeight: 120, frameCount: 3, duration: 750 },
};

const ASSET_BASE = '/assets/teahouse-room';

/** 根据 facing 选择坐姿方向；front 退化为 left */
export function poseFromFacing(facing: Facing): Pose {
  if (facing === 'right') return 'sit-right';
  return 'sit-left';
}

interface PixelAvatarProps {
  avatarId: AvatarId;
  pose: Pose;
  /** 脚底中心 X（1280 画布逻辑坐标） */
  x: number;
  /** 脚底中心 Y（720 画布逻辑坐标） */
  y: number;
  /** 头顶昵称（可选） */
  name?: string;
  /** 是否是当前用户（高亮） */
  isMe?: boolean;
  /** 自定义 z-index（默认按 y 排序） */
  zIndex?: number;
  /** 关闭序列帧动画（reduced motion） */
  reduceMotion?: boolean;
}

export default function PixelAvatar({
  avatarId,
  pose,
  x,
  y,
  name,
  isMe = false,
  zIndex,
  reduceMotion = false,
}: PixelAvatarProps) {
  const spriteKey = `avatar-${avatarId}-${pose}`;
  const meta = SPRITE_META[spriteKey];

  if (!meta) {
    // 防御：未注册的 sprite，渲染空 div
    return null;
  }

  const { sheetWidth, frameWidth, frameHeight, frameCount, duration } = meta;
  const spriteUrl = `${ASSET_BASE}/${spriteKey}.png`;

  // 动画名按 sprite key 隔离，避免相同帧数的动画互相干扰
  const animName = `ptr-anim-${spriteKey}`;

  // 内联 keyframes，避免在全局 css 里重复声明
  const keyframes = `
    @keyframes ${animName} {
      from { background-position: 0 0; }
      to   { background-position: -${sheetWidth}px 0; }
    }
  `;

  return (
    <>
      <style>{keyframes}</style>
      <div
        className={`ptr-avatar${isMe ? ' ptr-avatar--me' : ''}`}
        style={{
          // 脚底中心 → 转换为 div 左上角：水平居中，垂直底部对齐
          left: `${x - frameWidth / 2}px`,
          top: `${y - frameHeight}px`,
          width: `${frameWidth}px`,
          height: `${frameHeight}px`,
          backgroundImage: `url(${spriteUrl})`,
          backgroundSize: `${sheetWidth}px ${frameHeight}px`,
          backgroundRepeat: 'no-repeat',
          imageRendering: 'pixelated',
          animation: reduceMotion
            ? 'none'
            : `${animName} ${duration}ms steps(${frameCount}) infinite`,
          zIndex: zIndex ?? Math.round(y),
        }}
      >
        {name && (
          <span className="ptr-avatar__name">
            {isMe && <span className="ptr-avatar__dot" />}
            {name}
          </span>
        )}
      </div>
    </>
  );
}
