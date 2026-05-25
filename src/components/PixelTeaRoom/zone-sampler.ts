/**
 * 区域采样：多边形点采样 / 命中检测 / 泊松盘最小间距
 * --------------------------------------------------
 * 用法：
 *   const sampler = createSampler(zonesDoc);
 *   const stand = sampler.sampleStandPoint(blocks, takenPoints);
 *   const seats = sampler.sampleSeats(n);
 */

import {
  type BlockZone,
  type Polygon,
  type SeatZone,
  type StandZone,
  type ZonesDoc,
  isBlockZone,
  isSeatZone,
  isStandZone,
  seatAnchor,
} from './zones.schema';

/** ray-casting：判断点是否在多边形内部 */
export function pointInPolygon(px: number, py: number, polygon: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    const intersect =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** 多边形最小外接矩形 */
function polygonAABB(polygon: Polygon): { x: number; y: number; w: number; h: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of polygon) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** 是否落在任意 block 多边形内（命中=禁止） */
export function hitsAnyBlock(px: number, py: number, blocks: BlockZone[]): boolean {
  for (const b of blocks) {
    if (pointInPolygon(px, py, b.polygon)) return true;
  }
  return false;
}

/** Fisher-Yates 洗牌（不改原数组） */
function shuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface ZoneSampler {
  seats: SeatZone[];
  stands: StandZone[];
  blocks: BlockZone[];

  /** 抽 N 个不重复的坐席（最多返回 min(N, seats.length)） */
  sampleSeats(n: number): SeatZone[];

  /**
   * 在站立多边形里抽一个点。命中 block 或与 takenPoints 距离 < minDistance 即重抽。
   * 重试上限内未抽中返回 null（外层应 graceful 跳过）。
   */
  sampleStandPoint(
    standZone: StandZone,
    takenPoints: { x: number; y: number }[],
    minDistance?: number,
    maxTry?: number,
  ): { x: number; y: number } | null;

  /**
   * 从所有站立多边形中按面积加权随机抽 N 个不冲突的点。
   * 同一个 stand 区允许产生多个点；之间保持最小间距。
   */
  sampleStandPoints(
    n: number,
    takenPoints: { x: number; y: number }[],
    minDistance?: number,
  ): Array<{ zone: StandZone; x: number; y: number }>;
}

/** 计算多边形面积（绝对值，用于按面积加权选区） */
function polygonArea(polygon: Polygon): number {
  let s = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    s += (polygon[j][0] + polygon[i][0]) * (polygon[j][1] - polygon[i][1]);
  }
  return Math.abs(s / 2);
}

const DEFAULT_MIN_DISTANCE = 56;
const DEFAULT_MAX_TRY = 30;

export function createSampler(doc: ZonesDoc): ZoneSampler {
  const seats: SeatZone[] = doc.zones.filter(isSeatZone);
  const stands: StandZone[] = doc.zones.filter(isStandZone);
  const blocks: BlockZone[] = doc.zones.filter(isBlockZone);

  // 预计算面积权重
  const standAreas = stands.map(s => polygonArea(s.polygon));
  const standAreaTotal = standAreas.reduce((a, b) => a + b, 0);

  function pickStandByArea(): StandZone | null {
    if (stands.length === 0 || standAreaTotal <= 0) return null;
    const r = Math.random() * standAreaTotal;
    let acc = 0;
    for (let i = 0; i < stands.length; i++) {
      acc += standAreas[i];
      if (r < acc) return stands[i];
    }
    return stands[stands.length - 1];
  }

  function sampleStandPoint(
    standZone: StandZone,
    taken: { x: number; y: number }[],
    minDistance: number = DEFAULT_MIN_DISTANCE,
    maxTry: number = DEFAULT_MAX_TRY,
  ) {
    const aabb = polygonAABB(standZone.polygon);
    const minD2 = minDistance * minDistance;
    // sprite 站立时上半身大约在脚锚点之上 ~110px、宽 ~40px，所以采样要给一点缓冲
    // 这里只在水平方向上 inset，y 方向地毯/过道一般够高，不强制 inset
    const insetX = 18;
    for (let i = 0; i < maxTry; i++) {
      const px = aabb.x + Math.random() * aabb.w;
      const py = aabb.y + Math.random() * aabb.h;
      if (!pointInPolygon(px, py, standZone.polygon)) continue;
      // 双重保险：脚锚点 + 左右 inset 三点都不能命中 block，避免 sprite 身体伸进禁入区
      if (hitsAnyBlock(px, py, blocks)) continue;
      if (hitsAnyBlock(px - insetX, py, blocks)) continue;
      if (hitsAnyBlock(px + insetX, py, blocks)) continue;
      let tooClose = false;
      for (const t of taken) {
        const dx = t.x - px;
        const dy = t.y - py;
        if (dx * dx + dy * dy < minD2) { tooClose = true; break; }
      }
      if (tooClose) continue;
      return { x: Math.round(px), y: Math.round(py) };
    }
    return null;
  }

  function sampleStandPoints(
    n: number,
    taken: { x: number; y: number }[],
    minDistance: number = DEFAULT_MIN_DISTANCE,
  ) {
    const result: Array<{ zone: StandZone; x: number; y: number }> = [];
    const local: { x: number; y: number }[] = taken.slice();
    let consecutiveFails = 0;
    while (result.length < n && consecutiveFails < 8) {
      const zone = pickStandByArea();
      if (!zone) break;
      const p = sampleStandPoint(zone, local, minDistance);
      if (!p) { consecutiveFails++; continue; }
      consecutiveFails = 0;
      result.push({ zone, x: p.x, y: p.y });
      local.push(p);
    }
    return result;
  }

  return {
    seats,
    stands,
    blocks,
    sampleSeats(n: number) {
      return shuffle(seats).slice(0, Math.min(n, seats.length));
    },
    sampleStandPoint,
    sampleStandPoints,
  };
}
