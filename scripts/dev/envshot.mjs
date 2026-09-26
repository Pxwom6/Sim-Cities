// Dev: grow the served town, then screenshot smoke, air pollution and education maps.
// Usage: node scripts/dev/envshot.mjs outDir [ticks]
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
const out = process.argv[2];
const ticks = Number(process.argv[3] ?? 4320);
const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-test', '--port', '4187', '--strictPort'], {
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
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('http://localhost:4187/?paused=1');
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 60000 });
  await page.evaluate(async (ticks) => {
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
    await g.dispatch({ type: 'cheat', cheat: 'unlockAll' });
    await g.dispatch({ type: 'cheat', cheat: 'addMoney', amount: 200000 });
    for (const def of ['coal', 'pump', 'pump', 'treatment', 'landfill'])
      await g.placeCivic(def, { x: 300, z: c.z + 170 });
    for (const [def, x, dz] of [
      ['firestation', 120, -60],
      ['police', 312, -60],
      ['clinic', 216, 60],
      ['primary', 408, -110],
    ])
      await g.placeCivic(def, { x, z: c.z + dz });
    await g.placeCivic('busdepot', { x: 450, z: c.z - 150 });
    for (const [x, dz] of [
      [96, -80],
      [192, 70],
      [288, -80],
      [384, 70],
      [384, -100],
      [150, 6],
      [330, -6],
    ])
      console.log(JSON.stringify(await g.dispatch({ type: 'placeStop', x: c.x + x, z: c.z + dz })));
    await g.advance(ticks);
    // To 07:30 so the morning rush is on.
    const st = await g.getState();
    const now = (st.tick + 420) % 1440;
    let d = 450 - now;
    if (d <= 0) d += 1440;
    await g.advance(d);
    g.setSpeed(1);
  }, ticks);
  // Let cars spawn and drive for a few real seconds.
  for (let k = 0; k < 6; k++) await page.evaluate(() => window.__game.waitFrames(4));
  await page.evaluate(() => window.__game.setSpeed(0));
  const st = await page.evaluate(() => window.__game.getState());
  console.log(
    'pop',
    st.population,
    'cars',
    st.renderStats.cars,
    'calls',
    st.renderStats.calls,
    'tris',
    st.renderStats.triangles,
  );
  const cz = st.highwayZ;
  const snap = async (name, pose) => {
    await page.evaluate((p) => window.__game.setCamera(p), pose);
    await page.evaluate(() => window.__game.waitFrames(2));
    await page.screenshot({ path: `${out}/${name}.png` });
  };
  const coal = await page.evaluate(() => window.__game.getCivics().find((c) => c.def === 'coal'));
  await snap('env-smoke', { x: coal.x, z: coal.z + 60, distance: 260, yaw: 2.0, tilt: 0 });
  await page.evaluate(() => window.__game.setOverlay('airPollution'));
  await page.waitForTimeout(500);
  await snap('env-air', { x: 250, z: cz + 120, distance: 560, yaw: 0, tilt: 0.35 });
  await page.evaluate(() => window.__game.setOverlay('eduLevel'));
  await page.waitForTimeout(500);
  await snap('env-edu', { x: 250, z: cz, distance: 480, yaw: 0, tilt: 0.35 });
  await page.evaluate(() => window.__game.setOverlay(null));
  if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
} finally {
  await browser.close();
  process.kill(-server.pid);
}
