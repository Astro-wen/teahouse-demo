/**
 * PixelTeaRoom - AI 茶水间像素小屋窗口
 * --------------------------------------------------
 * 功能：
 *   - 渲染 1280×720 逻辑画布（房间底图）
 *   - 用户初始站立在门口，随机分配 avatar-01 / avatar-03
 *   - 点击任意空闲座位 → 用户瞬移到该座位 + 切换坐姿（无走路动画）
 *   - 写死 1 个 NPC 占位
 *   - "换个形象" 按钮：重新随机分配并复位到门口
 *   - "离开房间" 按钮：本期仅复位到门口
 *   - 装饰用 UI：在线人数胶囊、房间话题面板、麦克风/聊天/举手按钮
 *
 * 不联机、不持久化，纯前端氛围展示。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import PixelAvatar, { poseFromFacing } from './PixelAvatar';
import {
  AVAILABLE_AVATARS,
  DOOR_SPAWN,
  NPC_PRESETS,
  ROOM_LOGICAL_HEIGHT,
  ROOM_LOGICAL_WIDTH,
  SEATS,
  DECOR_ONLINE_COUNT,
  TOTAL_SEATS,
  type AvatarId,
} from './seats.config';

const ROOM_VIDEO_URL = '/assets/teahouse-room/background.mp4';
const ROOM_POSTER_URL = '/assets/teahouse-room/background-poster.jpg';

/** 随机选一个 AvatarId */
function pickRandomAvatar(exclude?: AvatarId): AvatarId {
  const pool = exclude ? AVAILABLE_AVATARS.filter(a => a !== exclude) : AVAILABLE_AVATARS;
  const list = pool.length > 0 ? pool : AVAILABLE_AVATARS;
  return list[Math.floor(Math.random() * list.length)];
}

export default function PixelTeaRoom() {
  // ===== 状态 =====
  const [myAvatarId, setMyAvatarId] = useState<AvatarId>(() => pickRandomAvatar());
  // null 表示站在门口；否则表示坐在哪个座位
  const [mySeatId, setMySeatId] = useState<string | null>(null);
  // 检测 reduce-motion 媒体查询
  const [reduceMotion, setReduceMotion] = useState(false);

  // 外层容器 ref + 缩放因子（适配响应式）
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  // 视频 ref：手动控制循环以避免 loop 属性导致末帧→首帧闪烁
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
  }, []);

  // ===== reduce-motion =====
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // ===== 响应式缩放：用 ResizeObserver 监听容器宽度 =====
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      // 只缩小不放大（避免在大屏上失真），同时给上限避免太小
      const next = Math.min(1, Math.max(0.4, w / ROOM_LOGICAL_WIDTH));
      setScale(next);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ===== 已占用座位映射 =====
  const npcSeatMap = useMemo(() => {
    const m = new Map<string, { avatarId: AvatarId; name: string }>();
    for (const npc of NPC_PRESETS) {
      m.set(npc.seatId, { avatarId: npc.avatarId, name: npc.name });
    }
    return m;
  }, []);

  const occupiedSeatIds = useMemo(() => {
    const set = new Set<string>(npcSeatMap.keys());
    if (mySeatId) set.add(mySeatId);
    return set;
  }, [npcSeatMap, mySeatId]);

  const freeSeatCount = TOTAL_SEATS - occupiedSeatIds.size;

  // ===== 当前用户的坐标 + 姿势 =====
  const myPos = useMemo(() => {
    if (mySeatId) {
      const seat = SEATS.find(s => s.id === mySeatId);
      if (seat) {
        return {
          x: seat.x,
          y: seat.y,
          pose: poseFromFacing(seat.facing),
        };
      }
    }
    return {
      x: DOOR_SPAWN.x,
      y: DOOR_SPAWN.y,
      pose: 'stand' as const,
    };
  }, [mySeatId]);

  // ===== 操作 =====
  const handleSeatClick = (seatId: string) => {
    if (occupiedSeatIds.has(seatId) && seatId !== mySeatId) return;
    setMySeatId(seatId);
  };

  const handleChangeAvatar = () => {
    setMyAvatarId(prev => pickRandomAvatar(prev));
    setMySeatId(null); // 复位到门口
  };

  const handleLeave = () => {
    setMySeatId(null); // 本期：仅站回门口
  };

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
          {/* 房间循环视频（reduce-motion 时降级为静态 poster 图） */}
          {reduceMotion ? (
            <img
              className="ptr-bg"
              src={ROOM_POSTER_URL}
              alt="像素茶水间"
              draggable={false}
            />
          ) : (
            <video
              ref={videoRef}
              className="ptr-bg"
              src={ROOM_VIDEO_URL}
              poster={ROOM_POSTER_URL}
              autoPlay
              muted
              playsInline
              preload="auto"
              aria-label="像素茶水间循环动画"
            />
          )}

          {/* 座位点击热区（在人物之前渲染：z-index 低，但通过 pointer-events 控制） */}
          {SEATS.map(seat => {
            const isOccupied = occupiedSeatIds.has(seat.id);
            const isMine = seat.id === mySeatId;
            return (
              <button
                key={seat.id}
                type="button"
                className={[
                  'ptr-seat',
                  isOccupied ? 'ptr-seat--occupied' : '',
                  isMine ? 'ptr-seat--mine' : '',
                ].filter(Boolean).join(' ')}
                style={{
                  // 热区中心对齐座位坐标，宽 80 高 90
                  left: `${seat.x - 40}px`,
                  top: `${seat.y - 80}px`,
                }}
                onClick={() => handleSeatClick(seat.id)}
                disabled={isOccupied && !isMine}
                aria-label={isOccupied ? `${seat.label}（已占用）` : `坐到${seat.label}`}
                title={isOccupied ? `${seat.label}（已占用）` : seat.label}
              />
            );
          })}

          {/* NPC 人物 */}
          {NPC_PRESETS.map(npc => {
            const seat = SEATS.find(s => s.id === npc.seatId);
            if (!seat) return null;
            return (
              <PixelAvatar
                key={`npc-${npc.seatId}`}
                avatarId={npc.avatarId}
                pose={poseFromFacing(seat.facing)}
                x={seat.x}
                y={seat.y}
                name={npc.name}
                reduceMotion={reduceMotion}
              />
            );
          })}

          {/* 当前用户 */}
          <PixelAvatar
            avatarId={myAvatarId}
            pose={myPos.pose}
            x={myPos.x}
            y={myPos.y}
            name="我"
            isMe
            reduceMotion={reduceMotion}
          />

          {/* 装饰：右侧房间话题面板 */}
          <div className="ptr-topic-board">
            <div className="ptr-topic-board__title">房间话题</div>
            <ul className="ptr-topic-board__list">
              <li>保持友善交流</li>
              <li>尊重彼此的想法</li>
              <li>一起建设这个 AI 社区</li>
            </ul>
          </div>

          {/* 装饰：底部状态条提示 */}
          {!mySeatId && (
            <div className="ptr-hint">点击任意空座位坐下，一起聊天吧 →</div>
          )}
        </div>

        {/* 顶部信息条（不参与缩放） */}
        <div className="ptr-topbar">
          <div className="ptr-topbar__title">
            <span className="ptr-topbar__icon">☕</span>
            像素茶水间
          </div>
          <div className="ptr-topbar__stats">
            <span className="ptr-stat ptr-stat--online">
              <span className="ptr-stat__dot" />
              在线 {DECOR_ONLINE_COUNT} 人
            </span>
            <span className="ptr-stat">
              空闲座位 {freeSeatCount}/{TOTAL_SEATS}
            </span>
          </div>
        </div>

        {/* 底部操作栏（不参与缩放） */}
        <div className="ptr-actionbar">
          <div className="ptr-actionbar__left">
            <button type="button" className="ptr-actionbtn" disabled title="装饰按钮">
              <span aria-hidden>🎙️</span> 麦克风
            </button>
            <button type="button" className="ptr-actionbtn" disabled title="装饰按钮">
              <span aria-hidden>💬</span> 公共聊天
            </button>
            <button type="button" className="ptr-actionbtn" disabled title="装饰按钮">
              <span aria-hidden>✋</span> 举手
            </button>
          </div>
          <div className="ptr-actionbar__right">
            <button type="button" className="ptr-actionbtn ptr-actionbtn--primary" onClick={handleChangeAvatar}>
              🎭 换个形象
            </button>
            <button type="button" className="ptr-actionbtn" onClick={handleLeave}>
              🚪 回到门口
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
