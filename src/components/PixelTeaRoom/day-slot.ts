/**
 * 像素茶水间 v2 - 按本机时间判定背景时段
 * --------------------------------------------------
 * 规则（按用户本机 hours）：
 *   - 6:00 ~ 15:59  → morning（白天）
 *   - 16:00 ~ 18:59 → afternoon（下午）
 *   - 19:00 ~ 5:59  → night（晚上）
 */

export type DaySlot = 'morning' | 'afternoon' | 'night';

export const DAY_SLOTS: DaySlot[] = ['morning', 'afternoon', 'night'];

export function getDaySlotByHour(hour: number): DaySlot {
  if (hour >= 6 && hour < 16) return 'morning';
  if (hour >= 16 && hour < 19) return 'afternoon';
  return 'night';
}

export function getCurrentDaySlot(): DaySlot {
  const h = new Date().getHours();
  return getDaySlotByHour(h);
}

export const DAY_SLOT_LABEL: Record<DaySlot, string> = {
  morning: '白天',
  afternoon: '下午',
  night: '晚上',
};

/** 一段时间后再检查时间是否已经跨段（毫秒） */
export const SLOT_RECHECK_INTERVAL_MS = 60_000;
