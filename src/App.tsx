import PixelTeaRoom from './components/PixelTeaRoom';

export default function App() {
  return (
    <main className="demo-page">
      <section className="demo-shell">
        <header className="demo-header">
          <div>
            <p className="demo-kicker">AIWorld · Pixel Lounge</p>
            <h1>像素茶水间 Demo · v2</h1>
          </div>
          <a
            className="demo-link"
            href="https://github.com/Astro-wen/teahouse-demo"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        </header>

        <PixelTeaRoom />

        <footer className="demo-footer">
          <span>背景按本机时间在 早 / 午 / 晚 三段视频间自动切换。</span>
          <span>每次刷新随机生成 NPC 与"我"的位置；右下三个按钮可演示。</span>
        </footer>
      </section>
    </main>
  );
}
