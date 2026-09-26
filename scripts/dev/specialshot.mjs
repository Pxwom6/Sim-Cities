// Dev: place every specialisation building (and a few modules) near a town and screenshot each.
// Usage: node scripts/dev/specialshot.mjs outDir [hour]
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
const out = process.argv[2];
const hour = Number(process.argv[3] ?? 13);
const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-test', '--port', '4186', '--strictPort'], {
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => console.log('pageerror', String(e)));
  page.on('console', (m) => m.type() === 'error' && console.log('console', m.text()));
  await page.goto('http://localhost:4186/?paused=1');
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 60000 });
  const placed = await page.evaluate(async (hour) => {
    const g = window.__game;
    const s = await g.getState();
    const c = { x: 24, z: s.highwayZ };
    await g.dispatch({ type: 'cheat', cheat: 'unlockAll' });
    await g.dispatch({ type: 'cheat', cheat: 'addMoney', amount: 2_000_000 });
    await g.dispatch({ type: 'buildRoad', road: 'avenue', points: [c, { x: c.x + 560, z: c.z }] });
    for (const x of [140, 280, 420])
      await g.dispatch({
        type: 'buildRoad',
        road: 'street',
        points: [
          { x, z: c.z - 220 },
          { x, z: c.z + 220 },
        ],
      });
    await g.dispatch({
      type: 'buildRoad',
      road: 'street',
      points: [
        { x: 60, z: c.z - 220 },
        { x: 560, z: c.z - 220 },
      ],
    });
    await g.dispatch({
      type: 'buildRoad',
      road: 'street',
      points: [
        { x: 60, z: c.z + 220 },
        { x: 560, z: c.z + 220 },
      ],
    });
    const out = {};
    for (const def of [
      'oilwell',
      'hotel',
      'clocktower',
      'wheel',
      'conservatory',
      'skyneedle',
      'grandarch',
      'freighthub',
      'university',
      'techpark',
      'firestation',
      'coal',
      'pump',
    ])
      out[def] = await g.placeCivic(def, def === 'oilwell' ? { x: 70, z: c.z + 20 } : { x: 300, z: c.z });
    const fs = out.firestation;
    if (fs) {
      await g.dispatch({ type: 'addModule', civic: fs, module: 'engineBay' });
    }
    const st = await g.getState();
    const now = ((st.tick + 420) % 1440) / 60;
    let d = (hour - now) * 60;
    if (d <= 0) d += 1440;
    await g.advance(Math.round(d));
    return out;
  }, hour);
  console.log(JSON.stringify(placed));
  const civics = await page.evaluate(() => window.__game.getCivics());
  for (const c of civics) {
    const dist = ['skyneedle', 'grandarch'].includes(c.def)
      ? 190
      : ['wheel', 'conservatory', 'freighthub', 'techpark'].includes(c.def)
        ? 120
        : 90;
    await page.evaluate(
      ([c, dist]) => window.__game.setCamera({ x: c.x, z: c.z, distance: dist, yaw: 0.5, tilt: 0.15 }),
      [c, dist],
    );
    await page.evaluate(() => window.__game.waitFrames(3));
    await page.screenshot({ path: `${out}/${c.def}.png` });
  }
} finally {
  await browser.close();
  server.kill();
}
