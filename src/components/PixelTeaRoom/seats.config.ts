/**
 * 像素茶水间 - 座位与 NPC 配置
 * --------------------------------------------------
 * 所有坐标基于 1280×720 逻辑画布，表示「人物脚底中心点」。
 * 实际渲染时，外层容器会按容器宽度 transform: scale 等比缩放。
 *
 * 背景为 1280×720 循环播放视频（background.mp4），坐标系直接对齐视频像素。
 * 门在房间左侧（"AI TEA HOUSE" 霓虹灯下方）。
 */

export type Facing = 'left' | 'right' | 'front';

export interface Seat {
  /** 唯一座位 id */
  id: string;
  /** 脚底中心 X（基于 1280 逻辑宽） */
  x: number;
  /** 脚底中心 Y（基于 720 逻辑高） */
  y: number;
  /** 朝向。front 退化为 left */
  facing: Facing;
  /** hover 提示文案 */
  label: string;
}

/** 1280×720 逻辑画布尺寸（与视频原生分辨率一致） */
export const ROOM_LOGICAL_WIDTH = 1280;
export const ROOM_LOGICAL_HEIGHT = 720;

/** 门口入场点（小人初始站立位置，左侧门前地毯） */
export const DOOR_SPAWN = { x: 165, y: 385 };

/** 房间所有可坐座位（基于 1280×720 视频帧目测标定） */
export const SEATS: Seat[] = [
  // L 形沙发（4 个位置）
  { id: 'sofa-1', x: 345, y: 410, facing: 'right', label: '沙发左座' },
  { id: 'sofa-2', x: 420, y: 415, facing: 'front', label: '沙发中座' },
  { id: 'sofa-3', x: 515, y: 415, facing: 'front', label: '沙发右座' },
  { id: 'sofa-4', x: 600, y: 420, facing: 'left',  label: '沙发拐角座' },

  // 单人皮椅（2 张相对而坐）
  { id: 'armchair-left',  x: 800, y: 555, facing: 'right', label: '皮椅 · 朝右' },
  { id: 'armchair-right', x: 945, y: 555, facing: 'left',  label: '皮椅 · 朝左' },

  // 吧台高脚凳（3 个）
  { id: 'bar-1', x: 800, y: 305, facing: 'front', label: '吧台凳' },
  { id: 'bar-2', x: 880, y: 305, facing: 'front', label: '吧台凳' },
  { id: 'bar-3', x: 960, y: 305, facing: 'front', label: '吧台凳' },
];

export type AvatarId = '01' | '03';

/** 可用的角色形象 ID（每次进入随机分配） */
export const AVAILABLE_AVATARS: AvatarId[] = ['01', '03'];

/** 写死的氛围 NPC（页面进入时即坐在那里，占用座位） */
export interface NpcPreset {
  avatarId: AvatarId;
  seatId: string;
  /** 头顶昵称 */
  name: string;
}

export const NPC_PRESETS: NpcPreset[] = [
  // 一个程序员小哥坐在沙发拐角，朝里看
  { avatarId: '01', seatId: 'sofa-4', name: '小鱼干' },
];

/** 装饰用的"在线人数" */
export const DECOR_ONLINE_COUNT = 28;

/** 装饰用的"空闲座位数"（实时根据 SEATS - 已占用计算） */
export const TOTAL_SEATS = SEATS.length;
