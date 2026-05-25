/**
 * PixelTeaRoom v2.1 - 像素茶水间主组件
 * --------------------------------------------------
 * 相对 v2 的改动：
 *   1. 落位完全由 zones.json 驱动（坐席矩形 + 站立多边形 + 禁入多边形）
 *   2. PixelAvatar 引入 motion='idle' 静帧模式（消除女 NPC 抖动）
 *   3. 新增 `?debug=1` 区域可视化叠加
 *   4. 新增 `?annotate=1` dev 标注器（dynamic import，生产 bundle 不增重）
 *   5. zones.json 加载失败时降级为最小 fallback（不阻塞主流程）
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PixelAvatar from './PixelAvatar';
import {
  AVAILABLE_AVATARS,
  DECOR_ONLINE_COUNT_RANGE,
  ROOM_LOGICAL_HEIGHT,
  ROOM_LOGICAL_WIDTH,
  type AvatarId,
} from './seats.config';
import {
  generateSceneFromZones,
  type AvatarInstance,
  type SceneSnapshot,
} from './scene-generator';
import { useZones } from './useZones';
import ZoneOverlay from './ZoneOverlay';
import {
  DAY_SLOTS,
  DAY_SLOT_LABEL,
  SLOT_RECHECK_INTERVAL_MS,
  getCurrentDaySlot,
  type DaySlot,
} from './day-slot';

// 标注器懒加载，仅 ?annotate=1 时拉取
const ZoneAnnotator = lazy(() => import('./ZoneAnnotator'));

const BG_BASE = `${import.meta.env.BASE_URL}assets/teahouse-room/bg`;
const VIDEO_URL: Record<DaySlot, string> = {
  morning:   `${BG_BASE}/morning.mp4`,
  afternoon: `${BG_BASE}/afternoon.mp4`,
  night:     `${BG_BASE}/night.mp4`,
};
const POSTER_URL: Record<DaySlot, string> = {
  morning:   `${BG_BASE}/morning-poster.jpg`,
  afternoon: `${BG_BASE}/afternoon-poster.jpg`,
  night:     `${BG_BASE}/night-poster.jpg`,
};

function pickAvatar(): AvatarId {
  return AVAILABLE_AVATARS[Math.floor(Math.random() * AVAILABLE_AVATARS.length)];
}

function pickAvatarExclude(prev: AvatarId): AvatarId {
  const pool = AVAILABLE_AVATARS.filter(a => a !== prev);
  return pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : prev;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** 读取 URL query 参数（同步初始化，避免 hooks 数量在第二次渲染时变化） */
function readQueryFlag(name: string): boolean {
  if (typeof window === 'undefined') return false;
  const sp = new URLSearchParams(window.location.search);
  return sp.get(name) === '1';
}

export default function PixelTeaRoom() {
  // 同步读取（不放进 state，避免第一次和第二次渲染 hooks 数量不一致）
  const annotateMode = readQueryFlag('annotate');
  const debugMode = readQueryFlag('debug');

  // 加载 zones.json
  const zones = useZones();

  // ===== 状态：我的形象 =====
  const [myAvatarId, setMyAvatarId] = useState<AvatarId>(() => pickAvatar());

  // ===== 状态：当前时段 =====
  const [autoSlot, setAutoSlot] = useState<DaySlot>(() => getCurrentDaySlot());
  const [manualSlot, setManualSlot] = useState<DaySlot | null>(null);
  const currentSlot: DaySlot = manualSlot ?? autoSlot;

  useEffect(() => {
    const t = window.setInterval(() => {
      const next = getCurrentDaySlot();
      setAutoSlot(prev => (prev === next ? prev : next));
    }, SLOT_RECHECK_INTERVAL_MS);
    return () => window.clearInterval(t);
  }, []);

  // ===== 状态：场景（NPC + 我） =====
  const [scene, setScene] = useState<SceneSnapshot | null>(null);

  // zones 加载完毕（或 fallback）后生成第一帧场景
  useEffect(() => {
    if (zones.status === 'loading') return;
    setScene(generateSceneFromZones(zones.doc, myAvatarId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones.status]);

  // 我的形象变化 → 同步 scene.me.avatarId
  useEffect(() => {
    setScene(prev => {
      if (!prev) return prev;
      return { ...prev, me: { ...prev.me, avatarId: myAvatarId } };
    });
  }, [myAvatarId]);

  // ===== 装饰：在线人数（只随机一次） =====
  const onlineCount = useMemo(
    () => randInt(DECOR_ONLINE_COUNT_RANGE[0], DECOR_ONLINE_COUNT_RANGE[1]),
    [],
  );

  // ===== reduce-motion =====
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // ===== 响应式缩放 =====
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      const next = Math.min(1, Math.max(0.4, w / ROOM_LOGICAL_WIDTH));
      setScale(next);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ===== 视频循环：手动监听 ended =====
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handleEnded = () => {
      video.currentTime = 0;
      video.play().catch(() => {});
    };
    video.addEventListener('ended', handleEnded);
    return () => video.removeEventListener('ended', handleEnded);
  }, [currentSlot]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.load();
    video.play().catch(() => {});
  }, [currentSlot]);

  // ===== 操作 =====
  const handleShuffleNpcs = useCallback(() => {
    if (zones.status === 'loading') return;
    setScene(generateSceneFromZones(zones.doc, myAvatarId));
  }, [zones.status, zones.doc, myAvatarId]);

  const handleCycleSlot = useCallback(() => {
    setManualSlot(prev => {
      const baseline = prev ?? autoSlot;
      const idx = DAY_SLOTS.indexOf(baseline);
      const next = DAY_SLOTS[(idx + 1) % DAY_SLOTS.length];
      return next === autoSlot ? null : next;
    });
  }, [autoSlot]);

  const handleResetAutoSlot = useCallback(() => setManualSlot(null), []);

  const handleChangeAvatar = useCallback(() => {
    const next = pickAvatarExclude(myAvatarId);
    setMyAvatarId(next);
    if (zones.status !== 'loading') {
      setScene(generateSceneFromZones(zones.doc, next));
    }
  }, [myAvatarId, zones.status, zones.doc]);

  // ===== 调试用 anchor 列表（hooks 必须在所有 return 之前调用） =====
  const debugAnchors = useMemo(() => {
    if (!debugMode || !scene) return [];
    const all: AvatarInstance[] = [scene.me, ...scene.npcs];
    return all.map(a => ({
      x: a.anchorX,
      y: a.anchorY,
      label: a.name,
      isMe: a.isMe,
    }));
  }, [debugMode, scene]);

  // ===== 标注器分支：?annotate=1 =====
  if (annotateMode) {
    return (
      <div className="ptr-annotator-wrapper">
        <Suspense fallback={<div className="ptr-annotator__loading">加载标注器...</div>}>
          <ZoneAnnotator initialDoc={zones.status === 'ready' ? zones.doc : undefined} />
        </Suspense>
      </div>
    );
  }

  // ===== 渲染 =====
  return (
    <div className="ptr-wrapper" ref={containerRef}>
      <div
        className="ptr-stage"
        style={{
          width: `${ROOM_LOGICAL_WIDTH * scale}px`,
          height: `${ROOM_LOGICAL_HEIGHT * scale}px`,
        }}
      >
        <div
          className="ptr-canvas"
          style={{
            width: `${ROOM_LOGICAL_WIDTH}px`,
            height: `${ROOM_LOGICAL_HEIGHT}px`,
            transform: `scale(${scale})`,
          }}
        >
          {/* 背景视频 */}
          {reduceMotion ? (
            <img
              key={`poster-${currentSlot}`}
              className="ptr-bg"
              src={POSTER_URL[currentSlot]}
              alt={`像素茶水间 · ${DAY_SLOT_LABEL[currentSlot]}`}
              draggable={false}
            />
          ) : (
            <video
              key={`video-${currentSlot}`}
              ref={videoRef}
              className="ptr-bg"
              src={VIDEO_URL[currentSlot]}
              poster={POSTER_URL[currentSlot]}
              autoPlay
              muted
              playsInline
              preload="auto"
              aria-label={`像素茶水间 · ${DAY_SLOT_LABEL[currentSlot]}`}
            />
          )}

          {/* NPC */}
          {scene?.npcs.map(npc => (
            <PixelAvatar
              key={npc.id}
              avatarId={npc.avatarId}
              pose={npc.pose}
              x={npc.anchorX}
              y={npc.anchorY}
              name={npc.name}
              mirror={npc.mirror}
              motion={npc.motion}
              reduceMotion={reduceMotion}
            />
          ))}

          {/* 我 */}
          {scene && (
            <PixelAvatar
              key={scene.me.id}
              avatarId={scene.me.avatarId}
              pose={scene.me.pose}
              x={scene.me.anchorX}
              y={scene.me.anchorY}
              name="我"
              isMe
              mirror={scene.me.mirror}
              motion={scene.me.motion}
              reduceMotion={reduceMotion}
            />
          )}

          {/* 调试叠加 */}
          {debugMode && zones.status !== 'loading' && (
            <ZoneOverlay
              doc={zones.doc}
              anchors={debugAnchors}
              width={ROOM_LOGICAL_WIDTH}
              height={ROOM_LOGICAL_HEIGHT}
            />
          )}
        </div>

        {/* 顶部信息条 */}
        <div className="ptr-topbar">
          <div className="ptr-topbar__title">
            <span className="ptr-topbar__icon">☕</span>
            像素茶水间
            {zones.status === 'fallback' && (
              <span className="ptr-topbar__warn" title={zones.error}>· zones.json 未生效</span>
            )}
            {debugMode && <span className="ptr-topbar__warn">· debug</span>}
          </div>
          <div className="ptr-topbar__stats">
            <span className="ptr-stat ptr-stat--online">
              <span className="ptr-stat__dot" />
              在线 {onlineCount} 人
            </span>
            <span className="ptr-stat">
              {DAY_SLOT_LABEL[currentSlot]}
              {manualSlot ? ' · 手动' : ' · 跟随本机'}
            </span>
          </div>
        </div>

        {/* 底部演示按钮 */}
        <div className="ptr-actionbar">
          <div className="ptr-actionbar__left">
            {manualSlot && (
              <button
                type="button"
                className="ptr-actionbtn"
                onClick={handleResetAutoSlot}
                title="回到按本机时间自动切换"
              >
                ⏱️ 跟随本机
              </button>
            )}
          </div>
          <div className="ptr-actionbar__right">
            <button
              type="button"
              className="ptr-actionbtn"
              onClick={handleShuffleNpcs}
              title="重新随机 NPC 数量与位置"
              disabled={zones.status === 'loading'}
            >
              🎲 换一批 NPC
            </button>
            <button
              type="button"
              className="ptr-actionbtn"
              onClick={handleCycleSlot}
              title="手动切换 早 / 午 / 晚 背景"
            >
              🌗 换背景
            </button>
            <button
              type="button"
              className="ptr-actionbtn ptr-actionbtn--primary"
              onClick={handleChangeAvatar}
              title="换我的角色形象（顺便换一批 NPC）"
              disabled={zones.status === 'loading'}
            >
              🎭 换我的形象
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
