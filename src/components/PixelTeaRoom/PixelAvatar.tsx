/**
 * 单个像素小人组件 - v2.2（统一 sprite sheet 模式）
 * --------------------------------------------------
 * 接收 (avatarId, pose, x, y, motion, mirror?)：
 *   - 根据 (avatarId, pose) 选择对应 sprite sheet
 *   - x/y 是「脚底中心点」基于 1280×720 逻辑画布
 *     · 站立：脚底中心
 *     · 坐姿：屁股压在座面前缘
 *   - motion='idle' 时停掉 steps 动画，仅展示第 0 帧
 *   - motion='walk' 时跑原有 steps(N) 序列帧
 *   - 站立时 mirror 控制 face left/right
 */

import type { AvatarId, Facing } from './seats.config';

export type Pose = 'stand' | 'sit-left' | 'sit-right';
export type Motion = 'idle' | 'walk';

interface SpriteMeta {
  sheetWidth: number;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  duration: number;
}

const SPRITE_META: Record<string, SpriteMeta> = {
  'avatar-01-stand':     { sheetWidth: 172, frameWidth: 43, frameHeight: 140, frameCount: 4, duration: 800 },
  'avatar-01-sit-left':  { sheetWidth: 171, frameWidth: 57, frameHeight: 120, frameCount: 3, duration: 750 },
  'avatar-01-sit-right': { sheetWidth: 153, frameWidth: 51, frameHeight: 120, frameCount: 3, duration: 750 },
  // 由 6 张 360×740 立绘紧凑裁剪 + 等比缩放到 140 高 + 自适应帧宽 61 拼接
  'avatar-03-stand':     { sheetWidth: 366, frameWidth: 61, frameHeight: 140, frameCount: 6, duration: 1200 },
  // avatar-03 坐姿统一只保留 sit-right 一套素材，sit-left 通过运行时镜像得到
  // （之前 sit-left 是另一套画风/有残缺帧，删除以保证视觉一致）
  'avatar-03-sit-right': { sheetWidth: 130, frameWidth: 65, frameHeight: 120, frameCount: 2, duration: 900 },
  // astrowen：红外套 + 工牌 + 咖啡杯/手机，特殊 NPC，仅站姿、单场景最多出现一次
  'avatar-astrowen-stand': { sheetWidth: 660, frameWidth: 66, frameHeight: 140, frameCount: 10, duration: 1800 },
};

/**
 * 从 (avatarId, pose) 解析出 (sheetKey, mirrorOverride):
 *   - avatar-03-sit-left → 用 avatar-03-sit-right.png + 强制镜像
 *   - 其他 → 直接用对应 sheet
 * mirrorOverride 不为 null 时覆盖外层传入的 mirror。
 */
function resolveSprite(
  avatarId: AvatarId,
  pose: Pose,
): { sheetKey: string; mirrorOverride: boolean | null } {
  if (avatarId === '03' && pose === 'sit-left') {
    return { sheetKey: 'avatar-03-sit-right', mirrorOverride: true };
  }
  return { sheetKey: `avatar-${avatarId}-${pose}`, mirrorOverride: null };
}

const ASSET_BASE = `${import.meta.env.BASE_URL}assets/teahouse-room/avatars`;

export function poseFromFacing(facing: Facing): Pose {
  if (facing === 'right') return 'sit-right';
  return 'sit-left';
}

interface PixelAvatarProps {
  avatarId: AvatarId;
  pose: Pose;
  x: number;
  y: number;
  name?: string;
  isMe?: boolean;
  zIndex?: number;
  reduceMotion?: boolean;
  mirror?: boolean;
  motion?: Motion;
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
  mirror = false,
  motion = 'walk',
}: PixelAvatarProps) {
  const { sheetKey, mirrorOverride } = resolveSprite(avatarId, pose);
  const meta = SPRITE_META[sheetKey];
  if (!meta) return null;

  const { sheetWidth, frameWidth, frameHeight, frameCount, duration } = meta;
  const spriteUrl = `${ASSET_BASE}/${sheetKey}.png`;
  const animName = `ptr-anim-${sheetKey}`;
  const isStatic = reduceMotion || motion === 'idle';
  const finalMirror = mirrorOverride !== null ? mirrorOverride : mirror;

  const keyframes = isStatic
    ? ''
    : `
      @keyframes ${animName} {
        from { background-position: 0 0; }
        to   { background-position: -${sheetWidth}px 0; }
      }
    `;

  return (
    <>
      {keyframes && <style>{keyframes}</style>}
      <div
        className={`ptr-avatar${isMe ? ' ptr-avatar--me' : ''}`}
        style={{
          left: `${x - frameWidth / 2}px`,
          top: `${y - frameHeight}px`,
          width: `${frameWidth}px`,
          height: `${frameHeight}px`,
          zIndex: zIndex ?? Math.round(y),
        }}
      >
        <div
          className="ptr-avatar__sprite"
          style={{
            width: `${frameWidth}px`,
            height: `${frameHeight}px`,
            backgroundImage: `url(${spriteUrl})`,
            backgroundSize: `${sheetWidth}px ${frameHeight}px`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: '0 0',
            imageRendering: 'pixelated',
            animation: isStatic
              ? 'none'
              : `${animName} ${duration}ms steps(${frameCount}) infinite`,
            transform: finalMirror ? 'scaleX(-1)' : undefined,
          }}
        />
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
