# Pixel Tea Room Demo

AIWorld 像素茶水间独立 Demo。

## 功能

- 1280×720 像素茶水间循环视频背景
- 两套像素小人形象：程序员男、粉发女孩
- 站立 / 朝左坐 / 朝右坐 sprite sheet 动画
- 纯前端座位交互：点击空座位直接坐下
- 左右皮椅按座位方向自动切换坐姿朝向
- 固定 NPC 占位、空闲座位状态、换形象、回到门口
- 不依赖登录、不请求后端

## 本地运行

```bash
pnpm install
pnpm dev
```

默认访问：

```txt
http://localhost:8082
```

## 构建

```bash
pnpm build
pnpm preview
```

## 目录

```txt
src/components/PixelTeaRoom/      # 像素茶水间组件
src/styles/ai-pixel-tea-room.css  # 组件样式
public/assets/teahouse-room/      # 背景视频、poster、小人 sprite、meta
```

## 素材说明

所有运行所需素材已放入 `public/assets/teahouse-room/`：

- `background.mp4`：循环背景视频
- `background-poster.jpg`：视频加载前占位图
- `avatar-01-*`：程序员男 sprite
- `avatar-03-*`：粉发女孩 sprite
- `meta.json`：sprite 尺寸记录
- `room-base.png`：静态房间备用图

## 交互说明

- 点击沙发 / 皮椅 / 吧台凳可坐下
- 已占用座位不可坐
- 点击「换个形象」随机切换人物并回到门口
- 点击「回到门口」复位
