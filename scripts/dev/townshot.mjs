// Dev: grow the planned town and screenshot it. Usage: node scripts/dev/townshot.mjs outDir [ticks] [hour]
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
const out = process.argv[2];
const ticks = Number(process.argv[3] ?? 2880);
const hour = process.argv[4];
const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-test', '--port', '4182', '--strictPort'], {
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
  await page.goto('http://localhost:4182/?paused=1');
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 60000 });
  await page.evaluate(
    async ([ticks, hour]) => {
      const g = window.__game;
      const s = await g.getState();
      const c = { x: 24, z: s.highwayZ };
      const len = 480;
      await g.dispatch({ type: 'buildRoad', road: 'avenue', points: [c, { x: c.x + len, z: c.z }] });
      for (let k = 1; k <= 4; k++) {
        const x = c.x + (len * k) / 5;
        await g.dispatch({
          type: 'buildRoad',
          road: 'street',
          points: [
            { x, z: c.z - 160 },
            { x, z: c.z + 160 },
          ],
        });
      }
      const brush = (zone, a, b, radius) =>
        g.dispatch({ type: 'zone', zone, area: { kind: 'brush', points: [a, b], radius } });
      await brush('R', { x: c.x + 20, z: c.z - 100 }, { x: c.x + len, z: c.z - 100 }, 70);
      await brush('C', { x: c.x + 20, z: c.z + 20 }, { x: c.x + len, z: c.z + 20 }, 22);
      await brush('R', { x: c.x + 20, z: c.z + 90 }, { x: c.x + len / 2, z: c.z + 90 }, 50);
      await brush('I', { x: c.x + len / 2 + 20, z: c.z + 110 }, { x: c.x + len, z: c.z + 110 }, 50);
      await g.advance(ticks);
      if (hour) {
        const st = await g.getState();
        const now = ((st.tick + 420) % 1440) / 60;
        let d = (Number(hour) - now) * 60;
        if (d <= 0) d += 1440;
        await g.advance(Math.round(d));
      }
    },
    [ticks, hour],
  );
  const st = await page.evaluate(() => window.__game.getState());
  console.log('pop', st.population, 'buildings', st.buildings);
  const cz = st.highwayZ;
  const shots = [
    ['town-a', { x: 260, z: cz, distance: 520, yaw: 0.5, tilt: 0 }],
    ['town-b', { x: 150, z: cz - 60, distance: 110, yaw: 0.8, tilt: 0 }],
    ['town-c', { x: 400, z: cz + 60, distance: 150, yaw: -0.6, tilt: 0 }],
  ];
  for (const [name, pose] of shots) {
    await page.evaluate((p) => window.__game.setCamera(p), pose);
    await page.evaluate(() => window.__game.waitFrames(2));
    await page.screenshot({ path: `${out}/${name}${hour ? '-' + hour : ''}.png` });
  }
  const r = await page.evaluate(() => window.__game.getState());
  console.log('calls', r.renderStats.calls, 'tris', r.renderStats.triangles);
  if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
} finally {
  await browser.close();
  server.kill();
}
