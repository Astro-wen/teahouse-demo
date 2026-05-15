import PixelTeaRoom from './components/PixelTeaRoom';

export default function App() {
  return (
    <main className="demo-page">
      <section className="demo-shell">
        <header className="demo-header">
          <div>
            <p className="demo-kicker">AIWorld · Pixel Lounge</p>
            <h1>像素茶水间 Demo</h1>
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
          <span>纯前端氛围展示，不依赖登录、不请求后端。</span>
          <span>点击空座位可坐下，左右皮椅会自动切换坐姿朝向。</span>
        </footer>
      </section>
    </main>
  );
}
