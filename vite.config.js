import { defineConfig } from 'vite';

// LocAR + three.js は素直な ESM のため、Vite が普通にバンドルできる
// （A-Frame/AR.js のような UMD 事前バンドルの 504 問題は起きない）。
//
// dev は HTTP のまま。モバイルのカメラ/位置情報に必要な HTTPS は
// cloudflared 等のトンネルが終端する（証明書のインストール不要）:
//   ターミナル1: npm run dev
//   ターミナル2: cloudflared tunnel --url http://localhost:5173
//
// base は相対にして、GitHub Pages のサブパスでもトンネルでも動くようにする。
export default defineConfig({
  base: './',
  server: {
    host: true, // LAN 上のスマホからアクセスできるよう 0.0.0.0 で待ち受け
    port: 5173,
    cors: true,
    // トンネルのランダムなサブドメインを許可（Vite のホストチェック回避）。
    allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.ngrok.io'],
  },
  build: {
    target: 'es2019',
  },
});
