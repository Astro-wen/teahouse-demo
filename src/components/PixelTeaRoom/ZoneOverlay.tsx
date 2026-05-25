/**
 * ZoneOverlay - 调试用区域可视化叠加层
 * --------------------------------------------------
 * `?debug=1` 时叠加：
 *   - seat 矩形（蓝半透 + 标签 + 底边中点十字）
 *   - stand 多边形（绿描边 + 标签）
 *   - block 多边形（红斜线 + 标签）
 *   - 当前所有人物的 anchor 红十字 + 名字
 *
 * 仅在 1280×720 逻辑画布内绘制，与 .ptr-canvas 同级，pointer-events: none。
 */

import {
  isBlockZone,
  isSeatZone,
  isStandZone,
  seatAnchor,
  type ZonesDoc,
} from './zones.schema';

interface AnchorMark {
  x: number;
  y: number;
  label?: string;
  isMe?: boolean;
}

interface ZoneOverlayProps {
  doc: ZonesDoc;
  anchors?: AnchorMark[];
  width?: number;
  height?: number;
}

export default function ZoneOverlay({
  doc,
  anchors = [],
  width = 1280,
  height = 720,
}: ZoneOverlayProps) {
  return (
    <svg
      className="ptr-zone-overlay"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id="ptr-block-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" fill="rgba(220, 38, 38, 0.18)" />
          <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(220, 38, 38, 0.55)" strokeWidth="2" />
        </pattern>
      </defs>

      {/* block：红斜线 */}
      {doc.zones.filter(isBlockZone).map(b => (
        <g key={b.id}>
          <polygon
            points={b.polygon.map(p => p.join(',')).join(' ')}
            fill="url(#ptr-block-hatch)"
            stroke="rgba(220, 38, 38, 0.85)"
            strokeWidth="1.5"
          />
          {b.label && (
            <text
              x={b.polygon[0][0] + 4}
              y={b.polygon[0][1] + 14}
              fontSize="11"
              fill="#fecaca"
              fontFamily="ui-monospace, monospace"
            >
              ⛔ {b.label}
            </text>
          )}
        </g>
      ))}

      {/* stand：绿描边 */}
      {doc.zones.filter(isStandZone).map(s => (
        <g key={s.id}>
          <polygon
            points={s.polygon.map(p => p.join(',')).join(' ')}
            fill="rgba(34, 197, 94, 0.14)"
            stroke="rgba(34, 197, 94, 0.85)"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
          {s.label && (
            <text
              x={s.polygon[0][0] + 4}
              y={s.polygon[0][1] + 14}
              fontSize="11"
              fill="#bbf7d0"
              fontFamily="ui-monospace, monospace"
            >
              🟢 {s.label}
            </text>
          )}
        </g>
      ))}

      {/* seat：蓝矩形 + 底边中点十字 */}
      {doc.zones.filter(isSeatZone).map(s => {
        const [x, y, w, h] = s.rect;
        const a = seatAnchor(s);
        return (
          <g key={s.id}>
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              fill="rgba(59, 130, 246, 0.18)"
              stroke="rgba(59, 130, 246, 0.95)"
              strokeWidth="1.5"
            />
            {/* 朝向箭头 */}
            <line
              x1={x + w / 2}
              y1={y + h / 2}
              x2={x + w / 2 + (s.facing === 'right' ? 14 : -14)}
              y2={y + h / 2}
              stroke="rgba(59, 130, 246, 0.95)"
              strokeWidth="2"
              markerEnd="url(#arrow)"
            />
            {/* 底边中点（坐姿锚点） */}
            <line x1={a.x - 5} y1={a.y} x2={a.x + 5} y2={a.y} stroke="#3b82f6" strokeWidth="1.5" />
            <line x1={a.x} y1={a.y - 5} x2={a.x} y2={a.y + 5} stroke="#3b82f6" strokeWidth="1.5" />
            {s.label && (
              <text
                x={x + 4}
                y={y + 14}
                fontSize="11"
                fill="#bfdbfe"
                fontFamily="ui-monospace, monospace"
              >
                💺 {s.label}
              </text>
            )}
          </g>
        );
      })}

      {/* 当前 anchor 点：红十字 + 名字 */}
      {anchors.map((a, i) => (
        <g key={`anchor-${i}`}>
          <line x1={a.x - 7} y1={a.y} x2={a.x + 7} y2={a.y} stroke={a.isMe ? '#fde047' : '#f43f5e'} strokeWidth="2" />
          <line x1={a.x} y1={a.y - 7} x2={a.x} y2={a.y + 7} stroke={a.isMe ? '#fde047' : '#f43f5e'} strokeWidth="2" />
          {a.label && (
            <text
              x={a.x + 8}
              y={a.y + 4}
              fontSize="10"
              fill={a.isMe ? '#fde047' : '#fecdd3'}
              fontFamily="ui-monospace, monospace"
            >
              {a.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
