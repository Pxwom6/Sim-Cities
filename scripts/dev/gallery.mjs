// Dev: screenshot rows of zoned building models. Usage: node scripts/dev/gallery.mjs outDir [R|C|I] [hour]
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
const out = process.argv[2];
const zone = process.argv[3] ?? 'R';
const hour = Number(process.argv[4] ?? 13);
const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-test', '--port', '4184', '--strictPort'], {
  stdio: 'ignore',
  // Its own process group, so the preview server (a child of npx) goes down with it.
  detached: true,
});
await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('http://localhost:4184/?paused=1');
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 60000 });
  const at = { x: 40, z: 360 };
  await page.evaluate(
    async ([zone, hour, at]) => {
      const g = window.__game;
      const st = await g.getState();
      const now = ((st.tick + 420) % 1440) / 60;
      let d = (hour - now) * 60;
      if (d < 0) d += 1440;
      if (d > 0) await g.advance(Math.round(d));
      const rows = [];
      for (const density of [0, 1])
        for (const wealth of [0, 1, 2])
          for (const level of [1, 2, 3]) rows.push(`${zone}${density}${wealth}${level}`);
      g.showGallery(rows, at, 8);
    },
    [zone, hour, at],
  );
  const shots = [
    ['a', { x: at.x + 90, z: at.z + 90, distance: 260, yaw: 0.35, tilt: 0 }],
    ['b', { x: at.x + 90, z: at.z + 260, distance: 260, yaw: 0.35, tilt: 0 }],
    ['c', { x: at.x + 60, z: at.z + 40, distance: 110, yaw: 0.2, tilt: 0 }],
  ];
  for (const [name, pose] of shots) {
    await page.evaluate((p) => window.__game.setCamera(p), pose);
    await page.evaluate(() => window.__game.waitFrames(3));
    await page.screenshot({ path: `${out}/gallery-${zone}-${name}-${hour}.png` });
  }
  if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
} finally {
  await browser.close();
  process.kill(-server.pid);
}
