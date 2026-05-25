/**
 * 像素茶水间 v2 - 房间随机布场算法（已 deprecated）
 * --------------------------------------------------
 * @deprecated v2.1 起改用 `scene-generator.ts` + `zones.json`。
 *   旧的离散点位法（SPAWNABLE_SEATS + STAND_SPOTS）会导致 NPC "浮空 / 陷进家具"，
 *   现已被几何区域采样取代。本文件保留作为 fallback 与历史参考，主流程不再调用。
 *
 * 旧规则（仅供参考）：
 *   - 在可放人座位（SPAWNABLE_SEATS）+ 站立点（STAND_SPOTS）池子里抽样
 *   - 吧台座位永远不放人
 *   - "我"也参与同一池子的抽样，占用一个位置
 *   - NPC 数量在 NPC_COUNT_RANGE 内随机
 *   - 总占用数不超过池子大小
 */

import {
  SPAWNABLE_SEATS,
  STAND_SPOTS,
  AVAILABLE_AVATARS,
  NAME_POOL,
  NPC_COUNT_RANGE,
  type AvatarId,
  type Seat,
  type StandSpot,
} from './seats.config';

/** 一个被占用的位置（座位或站立点） */
export type SpotKind = 'seat' | 'stand';

export interface OccupantBase {
  id: string;
  avatarId: AvatarId;
  name: string;
  /** 被占据的位置类型 */
  spotKind: SpotKind;
  /** 渲染坐标 + 朝向（已解算） */
  x: number;
  y: number;
  /** 站立或坐着 */
  pose: 'stand' | 'sit-left' | 'sit-right';
  /** 站立时是否镜像（face left） */
  mirror: boolean;
  /** 引用的位置 id（座位 id 或 站立点 id） */
  spotId: string;
}

/** 在区间 [min, max] 内取整数 */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Fisher–Yates 洗牌（不改原数组） */
function shuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 从座位生成 occupant 数据 */
function fromSeat(seat: Seat, avatarId: AvatarId, name: string, idPrefix: string): OccupantBase {
  const pose: OccupantBase['pose'] = seat.facing === 'right' ? 'sit-right' : 'sit-left';
  return {
    id: `${idPrefix}-${seat.id}`,
    avatarId,
    name,
    spotKind: 'seat',
    spotId: seat.id,
    x: seat.x,
    y: seat.y,
    pose,
    mirror: false,
  };
}

/** 从站立点生成 occupant 数据 */
function fromStand(spot: StandSpot, avatarId: AvatarId, name: string, idPrefix: string): OccupantBase {
  // 站立 sprite 默认朝右；facing left → 镜像；front 不镜像
  const mirror = spot.facing === 'left';
  return {
    id: `${idPrefix}-${spot.id}`,
    avatarId,
    name,
    spotKind: 'stand',
    spotId: spot.id,
    x: spot.x,
    y: spot.y,
    pose: 'stand',
    mirror,
  };
}

/** 从昵称池随机抽 N 个不重复的名字 */
function pickNames(count: number): string[] {
  return shuffle(NAME_POOL).slice(0, count);
}

/** 随机选一个 avatar id */
function pickAvatar(): AvatarId {
  return AVAILABLE_AVATARS[Math.floor(Math.random() * AVAILABLE_AVATARS.length)];
}

export interface RoomLayout {
  me: OccupantBase;
  npcs: OccupantBase[];
}

/**
 * 生成一组随机房间布局：
 * 1. 把所有可用位置（座位 + 站立点）洗牌
 * 2. 第 1 个分给"我"
 * 3. 随机数量的 NPC 占据后续位置
 * 4. NPC 头像不强制和"我"不同（毕竟池子小）
 */
export function generateRoomLayout(myAvatarId: AvatarId): RoomLayout {
  // 池子：可坐座位 + 站立点
  const seatPool = SPAWNABLE_SEATS.map(s => ({ kind: 'seat' as const, ref: s }));
  const standPool = STAND_SPOTS.map(s => ({ kind: 'stand' as const, ref: s }));
  const allSpots = shuffle([...seatPool, ...standPool]);

  // 决定 NPC 数量
  const npcCount = randInt(NPC_COUNT_RANGE[0], NPC_COUNT_RANGE[1]);
  // 总共需要的位置 = npcCount + 1（我）
  const needCount = Math.min(npcCount + 1, allSpots.length);

  const picked = allSpots.slice(0, needCount);
  const names = pickNames(needCount);

  // 第一个分配给"我"
  const meSpot = picked[0];
  const me = meSpot.kind === 'seat'
    ? fromSeat(meSpot.ref, myAvatarId, '我', 'me')
    : fromStand(meSpot.ref, myAvatarId, '我', 'me');

  // 其余分配给 NPC
  const npcs: OccupantBase[] = [];
  for (let i = 1; i < picked.length; i++) {
    const cell = picked[i];
    const avatarId = pickAvatar();
    const name = names[i];
    const occ = cell.kind === 'seat'
      ? fromSeat(cell.ref, avatarId, name, 'npc')
      : fromStand(cell.ref, avatarId, name, 'npc');
    npcs.push(occ);
  }

  return { me, npcs };
}
