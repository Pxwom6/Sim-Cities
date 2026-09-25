// Dev helper: screenshot the test build from camera presets.
// Usage: node scripts/shots.mjs [outDir] [preset,preset,...] [query]
// Requires `npm run build:test` first. Starts its own preview server.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const outDir = process.argv[2] ?? 'docs/screenshots';
const presets = (process.argv[3] ?? 'overview,city,street,aerial').split(',');
const query = process.argv[4] ?? '';
mkdirSync(outDir, { recursive: true });

const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-test', '--port', '4180', '--strictPort'], {
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:4180/?paused=1${query}`);
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 60000 });
  for (const p of presets) {
    const [name, hour] = p.split('@');
    if (hour) {
      await page.evaluate(async (h) => {
        const s = await window.__game.getState();
        const now = ((s.tick + 420) % 1440) / 60;
        let d = (Number(h) - now) * 60;
        if (d <= 0) d += 1440;
        await window.__game.advance(Math.round(d));
      }, hour);
    }
    await page.evaluate((n) => window.__game.setCamera(n), name);
    await page.evaluate(() => window.__game.waitFrames(3));
    const t0 = Date.now();
    await page.screenshot({ path: `${outDir}/${name}${hour ? '-' + hour : ''}.png` });
    const st = await page.evaluate(() => window.__game.getState());
    console.log(`${p}: ${Date.now() - t0}ms calls=${st.renderStats.calls} tris=${st.renderStats.triangles}`);
  }
  if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
} finally {
  await browser.close();
  server.kill();
}
