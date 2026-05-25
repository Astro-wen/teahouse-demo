# Pixel Tea Room Demo · v2

AIWorld 像素茶水间独立 Demo。

## 新版亮点（v2）

- **背景升级为视频**：早 / 午 / 晚 三段 1280×720 / 24fps / 15 秒循环视频
- **按本机时间自动切换**：6:00–16:00 早 / 16:00–19:00 下午 / 19:00–次日 6:00 晚
- **每次进入自动随机布场**：NPC 数量与位置 + "我"的位置都随机
- **吧台不放人**：NPC 与"我"只会出现在沙发 / 单人皮椅 / 站立点
- **演示按钮**：换一批 NPC / 换背景（手动切换早午晚）/ 换我的形象
- 不依赖登录、不请求后端

## 本地运行

```bash
pnpm install
pnpm dev
```

默认访问 `http://localhost:8082`。

## 构建

```bash
pnpm build
pnpm preview
```

## 目录结构

```txt
teahouse-demo/
├── src/
│   ├── App.tsx                                 # 页面外壳
│   ├── main.tsx                                # 入口
│   ├── components/PixelTeaRoom/
│   │   ├── index.tsx                           # 主组件（视频/随机/按钮）
│   │   ├── PixelAvatar.tsx                     # 像素小人 sprite 渲染
│   │   ├── seats.config.ts                     # 座位 / 站立点坐标
│   │   ├── random-layout.ts                    # 随机布场算法
│   │   └── day-slot.ts                         # 时段判定 (早/午/晚)
│   └── styles/
│       ├── ai-pixel-tea-room.css               # 组件样式
│       └── global.css                          # 页面全局样式
└── public/assets/teahouse-room/
    ├── meta.json                               # sprite 元数据
    ├── avatars/                                # 像素小人 sprite sheet
    │   ├── avatar-01-stand.png  / sit-left.png / sit-right.png
    │   └── avatar-03-stand.png  / sit-left.png / sit-right.png
    └── bg/                                     # 三段时段背景视频 + poster
        ├── morning.mp4   / morning-poster.jpg
        ├── afternoon.mp4 / afternoon-poster.jpg
        └── night.mp4     / night-poster.jpg
```

## 时间段切换规则

| 本机时间 | 时段 | 视频 |
|---|---|---|
| 06:00 – 15:59 | morning（白天） | `bg/morning.mp4` |
| 16:00 – 18:59 | afternoon（下午） | `bg/afternoon.mp4` |
| 19:00 – 次日 05:59 | night（晚上） | `bg/night.mp4` |

每分钟检查一次本机时间，自动跨段切换。底部"换背景"按钮可手动覆盖（顶部状态显示"手动"），左下"跟随本机"按钮可恢复自动。

## 随机布场规则

每次进入页面 / 点击「换一批 NPC」/「换我的形象」时，从下面这个池子里抽样：

- 4 个沙发位（左 / 中左 / 中右 / 拐角）
- 2 个单人皮椅（左 / 右）
- 5 个站立点（售货机前 / 茶几地毯前 / 窗边 / 吧台前 / 花盆旁）

NPC 数量在 [3, 6] 之间随机；"我"占据其中一个位置。**吧台凳永远不放人**。

## 视频素材规格

三段视频统一为 1280×720 / 24fps / 15.0s / GOP=360 / yuv420p / +faststart，循环用「监听 ended → 重置 currentTime」避免末帧→首帧闪烁。

如需重新转码，原始素材在 `~/Documents/assets/people/`：

```bash
cd public/assets/teahouse-room
for slot in morning afternoon night; do
  ffmpeg -y -i ~/Documents/assets/people/${slot}.mp4 \
    -t 15.0 -vf "scale=1280:720:flags=lanczos,fps=24" \
    -c:v libx264 -preset medium -crf 23 \
    -g 360 -keyint_min 360 -sc_threshold 0 \
    -pix_fmt yuv420p -movflags +faststart -an \
    bg/${slot}.mp4
  ffmpeg -y -i bg/${slot}.mp4 -vframes 1 -q:v 3 bg/${slot}-poster.jpg
done
```
