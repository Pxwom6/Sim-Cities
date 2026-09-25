// Dev: build bridges over the river and screenshot them. Usage: node scripts/dev/bridgeshot.mjs outDir
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
const out = process.argv[2];
const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-test', '--port', '4186', '--strictPort'], {
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
  await page.goto('http://localhost:4186/?paused=1');
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 60000 });
  const built = await page.evaluate(async () => {
    const g = window.__game;
    await g.dispatch({ type: 'cheat', cheat: 'addMoney', amount: 300000 });
    const res = [];
    for (const [z, road] of [
      [1500, 'avenue'],
      [1340, 'street'],
    ]) {
      let wx = -1;
      for (let x = 900; x < 2000; x += 4)
        if (g.heightAt(x, z) < 0.6) {
          wx = x;
          break;
        }
      let ex = wx;
      while (g.heightAt(ex, z) < 0.6) ex += 4;
      const r = await g.dispatch({
        type: 'buildRoad',
        road,
        points: [
          { x: wx - 140, z },
          { x: ex + 140, z },
        ],
      });
      res.push({ z, wx, ex, ok: r.ok, reason: r.ok ? '' : r.reason, cost: r.ok ? r.cost : 0 });
    }
    return res;
  });
  console.log(JSON.stringify(built));
  const b = built[0];
  const snap = async (name, pose) => {
    await page.evaluate((p) => window.__game.setCamera(p), pose);
    await page.evaluate(() => window.__game.waitFrames(2));
    await page.screenshot({ path: `${out}/${name}.png` });
  };
  const cx = (b.wx + b.ex) / 2;
  await snap('bridge-a', { x: cx, z: b.z, distance: 160, yaw: 0.9, tilt: -0.1 });
  await snap('bridge-b', { x: cx, z: b.z - 80, distance: 330, yaw: 2.4, tilt: 0 });
  await snap('bridge-c', { x: cx, z: b.z, distance: 60, yaw: 1.4, tilt: -0.2 });
  await snap('bridge-d', { x: cx, z: b.z + 10, distance: 90, yaw: 0.1, tilt: -0.25 });
  await snap('bridge-e', { x: b.wx - 40, z: b.z, distance: 70, yaw: 0.5, tilt: 0 });
  if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
} finally {
  await browser.close();
  server.kill();
}
