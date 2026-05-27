/**
 * 基于 zones 的场景生成
 * --------------------------------------------------
 * 取代旧的 random-layout：从 zones.json 的几何中抽样得到 NPC + "我"的落位。
 *
 * 输出 SceneSnapshot：每个 instance 自带脚锚点 (anchorX, anchorY) + pose + motion，
 * 渲染层不再做位置/锚点推算。
 */

import {
  AVAILABLE_AVATARS,
  MAX_SAME_AVATAR_PER_SCENE,
  NAME_POOL,
  NPC_COUNT_RANGE,
  PLAYER_AVATARS,
  SIT_RATIO,
  STAND_ONLY_AVATARS,
  UNIQUE_NPC_AVATARS,
  type AvatarId,
} from './seats.config';
import { createSampler } from './zone-sampler';
import {
  seatAnchor,
  type Facing,
  type SeatZone,
  type StandZone,
  type ZonesDoc,
} from './zones.schema';

export type Pose = 'stand' | 'sit-left' | 'sit-right';
export type Motion = 'idle' | 'walk';

export interface AvatarInstance {
  id: string;
  avatarId: AvatarId;
  name: string;
  /** 渲染锚点：脚底中心；坐姿语义为屁股压在座面前缘 */
  anchorX: number;
  anchorY: number;
  pose: Pose;
  motion: Motion;
  /** stand sprite 是否水平翻转（face left） */
  mirror: boolean;
  facing?: Facing;
  isMe?: boolean;
  /** 调试用：来源 zone id */
  zoneId?: string;
}

export interface SceneSnapshot {
  me: AvatarInstance;
  npcs: AvatarInstance[];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickPlayerAvatar(): AvatarId {
  return PLAYER_AVATARS[Math.floor(Math.random() * PLAYER_AVATARS.length)];
}

function fromSeat(
  seat: SeatZone,
  avatarId: AvatarId,
  name: string,
  idPrefix: string,
  isMe = false,
): AvatarInstance {
  const { x, y } = seatAnchor(seat);
  const pose: Pose = seat.facing === 'right' ? 'sit-right' : 'sit-left';
  return {
    id: `${idPrefix}-${seat.id}`,
    avatarId,
    name,
    anchorX: x,
    anchorY: y,
    pose,
    // 坐姿恢复动效：3 帧动画（喝东西/微动作），不存在帧间锚点抖动问题
    motion: 'walk',
    mirror: false,
    facing: seat.facing,
    isMe,
    zoneId: seat.id,
  };
}

function fromStand(
  zone: StandZone,
  point: { x: number; y: number },
  avatarId: AvatarId,
  name: string,
  idPrefix: string,
  isMe = false,
): AvatarInstance {
  const facing: Facing | undefined = zone.facing;
  // 站立 sprite 默认朝右；facing left → mirror
  const mirror = facing === 'left';
  // 站立动效：默认 walk（4 帧呼吸/微动）。
  // zone 自己显式声明的 motion 优先级最高（标注器里可指定 idle，比如吧台前需要"听单子"）
  // 注：avatar-03 stand sheet 帧间锚点稳定后（已用 PIL 居中或镜像），可放心 walk
  const motion: Motion = zone.motion ?? 'walk';
  return {
    id: `${idPrefix}-${zone.id}-${point.x}-${point.y}`,
    avatarId,
    name,
    anchorX: point.x,
    anchorY: point.y,
    pose: 'stand',
    motion,
    mirror,
    facing,
    isMe,
    zoneId: zone.id,
  };
}

/**
 * 主入口：根据 zones 生成一组随机布场。
 *
 * 策略（v2）：
 *   1. NPC 总数 n ∈ NPC_COUNT_RANGE，总位置 = n + 1（含我）
 *   2. 按 SIT_RATIO 比例切分坐 / 站配额，向上取整保留至少 1 个站立（如果有 stand 区）
 *   3. 坐席无放回抽样；站立按面积加权 + 最小间距采样
 *   4. 真实拿到的位置数可能小于配额（比如站立采样达上限），允许更少
 *   5. avatar 抽样限制：同一种 avatar 一个画面最多出现 MAX_SAME_AVATAR_PER_SCENE 次
 *   6. 第 0 个分给"我"，其余为 NPC（昵称从 NAME_POOL 抽）
 */
export function generateSceneFromZones(
  zonesDoc: ZonesDoc,
  myAvatarId: AvatarId,
): SceneSnapshot {
  const sampler = createSampler(zonesDoc);
  const npcCount = randInt(NPC_COUNT_RANGE[0], NPC_COUNT_RANGE[1]);
  const totalNeed = npcCount + 1;

  // 按比例切分坐 / 站配额
  const hasStand = sampler.stands.length > 0;
  const hasSeat = sampler.seats.length > 0;

  let sitTarget = Math.round(totalNeed * SIT_RATIO);
  let standTarget = totalNeed - sitTarget;

  // 边界处理：没有 stand 时全部坐；没有 seat 时全部站
  if (!hasStand) { sitTarget = totalNeed; standTarget = 0; }
  if (!hasSeat)  { sitTarget = 0; standTarget = totalNeed; }
  // 让"如果有站立区就至少 1 个站立"以确保画面层次（除非 NPC 极少）
  if (hasStand && hasSeat && totalNeed >= 3 && standTarget === 0) {
    standTarget = 1;
    sitTarget = totalNeed - 1;
  }

  // 上限不能超过实际可用区域
  sitTarget = Math.min(sitTarget, sampler.seats.length);

  // 1. 抽坐席（无放回）
  const seatsPicked = sampler.sampleSeats(sitTarget);

  // 2. 抽站立点（避开 block + 与坐席最小距离）
  const seatPoints = seatsPicked.map(s => seatAnchor(s));
  const standPicks = standTarget > 0
    ? sampler.sampleStandPoints(standTarget, seatPoints)
    : [];

  // 3. 拼成 slots 并打乱
  const slots: Array<
    | { kind: 'seat'; seat: SeatZone }
    | { kind: 'stand'; zone: StandZone; x: number; y: number }
  > = [
    ...seatsPicked.map(s => ({ kind: 'seat' as const, seat: s })),
    ...standPicks.map(p => ({ kind: 'stand' as const, zone: p.zone, x: p.x, y: p.y })),
  ];
  const slotsShuffled = shuffle(slots);

  // “我”永远只允许使用 PLAYER_AVATARS，避免特殊 NPC（如 astrowen）成为用户形象。
  const safeMyAvatarId = PLAYER_AVATARS.includes(myAvatarId) ? myAvatarId : pickPlayerAvatar();

  if (slotsShuffled.length === 0) {
    return {
      me: {
        id: 'me-fallback',
        avatarId: safeMyAvatarId,
        name: '我',
        anchorX: zonesDoc.viewport.w / 2,
        anchorY: zonesDoc.viewport.h - 80,
        pose: 'stand',
        motion: 'idle',
        mirror: false,
        isMe: true,
      },
      npcs: [],
    };
  }

  // 4. avatar 计数器：约束同一种 avatar 出现次数
  const avatarCount: Record<AvatarId, number> = { '01': 0, '03': 0, 'astrowen': 0 };
  let effectiveMyAvatar: AvatarId = safeMyAvatarId;
  avatarCount[effectiveMyAvatar] = 1;

  function getAvatarLimit(avatarId: AvatarId): number {
    return UNIQUE_NPC_AVATARS.includes(avatarId) ? 1 : MAX_SAME_AVATAR_PER_SCENE;
  }

  function getAvatarPool(forSeat: boolean): AvatarId[] {
    const pool = forSeat
      ? AVAILABLE_AVATARS.filter(a => !STAND_ONLY_AVATARS.includes(a))
      : AVAILABLE_AVATARS.slice();
    return pool.filter(a => (avatarCount[a] ?? 0) < getAvatarLimit(a));
  }

  /**
   * 受约束地抽 avatar：
   *   - 同一种普通 avatar 出现次数不超过 MAX_SAME_AVATAR_PER_SCENE
   *   - UNIQUE_NPC_AVATARS（astrowen）单场景最多出现一次
   *   - 当 slot 是坐席时，跳过 STAND_ONLY_AVATARS（这些没有坐姿 sprite）
   */
  function pickAvatarConstrained(forSeat: boolean): AvatarId {
    let candidates = getAvatarPool(forSeat);
    if (candidates.length === 0) {
      // 兜底：忽略普通 avatar 次数限制，但仍不重复唯一 NPC，坐席仍必须能坐
      candidates = (forSeat
        ? AVAILABLE_AVATARS.filter(a => !STAND_ONLY_AVATARS.includes(a))
        : AVAILABLE_AVATARS.slice()
      ).filter(a => !UNIQUE_NPC_AVATARS.includes(a) || (avatarCount[a] ?? 0) === 0);
    }
    const picked = candidates[Math.floor(Math.random() * candidates.length)];
    avatarCount[picked] = (avatarCount[picked] ?? 0) + 1;
    return picked;
  }

  const names = shuffle(NAME_POOL).slice(0, slotsShuffled.length);

  const meSlot = slotsShuffled[0];
  const me = meSlot.kind === 'seat'
    ? fromSeat(meSlot.seat, effectiveMyAvatar, '我', 'me', true)
    : fromStand(meSlot.zone, { x: meSlot.x, y: meSlot.y }, effectiveMyAvatar, '我', 'me', true);

  const npcs: AvatarInstance[] = [];
  for (let i = 1; i < slotsShuffled.length; i++) {
    const slot = slotsShuffled[i];
    const avatarId = pickAvatarConstrained(slot.kind === 'seat');
    const name = avatarId === 'astrowen' ? 'astrowen' : (names[i] ?? `NPC${i}`);
    const inst = slot.kind === 'seat'
      ? fromSeat(slot.seat, avatarId, name, 'npc')
      : fromStand(slot.zone, { x: slot.x, y: slot.y }, avatarId, name, 'npc');
    npcs.push(inst);
  }

  return { me, npcs };
}
