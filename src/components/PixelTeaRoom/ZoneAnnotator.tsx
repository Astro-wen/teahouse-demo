/**
 * ZoneAnnotator - dev-only 区域标注器（v2：可移动 / 缩放 / 编辑顶点）
 * --------------------------------------------------
 * 启用：访问 `?annotate=1`
 *
 * 工具栏：
 *   - 模式：select / draw-seat / draw-stand / draw-block
 *   - 底图：morning / afternoon / night（poster 切换）
 *   - 导入 zones.json / 导出 zones.json
 *
 * select 模式（核心编辑能力）：
 *   - 单击矩形/多边形 → 选中
 *   - 矩形：按住矩形内部拖拽 = 平移；拖拽 4 角/4 边把手 = 缩放
 *   - 多边形：按住内部拖拽 = 平移；拖拽每个顶点把手 = 单独移动；双击边中点 = 插入顶点
 *   - 选中后按 Delete 删除；Esc 取消任何 draft / 拖拽
 *
 * draw 模式：
 *   - draw-seat：鼠标按下→拖拽出矩形
 *   - draw-stand / draw-block：单击加折点（≥3）→ 双击或点"完成"闭合
 *
 * 右侧面板：编辑 label / facing / motion / seatOffsetY / 删除该区域
 * 列表：点击 row 选中
 *
 * 这个文件只在 ?annotate=1 时被 dynamic import；生产 bundle 不增重。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  isBlockZone,
  isSeatZone,
  isStandZone,
  validateZonesDoc,
  type Facing,
  type Polygon,
  type SeatZone,
  type StandZone,
  type BlockZone,
  type Zone,
  type ZonesDoc,
} from './zones.schema';

const BG_BASE = `${import.meta.env.BASE_URL}assets/teahouse-room/bg`;
const POSTER_URL = {
  morning:   `${BG_BASE}/morning-poster.jpg`,
  afternoon: `${BG_BASE}/afternoon-poster.jpg`,
  night:     `${BG_BASE}/night-poster.jpg`,
} as const;
type Slot = keyof typeof POSTER_URL;

const VIEWPORT_W = 1280;
const VIEWPORT_H = 720;

type Mode = 'select' | 'draw-seat' | 'draw-stand' | 'draw-block';

/** 拖拽中的状态：移动整块 / 缩放矩形某把手 / 移动多边形某顶点 */
type DragState =
  | null
  | {
      kind: 'move-rect';
      zoneId: string;
      orig: [number, number, number, number]; // 原始 rect
      startMouse: { x: number; y: number };
    }
  | {
      kind: 'resize-rect';
      zoneId: string;
      handle: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
      orig: [number, number, number, number];
      startMouse: { x: number; y: number };
    }
  | {
      kind: 'move-polygon';
      zoneId: string;
      orig: Polygon;
      startMouse: { x: number; y: number };
    }
  | {
      kind: 'move-vertex';
      zoneId: string;
      vertexIndex: number;
      orig: Polygon;
      startMouse: { x: number; y: number };
    };

interface DraftRect {
  startX: number;
  startY: number;
  curX: number;
  curY: number;
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function getSvgPoint(svg: SVGSVGElement, evt: { clientX: number; clientY: number }) {
  const rect = svg.getBoundingClientRect();
  const x = ((evt.clientX - rect.left) / rect.width) * VIEWPORT_W;
  const y = ((evt.clientY - rect.top) / rect.height) * VIEWPORT_H;
  return { x: Math.round(clamp(x, 0, VIEWPORT_W)), y: Math.round(clamp(y, 0, VIEWPORT_H)) };
}

function pointInPolygonClient(px: number, py: number, polygon: Polygon): boolean {
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

interface ZoneAnnotatorProps {
  initialDoc?: ZonesDoc;
}

export default function ZoneAnnotator({ initialDoc }: ZoneAnnotatorProps) {
  const [slot, setSlot] = useState<Slot>('night');
  const [mode, setMode] = useState<Mode>('select');
  const [zones, setZones] = useState<Zone[]>(() => initialDoc?.zones ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 矩形拖拽 draft
  const [draftRect, setDraftRect] = useState<DraftRect | null>(null);
  // 多边形 draft
  const [draftPolygon, setDraftPolygon] = useState<Polygon | null>(null);
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null);

  // select 模式下的拖拽状态
  const [drag, setDrag] = useState<DragState>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);

  const selectedZone = useMemo(
    () => zones.find(z => z.id === selectedId) ?? null,
    [zones, selectedId],
  );

  // ====== 通用：更新 zone ======
  const updateZone = useCallback((id: string, patch: Partial<Zone>) => {
    setZones(prev => prev.map(z => (z.id === id ? ({ ...z, ...patch } as Zone) : z)));
  }, []);

  // ====== 鼠标交互 - 主舞台 ======
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (!svgRef.current) return;
    const p = getSvgPoint(svgRef.current, e);
    if (mode === 'draw-seat') {
      setDraftRect({ startX: p.x, startY: p.y, curX: p.x, curY: p.y });
      return;
    }
  }, [mode]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!svgRef.current) return;
    const p = getSvgPoint(svgRef.current, e);
    setHoverPoint(p);

    // 画矩形
    if (mode === 'draw-seat' && draftRect) {
      setDraftRect({ ...draftRect, curX: p.x, curY: p.y });
      return;
    }

    // 拖拽编辑
    if (drag) {
      const dx = p.x - drag.startMouse.x;
      const dy = p.y - drag.startMouse.y;

      if (drag.kind === 'move-rect') {
        const [ox, oy, ow, oh] = drag.orig;
        const nx = clamp(ox + dx, 0, VIEWPORT_W - ow);
        const ny = clamp(oy + dy, 0, VIEWPORT_H - oh);
        updateZone(drag.zoneId, { rect: [Math.round(nx), Math.round(ny), ow, oh] });
        return;
      }

      if (drag.kind === 'resize-rect') {
        let [ox, oy, ow, oh] = drag.orig;
        let nx = ox, ny = oy, nw = ow, nh = oh;
        const h = drag.handle;
        // 左侧把手会移动 x 与 w；右侧只动 w；类似上下
        if (h === 'nw' || h === 'w' || h === 'sw') { nx = ox + dx; nw = ow - dx; }
        if (h === 'ne' || h === 'e' || h === 'se') { nw = ow + dx; }
        if (h === 'nw' || h === 'n' || h === 'ne') { ny = oy + dy; nh = oh - dy; }
        if (h === 'sw' || h === 's' || h === 'se') { nh = oh + dy; }
        // 防止反向
        if (nw < 6) { nw = 6; if (nx !== ox) nx = ox + ow - 6; }
        if (nh < 6) { nh = 6; if (ny !== oy) ny = oy + oh - 6; }
        nx = clamp(nx, 0, VIEWPORT_W - nw);
        ny = clamp(ny, 0, VIEWPORT_H - nh);
        updateZone(drag.zoneId, {
          rect: [Math.round(nx), Math.round(ny), Math.round(nw), Math.round(nh)],
        });
        return;
      }

      if (drag.kind === 'move-polygon') {
        const next: Polygon = drag.orig.map(([x, y]) => [
          Math.round(clamp(x + dx, 0, VIEWPORT_W)),
          Math.round(clamp(y + dy, 0, VIEWPORT_H)),
        ]);
        updateZone(drag.zoneId, { polygon: next });
        return;
      }

      if (drag.kind === 'move-vertex') {
        const next: Polygon = drag.orig.map(([x, y], i) =>
          i === drag.vertexIndex
            ? [Math.round(clamp(p.x, 0, VIEWPORT_W)), Math.round(clamp(p.y, 0, VIEWPORT_H))]
            : [x, y],
        );
        updateZone(drag.zoneId, { polygon: next });
        return;
      }
    }
  }, [mode, draftRect, drag, updateZone]);

  const onMouseUp = useCallback(() => {
    if (!svgRef.current) return;
    if (mode === 'draw-seat' && draftRect) {
      const x = Math.min(draftRect.startX, draftRect.curX);
      const y = Math.min(draftRect.startY, draftRect.curY);
      const w = Math.abs(draftRect.curX - draftRect.startX);
      const h = Math.abs(draftRect.curY - draftRect.startY);
      if (w >= 4 && h >= 4) {
        const seat: SeatZone = {
          id: uid('seat'),
          type: 'seat',
          rect: [x, y, w, h],
          facing: 'right',
          label: '新座席',
        };
        setZones(prev => [...prev, seat]);
        setSelectedId(seat.id);
      }
      setDraftRect(null);
      return;
    }
    if (drag) {
      setDrag(null);
    }
  }, [mode, draftRect, drag]);

  const onSvgClick = useCallback((e: React.MouseEvent) => {
    if (!svgRef.current) return;
    if (mode === 'draw-stand' || mode === 'draw-block') {
      const p = getSvgPoint(svgRef.current, e);
      setDraftPolygon(prev => (prev ? [...prev, [p.x, p.y]] : [[p.x, p.y]]));
      return;
    }
    // select 模式下空白点击：取消选中
    if (mode === 'select' && (e.target as Element)?.tagName === 'svg') {
      setSelectedId(null);
    }
  }, [mode]);

  const finishDraftPolygon = useCallback(() => {
    if (!draftPolygon || draftPolygon.length < 3) {
      setDraftPolygon(null);
      return;
    }
    if (mode === 'draw-stand') {
      const z: StandZone = {
        id: uid('stand'),
        type: 'stand',
        polygon: draftPolygon,
        motion: 'walk',
        label: '新站立区',
      };
      setZones(prev => [...prev, z]);
      setSelectedId(z.id);
    } else if (mode === 'draw-block') {
      const z: BlockZone = {
        id: uid('block'),
        type: 'block',
        polygon: draftPolygon,
        label: '新禁入区',
      };
      setZones(prev => [...prev, z]);
      setSelectedId(z.id);
    }
    setDraftPolygon(null);
  }, [draftPolygon, mode]);

  const onSvgDoubleClick = useCallback(() => {
    if ((mode === 'draw-stand' || mode === 'draw-block') && draftPolygon && draftPolygon.length >= 3) {
      finishDraftPolygon();
    }
  }, [mode, draftPolygon, finishDraftPolygon]);

  // ====== select 模式：开始拖拽矩形整块 ======
  const startMoveRect = useCallback((e: React.MouseEvent, zone: SeatZone) => {
    e.stopPropagation();
    if (mode !== 'select' || !svgRef.current) return;
    const p = getSvgPoint(svgRef.current, e);
    setSelectedId(zone.id);
    setDrag({
      kind: 'move-rect',
      zoneId: zone.id,
      orig: [...zone.rect],
      startMouse: p,
    });
  }, [mode]);

  // ====== select 模式：开始缩放矩形某把手 ======
  const startResizeRect = useCallback((e: React.MouseEvent, zone: SeatZone, handle: 'nw'|'n'|'ne'|'e'|'se'|'s'|'sw'|'w') => {
    e.stopPropagation();
    if (mode !== 'select' || !svgRef.current) return;
    const p = getSvgPoint(svgRef.current, e);
    setSelectedId(zone.id);
    setDrag({
      kind: 'resize-rect',
      zoneId: zone.id,
      handle,
      orig: [...zone.rect],
      startMouse: p,
    });
  }, [mode]);

  // ====== select 模式：开始拖动多边形整块 ======
  const startMovePolygon = useCallback((e: React.MouseEvent, zone: StandZone | BlockZone) => {
    e.stopPropagation();
    if (mode !== 'select' || !svgRef.current) return;
    const p = getSvgPoint(svgRef.current, e);
    setSelectedId(zone.id);
    setDrag({
      kind: 'move-polygon',
      zoneId: zone.id,
      orig: zone.polygon.map(pt => [...pt]) as Polygon,
      startMouse: p,
    });
  }, [mode]);

  // ====== select 模式：开始拖动多边形顶点 ======
  const startMoveVertex = useCallback((e: React.MouseEvent, zone: StandZone | BlockZone, vIdx: number) => {
    e.stopPropagation();
    if (mode !== 'select' || !svgRef.current) return;
    const p = getSvgPoint(svgRef.current, e);
    setSelectedId(zone.id);
    setDrag({
      kind: 'move-vertex',
      zoneId: zone.id,
      vertexIndex: vIdx,
      orig: zone.polygon.map(pt => [...pt]) as Polygon,
      startMouse: p,
    });
  }, [mode]);

  // ====== 双击边中点：插入顶点 ======
  const insertVertex = useCallback((e: React.MouseEvent, zone: StandZone | BlockZone, edgeIdx: number) => {
    e.stopPropagation();
    const a = zone.polygon[edgeIdx];
    const b = zone.polygon[(edgeIdx + 1) % zone.polygon.length];
    const mid: [number, number] = [Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2)];
    const next: Polygon = [
      ...zone.polygon.slice(0, edgeIdx + 1),
      mid,
      ...zone.polygon.slice(edgeIdx + 1),
    ];
    updateZone(zone.id, { polygon: next });
  }, [updateZone]);

  // ESC / Delete
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDraftPolygon(null);
        setDraftRect(null);
        setDrag(null);
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId && (e.target as HTMLElement)?.tagName !== 'INPUT') {
          setZones(prev => prev.filter(z => z.id !== selectedId));
          setSelectedId(null);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

  // ====== 导入 / 导出 ======
  const exportJson = useCallback(() => {
    const doc: ZonesDoc = {
      viewport: { w: VIEWPORT_W, h: VIEWPORT_H },
      zones,
    };
    const json = JSON.stringify(doc, null, 2);
    navigator.clipboard?.writeText(json).catch(() => {});
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'zones.json';
    a.click();
    URL.revokeObjectURL(url);
    // eslint-disable-next-line no-alert
    alert(`已导出 zones.json（共 ${zones.length} 个区域），并复制到剪贴板。\n请保存到 public/assets/teahouse-room/bg/zones.json`);
  }, [zones]);

  const importJson = useCallback(async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const doc = validateZonesDoc(JSON.parse(text));
        setZones(doc.zones);
        setSelectedId(null);
        // eslint-disable-next-line no-alert
        alert(`已导入 ${doc.zones.length} 个区域`);
      } catch (e) {
        // eslint-disable-next-line no-alert
        alert(`导入失败：${e instanceof Error ? e.message : String(e)}`);
      }
    };
    input.click();
  }, []);

  // ====== 渲染 ======
  return (
    <div className="ptr-annotator">
      <div className="ptr-annotator__toolbar">
        <strong>📐 区域标注器</strong>
        <div className="ptr-annotator__group">
          {(['select', 'draw-seat', 'draw-stand', 'draw-block'] as Mode[]).map(m => (
            <button
              key={m}
              type="button"
              className={`ptr-annotator__btn${mode === m ? ' is-active' : ''}`}
              onClick={() => { setMode(m); setDraftPolygon(null); setDraftRect(null); setDrag(null); }}
            >
              {m === 'select' && '👆 选择/移动'}
              {m === 'draw-seat' && '💺 画坐席'}
              {m === 'draw-stand' && '🟢 画站立'}
              {m === 'draw-block' && '⛔ 画禁入'}
            </button>
          ))}
        </div>
        <div className="ptr-annotator__group">
          {(['morning', 'afternoon', 'night'] as Slot[]).map(s => (
            <button
              key={s}
              type="button"
              className={`ptr-annotator__btn${slot === s ? ' is-active' : ''}`}
              onClick={() => setSlot(s)}
            >
              {s === 'morning' ? '☀️' : s === 'afternoon' ? '🌇' : '🌙'} {s}
            </button>
          ))}
        </div>
        {(mode === 'draw-stand' || mode === 'draw-block') && draftPolygon && draftPolygon.length >= 3 && (
          <button type="button" className="ptr-annotator__btn ptr-annotator__btn--ok" onClick={finishDraftPolygon}>
            ✅ 完成多边形（{draftPolygon.length} 点）
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button type="button" className="ptr-annotator__btn" onClick={importJson}>📥 导入</button>
        <button type="button" className="ptr-annotator__btn ptr-annotator__btn--primary" onClick={exportJson}>📤 导出 zones.json</button>
      </div>

      <div className="ptr-annotator__body">
        <div className="ptr-annotator__stage">
          <img className="ptr-annotator__bg" src={POSTER_URL[slot]} alt={slot} draggable={false} />
          <svg
            ref={svgRef}
            className={`ptr-annotator__svg ptr-annotator__svg--${mode}`}
            viewBox={`0 0 ${VIEWPORT_W} ${VIEWPORT_H}`}
            preserveAspectRatio="xMidYMid meet"
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onClick={onSvgClick}
            onDoubleClick={onSvgDoubleClick}
          >
            {/* 已有区域 */}
            {zones.map(z => {
              const isSelected = z.id === selectedId;
              if (isSeatZone(z)) {
                const [x, y, w, h] = z.rect;
                return (
                  <g key={z.id}>
                    <rect
                      x={x} y={y} width={w} height={h}
                      fill="rgba(59, 130, 246, 0.22)"
                      stroke={isSelected ? '#fde047' : 'rgba(59, 130, 246, 0.95)'}
                      strokeWidth={isSelected ? 3 : 1.5}
                      style={{ cursor: mode === 'select' ? 'move' : 'inherit' }}
                      onMouseDown={(e) => startMoveRect(e, z)}
                    />
                    <text x={x + 4} y={y + 14} fontSize="11" fill="#bfdbfe" fontFamily="ui-monospace, monospace" pointerEvents="none">
                      💺 {z.label || z.id} · {z.facing}
                    </text>
                    {/* 把手 */}
                    {isSelected && mode === 'select' && renderRectHandles(z, startResizeRect)}
                  </g>
                );
              }
              if (isStandZone(z)) {
                return (
                  <g key={z.id}>
                    <polygon
                      points={z.polygon.map(p => p.join(',')).join(' ')}
                      fill="rgba(34, 197, 94, 0.18)"
                      stroke={isSelected ? '#fde047' : 'rgba(34, 197, 94, 0.95)'}
                      strokeWidth={isSelected ? 3 : 1.5}
                      strokeDasharray="4 3"
                      style={{ cursor: mode === 'select' ? 'move' : 'inherit' }}
                      onMouseDown={(e) => startMovePolygon(e, z)}
                    />
                    <text x={z.polygon[0][0] + 4} y={z.polygon[0][1] + 14} fontSize="11" fill="#bbf7d0" fontFamily="ui-monospace, monospace" pointerEvents="none">
                      🟢 {z.label || z.id}
                    </text>
                    {isSelected && mode === 'select' && renderPolygonHandles(z, startMoveVertex, insertVertex)}
                  </g>
                );
              }
              if (isBlockZone(z)) {
                return (
                  <g key={z.id}>
                    <polygon
                      points={z.polygon.map(p => p.join(',')).join(' ')}
                      fill="rgba(220, 38, 38, 0.22)"
                      stroke={isSelected ? '#fde047' : 'rgba(220, 38, 38, 0.95)'}
                      strokeWidth={isSelected ? 3 : 1.5}
                      style={{ cursor: mode === 'select' ? 'move' : 'inherit' }}
                      onMouseDown={(e) => startMovePolygon(e, z)}
                    />
                    <text x={z.polygon[0][0] + 4} y={z.polygon[0][1] + 14} fontSize="11" fill="#fecaca" fontFamily="ui-monospace, monospace" pointerEvents="none">
                      ⛔ {z.label || z.id}
                    </text>
                    {isSelected && mode === 'select' && renderPolygonHandles(z, startMoveVertex, insertVertex)}
                  </g>
                );
              }
              return null;
            })}

            {/* 矩形 draft */}
            {draftRect && (
              <rect
                x={Math.min(draftRect.startX, draftRect.curX)}
                y={Math.min(draftRect.startY, draftRect.curY)}
                width={Math.abs(draftRect.curX - draftRect.startX)}
                height={Math.abs(draftRect.curY - draftRect.startY)}
                fill="rgba(59, 130, 246, 0.25)"
                stroke="#fde047"
                strokeWidth="2"
                strokeDasharray="6 3"
                pointerEvents="none"
              />
            )}

            {/* 多边形 draft */}
            {draftPolygon && (
              <g pointerEvents="none">
                <polyline
                  points={[
                    ...draftPolygon.map(p => p.join(',')),
                    hoverPoint ? `${hoverPoint.x},${hoverPoint.y}` : '',
                  ].filter(Boolean).join(' ')}
                  fill={mode === 'draw-block' ? 'rgba(220, 38, 38, 0.18)' : 'rgba(34, 197, 94, 0.18)'}
                  stroke="#fde047"
                  strokeWidth="2"
                  strokeDasharray="4 3"
                />
                {draftPolygon.map(([x, y], i) => (
                  <circle key={i} cx={x} cy={y} r={4} fill="#fde047" stroke="#000" strokeWidth="0.5" />
                ))}
              </g>
            )}

            {/* hover 准星 */}
            {hoverPoint && mode !== 'select' && !drag && (
              <g pointerEvents="none">
                <line x1={hoverPoint.x - 6} y1={hoverPoint.y} x2={hoverPoint.x + 6} y2={hoverPoint.y} stroke="rgba(255,255,255,0.6)" />
                <line x1={hoverPoint.x} y1={hoverPoint.y - 6} x2={hoverPoint.x} y2={hoverPoint.y + 6} stroke="rgba(255,255,255,0.6)" />
                <text x={hoverPoint.x + 8} y={hoverPoint.y - 8} fontSize="10" fill="rgba(255,255,255,0.85)" fontFamily="ui-monospace, monospace">
                  ({hoverPoint.x},{hoverPoint.y})
                </text>
              </g>
            )}
          </svg>
        </div>

        <aside className="ptr-annotator__sidebar">
          <div className="ptr-annotator__hint">
            <p><strong>使用提示</strong></p>
            <ul>
              <li>👆 选择/移动：点中区域后可拖动整块；<b>蓝矩形</b>有 8 个把手可缩放；<b>多边形</b>有顶点把手；双击边中点可插入顶点</li>
              <li>💺/🟢/⛔ 画新区域：矩形拖拽 / 多边形折点点击</li>
              <li><kbd>Delete</kbd> 删除选中；<kbd>Esc</kbd> 取消 draft</li>
            </ul>
            <p>当前共 <b>{zones.length}</b> 个区域：
              💺 {zones.filter(isSeatZone).length} ·
              🟢 {zones.filter(isStandZone).length} ·
              ⛔ {zones.filter(isBlockZone).length}
            </p>
          </div>

          {selectedZone ? (
            <div className="ptr-annotator__inspector">
              <h4>已选中：{selectedZone.id}</h4>
              <label>
                <span>类型</span>
                <code>{selectedZone.type}</code>
              </label>
              <label>
                <span>label</span>
                <input
                  type="text"
                  value={selectedZone.label ?? ''}
                  onChange={(e) => updateZone(selectedZone.id, { label: e.target.value })}
                />
              </label>
              {isSeatZone(selectedZone) && (
                <>
                  <label>
                    <span>facing</span>
                    <select
                      value={selectedZone.facing}
                      onChange={(e) => updateZone(selectedZone.id, { facing: e.target.value as Facing })}
                    >
                      <option value="left">left</option>
                      <option value="right">right</option>
                    </select>
                  </label>
                  <label>
                    <span>seatOffsetY</span>
                    <input
                      type="number"
                      value={selectedZone.seatOffsetY ?? 0}
                      onChange={(e) => updateZone(selectedZone.id, { seatOffsetY: Number(e.target.value) })}
                    />
                  </label>
                  <code className="ptr-annotator__rect">
                    rect: [{selectedZone.rect.join(', ')}]
                  </code>
                </>
              )}
              {isStandZone(selectedZone) && (
                <>
                  <label>
                    <span>facing</span>
                    <select
                      value={selectedZone.facing ?? ''}
                      onChange={(e) => updateZone(selectedZone.id, { facing: (e.target.value || undefined) as Facing | undefined })}
                    >
                      <option value="">(none)</option>
                      <option value="left">left</option>
                      <option value="right">right</option>
                    </select>
                  </label>
                  <label>
                    <span>motion</span>
                    <select
                      value={selectedZone.motion ?? 'idle'}
                      onChange={(e) => updateZone(selectedZone.id, { motion: e.target.value as 'idle' | 'walk' })}
                    >
                      <option value="idle">idle</option>
                      <option value="walk">walk</option>
                    </select>
                  </label>
                  <code className="ptr-annotator__rect">
                    polygon: {selectedZone.polygon.length} 点
                  </code>
                </>
              )}
              {isBlockZone(selectedZone) && (
                <code className="ptr-annotator__rect">
                  polygon: {selectedZone.polygon.length} 点
                </code>
              )}
              <button
                type="button"
                className="ptr-annotator__btn ptr-annotator__btn--danger"
                onClick={() => {
                  setZones(prev => prev.filter(z => z.id !== selectedZone.id));
                  setSelectedId(null);
                }}
              >
                🗑 删除该区域
              </button>
            </div>
          ) : (
            <div className="ptr-annotator__inspector ptr-annotator__inspector--empty">
              选中一个区域以编辑属性
            </div>
          )}

          <div className="ptr-annotator__list">
            {zones.map(z => (
              <button
                key={z.id}
                type="button"
                className={`ptr-annotator__row${selectedId === z.id ? ' is-active' : ''}`}
                onClick={() => setSelectedId(z.id)}
              >
                <span>{z.type === 'seat' ? '💺' : z.type === 'stand' ? '🟢' : '⛔'}</span>
                <span className="ptr-annotator__row-label">{z.label || z.id}</span>
                <span className="ptr-annotator__row-id">{z.id}</span>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

// =========================================================================
// 子渲染：把手
// =========================================================================

const HANDLE_R = 6;

function renderRectHandles(
  zone: SeatZone,
  startResize: (e: React.MouseEvent, z: SeatZone, h: 'nw'|'n'|'ne'|'e'|'se'|'s'|'sw'|'w') => void,
) {
  const [x, y, w, h] = zone.rect;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const handles: Array<{ key: 'nw'|'n'|'ne'|'e'|'se'|'s'|'sw'|'w'; x: number; y: number; cursor: string }> = [
    { key: 'nw', x: x,     y: y,     cursor: 'nwse-resize' },
    { key: 'n',  x: cx,    y: y,     cursor: 'ns-resize'   },
    { key: 'ne', x: x + w, y: y,     cursor: 'nesw-resize' },
    { key: 'e',  x: x + w, y: cy,    cursor: 'ew-resize'   },
    { key: 'se', x: x + w, y: y + h, cursor: 'nwse-resize' },
    { key: 's',  x: cx,    y: y + h, cursor: 'ns-resize'   },
    { key: 'sw', x: x,     y: y + h, cursor: 'nesw-resize' },
    { key: 'w',  x: x,     y: cy,    cursor: 'ew-resize'   },
  ];
  return (
    <>
      {handles.map(hh => (
        <rect
          key={hh.key}
          x={hh.x - HANDLE_R}
          y={hh.y - HANDLE_R}
          width={HANDLE_R * 2}
          height={HANDLE_R * 2}
          fill="#fde047"
          stroke="#000"
          strokeWidth="1"
          style={{ cursor: hh.cursor }}
          onMouseDown={(e) => startResize(e, zone, hh.key)}
        />
      ))}
    </>
  );
}

function renderPolygonHandles(
  zone: StandZone | BlockZone,
  startMoveVertex: (e: React.MouseEvent, z: StandZone | BlockZone, idx: number) => void,
  insertVertex: (e: React.MouseEvent, z: StandZone | BlockZone, edgeIdx: number) => void,
) {
  return (
    <>
      {/* 顶点把手 */}
      {zone.polygon.map(([px, py], i) => (
        <circle
          key={`v-${i}`}
          cx={px}
          cy={py}
          r={HANDLE_R}
          fill="#fde047"
          stroke="#000"
          strokeWidth="1"
          style={{ cursor: 'crosshair' }}
          onMouseDown={(e) => startMoveVertex(e, zone, i)}
        />
      ))}
      {/* 边中点（双击插入顶点） */}
      {zone.polygon.map(([ax, ay], i) => {
        const [bx, by] = zone.polygon[(i + 1) % zone.polygon.length];
        const mx = (ax + bx) / 2;
        const my = (ay + by) / 2;
        return (
          <circle
            key={`m-${i}`}
            cx={mx}
            cy={my}
            r={4}
            fill="rgba(253, 224, 71, 0.45)"
            stroke="#000"
            strokeWidth="0.5"
            style={{ cursor: 'copy' }}
            onDoubleClick={(e) => insertVertex(e, zone, i)}
          />
        );
      })}
    </>
  );
}
