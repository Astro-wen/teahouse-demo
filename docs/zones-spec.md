# zones.json 规范与标注流程

## 是什么

`public/assets/teahouse-room/bg/zones.json` 描述了像素茶水间房间的"几何语义"：

| 类型 | 形状 | 用途 |
|---|---|---|
| `seat` | 矩形 `[x,y,w,h]` | 沙发段 / 单人皮椅。落点 = 矩形底边中点 + `seatOffsetY` |
| `stand` | 多边形 `[[x,y],...]` | 地毯/走廊/空地等可站立区。多边形内随机均匀采样 |
| `block` | 多边形 `[[x,y],...]` | 茶几/吧台/墙体/家具内部。任何采样点落入即重抽 |

所有坐标基于 **1280×720 逻辑画布**，与三段背景视频/海报尺寸严格一致。三段视频共用同一份（房间几何不随光照变化）。

## TS 类型

```ts
export interface ZonesDoc {
  viewport: { w: number; h: number };
  zones: Zone[];
}
export type Zone = SeatZone | StandZone | BlockZone;

export interface SeatZone  { id; type:'seat';  rect:[x,y,w,h]; facing:'left'|'right'; seatOffsetY?:number; label?:string; }
export interface StandZone { id; type:'stand'; polygon:[[x,y],...]; facing?:'left'|'right'; motion?:'idle'|'walk'; label?:string; }
export interface BlockZone { id; type:'block'; polygon:[[x,y],...]; label?:string; }
```

详见 `src/components/PixelTeaRoom/zones.schema.ts`。

## 锚点规则

PixelAvatar 容器以**脚底中心**为锚点：`left = x - frameWidth/2`，`top = y - frameHeight`。

- 站立：`(anchorX, anchorY)` = stand 多边形里采样到的点 → 等于"脚踩在该像素"
- 坐姿：`(anchorX, anchorY)` = seat 矩形底边中点 + `seatOffsetY` → "屁股压在座面前缘"
  - 坐姿 sprite 自身高度比站立短（120 vs 140），但语义还是"底部 = 与座面接触面"
  - 如果坐姿浮空一点点，把 `seatOffsetY` 调正（往下压几像素）；若陷进座位，调负

## 朝向 / 镜像

- **坐姿**：`facing: 'left'|'right'` → 选 `sit-left` / `sit-right` 两套 sprite，**不做镜像**
- **站立**：所有站立 sprite 默认朝右；`facing: 'left'` 时容器加 `transform: scaleX(-1)` 镜像

## 标注流程

1. 启动 `pnpm dev`，浏览器打开 `http://localhost:5173/?annotate=1`
2. 顶部工具栏选择模式：
   - 💺 画坐席 → 鼠标按下拖拽出矩形（建议沙发每一段一个矩形，皮椅整张一个矩形）
   - 🟢 画站立 → 依次点击折点（≥3 点），双击或点"完成多边形"闭合
   - ⛔ 画禁入 → 同上，画茶几 / 吧台 / 企鹅摆件 / 墙 / 门洞
3. 切换底图（☀️ morning / 🌇 afternoon / 🌙 night）确认三段都准
4. 选中区域后右侧面板可改 `facing` / `label` / `seatOffsetY` / `motion`
5. 选中后按 <kbd>Delete</kbd> 删除；按 <kbd>Esc</kbd> 取消当前 draft
6. 点击「📤 导出 zones.json」→ 同时复制到剪贴板 + 下载文件
7. 把下载的文件覆盖到 `public/assets/teahouse-room/bg/zones.json`
8. 关掉 `?annotate=1`，访问 `?debug=1` 用半透明叠加肉眼校验
9. 移除 query 看最终效果

## 调试模式

`?debug=1`：在主视图上叠加：

- 蓝矩形：seat（带朝向箭头 + 底边中点十字）
- 绿描边：stand（带 label）
- 红斜线：block
- 红/黄十字：当前 NPC / 我 的脚锚点

## Fallback 行为

- `zones.json` 拉取失败 / 解析失败 / 校验失败 → `useZones` 返回内置最小 fallback
- topbar 顶部会显示「· zones.json 未生效」红字提示
- console.warn 输出原始错误，便于排查

## 设计要点

1. **几何与素材解耦**：换房间背景只需重画 zones.json，不动代码
2. **Idle 模式止血抖动**：`motion: 'idle'`（默认）让 sprite 钉在第 0 帧，从根本上消除 sprite sheet 帧间锚点漂移导致的"前后乱晃"
3. **泊松盘最小间距**：站立点之间默认 56px，避免叠人
4. **按面积加权抽站立区**：大区域更可能被选中，符合"地毯上人多过门口"的直觉

## 常见坑位

- **坐席矩形不要画太宽**：宽度 60-80px 即可（一个 sprite 宽度），否则坐姿会被推到不自然的位置
- **block 多边形要稍微大一圈**：包住家具的轮廓 + 几像素 padding，避免脚锚点落在家具边缘像素
- **门口/楼梯**：建议都标 block，不让 NPC 出现在视觉边界，避免半遮挡产生穿模感
