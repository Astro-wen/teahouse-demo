import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 部署到 GitHub Pages 时，站点会挂在 https://<user>.github.io/teahouse-demo/ 下，
// 因此需要把 base 设为 '/teahouse-demo/'，否则 JS / 图片 / 视频 都会 404。
// 本地 dev / preview 时用 '/'。
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/teahouse-demo/' : '/',
  plugins: [react()],
}));
