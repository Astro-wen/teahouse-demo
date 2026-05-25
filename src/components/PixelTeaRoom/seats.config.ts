/**
 * 像素茶水间 v2 - 座位 / 站立点 / 角色配置
 * --------------------------------------------------
 * 所有坐标基于 1280×720 逻辑画布，表示「人物脚底中心点」。
 * 实际渲染由外层 transform: scale 等比缩放，无需改动坐标。
 *
 * 背景：早/午/晚三段循环视频（皆为 1280×720 同房间不同光照），
 * 共用同一套座位 / 站立点坐标。
 *
 * 重要约束：吧台座位不放任何人物（NPC 与"我"都不能落在吧台）。
 */

export type Facing = 'left' | 'right' | 'front';

/** 坐着的座位 */
export interface Seat {
  id: string;
  /** 脚底中心 X */
  x: number;
  /** 脚底中心 Y */
  y: number;
  facing: Facing;
  label: string;
  /** 是否允许放人（吧台为 false） */
  spawnable: boolean;
  kind: 'sofa' | 'armchair' | 'bar';
}

/** 站立点 */
export interface StandSpot {
  id: string;
  x: number;
  y: number;
  /** 站立朝向（控制是否 mirror sprite） */
  facing: Facing;
  label: string;
}

/** 1280×720 逻辑画布尺寸（与转码后的视频一致） */
export const ROOM_LOGICAL_WIDTH = 1280;
export const ROOM_LOGICAL_HEIGHT = 720;

/** 门口入场点（左侧大门下地毯前）。"我"复位时用 */
export const DOOR_SPAWN = { x: 135, y: 415 };

/**
 * 全部座位（吧台保留以便 UI 显示空座统计，但 spawnable=false 不放人）。
 * 坐标基于新房间 1280×720 morning poster 目测标定。
 */
export const SEATS: Seat[] = [
  // L 形蓝色沙发（4 个位置）
  { id: 'sofa-1', x: 440, y: 360, facing: 'right', label: '沙发左座',  spawnable: true, kind: 'sofa' },
  { id: 'sofa-2', x: 530, y: 365, facing: 'front', label: '沙发中左',  spawnable: true, kind: 'sofa' },
  { id: 'sofa-3', x: 620, y: 370, facing: 'front', label: '沙发中右',  spawnable: true, kind: 'sofa' },
  { id: 'sofa-4', x: 705, y: 380, facing: 'left',  label: '沙发拐角',  spawnable: true, kind: 'sofa' },

  // 棕色单人皮椅（2 张相对而坐）
  { id: 'armchair-left',  x: 815,  y: 530, facing: 'right', label: '皮椅 · 左', spawnable: true, kind: 'armchair' },
  { id: 'armchair-right', x: 1000, y: 530, facing: 'left',  label: '皮椅 · 右', spawnable: true, kind: 'armchair' },

  // 吧台高脚凳（3 个；不放人，仅供统计） — spawnable: false
  { id: 'bar-1', x: 720, y: 320, facing: 'front', label: '吧台凳', spawnable: false, kind: 'bar' },
  { id: 'bar-2', x: 800, y: 320, facing: 'front', label: '吧台凳', spawnable: false, kind: 'bar' },
  { id: 'bar-3', x: 880, y: 320, facing: 'front', label: '吧台凳', spawnable: false, kind: 'bar' },
];

/** 房间内可站立的零散点（路过 / 看东西 / 倚墙等） */
export const STAND_SPOTS: StandSpot[] = [
  { id: 'stand-vending',  x: 320,  y: 480, facing: 'right', label: '售货机前' },
  { id: 'stand-rug',      x: 490,  y: 560, facing: 'front', label: '茶几地毯前' },
  { id: 'stand-window',   x: 1130, y: 490, facing: 'left',  label: '窗边猫窝旁' },
  { id: 'stand-bar-front',x: 770,  y: 380, facing: 'front', label: '吧台前' },
  { id: 'stand-plant',    x: 380,  y: 360, facing: 'front', label: '花盆旁'  },
];

/** 可放人的座位（排除吧台） */
export const SPAWNABLE_SEATS: Seat[] = SEATS.filter(s => s.spawnable);

export type AvatarId = '01' | '03';

/** 可用的角色形象 ID */
export const AVAILABLE_AVATARS: AvatarId[] = ['01', '03'];

/** 装饰：在线人数（与本机随机出场人数无强关联，仅展示） */
export const DECOR_ONLINE_COUNT_RANGE: [number, number] = [18, 36];

/** 总座位数（含吧台，仅供统计） */
export const TOTAL_SEATS = SEATS.length;

/** 本期 NPC 数量随机区间（不含"我"，"我"在外面单独加 1） */
export const NPC_COUNT_RANGE: [number, number] = [0, 4];

/** 期望坐着的比例：决定每次场景大致多少人坐、多少人站 */
export const SIT_RATIO = 0.6;

/** 一个画面里同一种 avatar 的最大出现次数（避免视觉上像复制粘贴） */
export const MAX_SAME_AVATAR_PER_SCENE = 2;

/** 可用昵称池（NPC 名字随机抽） */
export const NAME_POOL = [
  '小鱼干', '阿喵', '可乐', '布丁', '咖啡豆', '麻薯',
  '青提', '柚子', '苏打', '西柚', '芝士', '抹茶',
  '柠檬', '焦糖', '芒果', '荔枝', '葡萄', '哈密瓜',
];
