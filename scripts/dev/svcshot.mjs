// Dev: grow a served town with services, then screenshot service buildings, a coverage map and a fire.
// Usage: node scripts/dev/svcshot.mjs outDir [ticks]
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
const out = process.argv[2];
const ticks = Number(process.argv[3] ?? 2880);
const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-test', '--port', '4183', '--strictPort'], {
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
  await page.goto('http://localhost:4183/?paused=1');
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 60000 });
  const info = await page.evaluate(async (ticks) => {
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
    const placed = {};
    for (const [def, x, dz] of [
      ['firestation', 120, -60],
      ['police', 312, -60],
      ['clinic', 216, 60],
      ['primary', 408, -110],
      ['park_small', 216, -110],
      ['plaza', 120, 40],
      ['library', 312, 60],
      ['hospital', 420, 175],
      ['highschool', 520, 0],
      ['park_large', 60, -150],
      ['university', 200, 200],
    ])
      placed[def] = await g.placeCivic(def, { x, z: c.z + dz });
    await g.advance(ticks);
    return placed;
  }, ticks);
  console.log('placed', JSON.stringify(info));
  const st = await page.evaluate(() => window.__game.getState());
  console.log('pop', st.population, 'buildings', st.buildings, 'approval', st.approval);
  const cz = st.highwayZ;
  const snap = async (name, pose) => {
    await page.evaluate((p) => window.__game.setCamera(p), pose);
    await page.evaluate(() => window.__game.waitFrames(3));
    await page.screenshot({ path: `${out}/${name}.png` });
  };
  await snap('svc-town', { x: 260, z: cz, distance: 560, yaw: 0.5, tilt: 0 });
  const civics = await page.evaluate(() => window.__game.getCivics());
  for (const c of civics) {
    if (
      !process.env.EACH ||
      ![
        'firestation',
        'police',
        'clinic',
        'primary',
        'park_small',
        'plaza',
        'library',
        'hospital',
        'highschool',
        'park_large',
        'university',
      ].includes(c.def)
    )
      continue;
    for (const [k, yaw] of [
      [0, 0.7],
      [1, 0.7 + Math.PI],
    ])
      await snap(`b-${c.def}-${k}`, { x: c.x, z: c.z, distance: 75, yaw, tilt: 0 });
  }
  await snap('svc-close-a', { x: 150, z: cz - 40, distance: 150, yaw: 0.3, tilt: 0 });
  await snap('svc-close-b', { x: 330, z: cz - 40, distance: 150, yaw: -0.4, tilt: 0 });
  await snap('svc-close-c', { x: 260, z: cz + 120, distance: 220, yaw: 2.6, tilt: 0 });
  for (const map of ['fire', 'police', 'education', 'happiness', 'crime']) {
    await page.evaluate((m) => window.__game.setOverlay(m), map);
    await page.waitForTimeout(400);
    await snap(`map-${map}`, { x: 270, z: cz + 10, distance: 430, yaw: 0, tilt: 0.35 });
  }
  await page.evaluate(() => window.__game.setOverlay(null));
  // A fire near the fire station.
  const target = await page.evaluate((cz) => {
    const list = window.__game.getBuildings().filter((b) => b.state === 1);
    const d = (b) => Math.hypot(b.x - 260, b.z - (cz - 70));
    return list.sort((a, b) => d(a) - d(b))[0];
  }, cz);
  const r = await page.evaluate(
    (id) => window.__game.dispatch({ type: 'cheat', cheat: 'ignite', id }),
    target.id,
  );
  console.log('ignite', target, JSON.stringify(r));
  await page.evaluate((t) => window.__game.advance(t), Number(process.env.FIRE_T ?? 60));
  await page.evaluate(() => window.__game.waitFrames(2));
  const st2 = await page.evaluate(() => window.__game.getState());
  console.log('fires', st2.renderStats.fires, 'vehicles', st2.renderStats.vehicles);
  await snap('fire-a', { x: target.x, z: target.z, distance: 110, yaw: 0.6, tilt: 0 });
  await snap('fire-b', { x: target.x, z: target.z, distance: 260, yaw: 0.6, tilt: 0 });
  console.log('calls', st2.renderStats.calls, 'tris', st2.renderStats.triangles);
  if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
} finally {
  await browser.close();
  process.kill(-server.pid);
}
