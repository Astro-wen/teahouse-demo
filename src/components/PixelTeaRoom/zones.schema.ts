/**
 * 区域（zone）系统的 TypeScript 类型定义与轻量校验
 * --------------------------------------------------
 * 把"NPC 可落位的几何信息"从离散点位升级为面：
 *   - SeatZone   坐席矩形：沙发段 / 单人皮椅；落点 = 矩形底边中点
 *   - StandZone  站立多边形：地毯、走廊、空地；多边形内部均匀采样
 *   - BlockZone  禁入多边形：茶几、吧台、墙、门洞、家具内部
 *
 * 单一文件 zones.json 由人工或 ZoneAnnotator 生成，运行时 fetch 加载。
 * 三段视频共用同一份（房间几何不随光照变）。
 */

export type Facing = 'left' | 'right';
export type ZoneType = 'seat' | 'stand' | 'block';

/** 矩形：[x, y, w, h]，左上角为原点 */
export type Rect = [number, number, number, number];

/** 多边形顶点列表 */
export type Polygon = [number, number][];

export interface SeatZone {
  id: string;
  type: 'seat';
  /** 矩形：脚锚点取该矩形底边中点 */
  rect: Rect;
  /** 坐姿朝向：决定使用 sit-left / sit-right sprite */
  facing: Facing;
  /** 屁股压在矩形底边的微调像素（默认 0） */
  seatOffsetY?: number;
  label?: string;
}

export interface StandZone {
  id: string;
  type: 'stand';
  polygon: Polygon;
  /** 站立朝向：决定 sprite 是否 mirror（站立 sprite 默认朝右） */
  facing?: Facing;
  /** 期望站姿：默认 idle（仅显示第 0 帧），walk 跑 steps 动画 */
  motion?: 'idle' | 'walk';
  label?: string;
}

export interface BlockZone {
  id: string;
  type: 'block';
  polygon: Polygon;
  label?: string;
}

export type Zone = SeatZone | StandZone | BlockZone;

export interface ZonesDoc {
  /** 必须与背景视频/海报 1280×720 一致 */
  viewport: { w: number; h: number };
  zones: Zone[];
}

// ============================================================
// 校验 / 提取工具
// ============================================================

export function isSeatZone(z: Zone): z is SeatZone { return z.type === 'seat'; }
export function isStandZone(z: Zone): z is StandZone { return z.type === 'stand'; }
export function isBlockZone(z: Zone): z is BlockZone { return z.type === 'block'; }

/** 简单结构校验，失败抛错，便于 useZones fallback */
export function validateZonesDoc(raw: unknown): ZonesDoc {
  if (!raw || typeof raw !== 'object') throw new Error('zones.json 不是对象');
  const doc = raw as Partial<ZonesDoc>;
  if (!doc.viewport || typeof doc.viewport.w !== 'number' || typeof doc.viewport.h !== 'number') {
    throw new Error('zones.json 缺少 viewport.{w,h}');
  }
  if (!Array.isArray(doc.zones)) throw new Error('zones.json.zones 不是数组');
  for (const z of doc.zones) {
    if (!z || typeof z !== 'object') throw new Error('存在非对象的 zone');
    const t = (z as Zone).type;
    if (t === 'seat') {
      const r = (z as SeatZone).rect;
      if (!Array.isArray(r) || r.length !== 4 || r.some(n => typeof n !== 'number')) {
        throw new Error(`seat ${(z as SeatZone).id} 的 rect 非法`);
      }
    } else if (t === 'stand' || t === 'block') {
      const p = (z as StandZone | BlockZone).polygon;
      if (!Array.isArray(p) || p.length < 3) {
        throw new Error(`${t} ${(z as Zone).id} 的 polygon 至少 3 个点`);
      }
    } else {
      throw new Error(`未知 zone.type: ${String(t)}`);
    }
  }
  return doc as ZonesDoc;
}

/** 矩形底边中点（脚锚点） */
export function seatAnchor(seat: SeatZone): { x: number; y: number } {
  const [x, y, w, h] = seat.rect;
  const offsetY = seat.seatOffsetY ?? 0;
  return { x: x + w / 2, y: y + h + offsetY };
}
