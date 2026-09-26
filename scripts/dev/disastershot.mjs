// Dev: set off each disaster over a grown town and screenshot it.
// Usage: node scripts/dev/disastershot.mjs outDir [quake,tornado,meteor,flood]
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
const out = process.argv[2];
const which = (process.argv[3] ?? 'quake,tornado,meteor,flood').split(',');
const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-test', '--port', '4185', '--strictPort'], {
  stdio: 'ignore',
  // Its own process group, so the preview server (a child of npx) goes down with it.
  detached: true,
});
await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});

async function open(query) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => console.log('pageerror', String(e)));
  page.on('console', (m) => m.type() === 'error' && console.log('console', m.text()));
  await page.goto(`http://localhost:4185/?paused=1${query}`);
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 60000 });
  return page;
}

async function town(page) {
  return page.evaluate(async () => {
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
    for (const def of ['coal', 'pump', 'pump', 'treatment', 'landfill', 'firestation', 'clinic'])
      await g.placeCivic(def, { x: 300, z: c.z + 170 });
    await g.advance(1440 * 2);
    return c.z;
  });
}

async function shot(page, name, pose, frames = 3) {
  if (pose) await page.evaluate((p) => window.__game.setCamera(p), pose);
  await page.evaluate((n) => window.__game.waitFrames(n), frames);
  await page.screenshot({ path: `${out}/${name}.png` });
  const st = await page.evaluate(() => window.__game.getState());
  console.log(name, JSON.stringify(st.renderStats.disasters), 'pop', st.population);
}

try {
  if (which.includes('quake')) {
    const page = await open('');
    const cz = await town(page);
    await page.evaluate(
      (cz) =>
        window.__game.dispatch({ type: 'disaster', kind: 'earthquake', at: { x: 250, z: cz }, size: 7 }),
      cz,
    );
    await page.evaluate(() => window.__game.advance(3));
    await shot(page, 'quake-dust', { x: 250, z: cz, distance: 330, yaw: 0.6, tilt: 0.05 }, 4);
    await page.evaluate(() => window.__game.advance(90));
    await shot(page, 'quake-after', { x: 250, z: cz, distance: 300, yaw: 0.6, tilt: 0.1 });
    await page.close();
  }
  if (which.includes('tornado')) {
    const page = await open('');
    const cz = await town(page);
    await page.evaluate(
      (cz) =>
        window.__game.dispatch({
          type: 'disaster',
          kind: 'tornado',
          at: { x: 700, z: cz - 40 },
          size: 28,
          heading: Math.PI,
        }),
      cz,
    );
    await page.evaluate(() => window.__game.advance(12));
    await shot(page, 'tornado', { x: 420, z: cz - 20, distance: 420, yaw: 0.3, tilt: -0.05 }, 6);
    await page.evaluate(() => window.__game.advance(20));
    await shot(page, 'tornado-town', { x: 300, z: cz - 20, distance: 380, yaw: 0.3, tilt: -0.05 }, 6);
    await page.close();
  }
  if (which.includes('meteor')) {
    const page = await open('');
    const cz = await town(page);
    await page.evaluate(
      (cz) =>
        window.__game.dispatch({ type: 'disaster', kind: 'meteor', at: { x: 330, z: cz - 90 }, size: 40 }),
      cz,
    );
    await page.evaluate(() => window.__game.advance(20));
    await shot(page, 'meteor-fall', { x: 330, z: cz - 90, distance: 950, yaw: 0.9, tilt: -0.25 }, 3);
    await page.evaluate(() => window.__game.advance(12));
    await shot(page, 'meteor-impact', null, 3);
    await page.evaluate(() => window.__game.advance(240));
    await shot(page, 'meteor-crater', { x: 330, z: cz - 90, distance: 220, yaw: 0.9, tilt: 0.1 }, 90);
    await page.close();
  }
  if (which.includes('flood')) {
    const page = await open('&seed=b&preset=lakes');
    await page.evaluate(async () => {
      const g = window.__game;
      await g.dispatch({ type: 'cheat', cheat: 'unlockAll' });
      await g.dispatch({ type: 'cheat', cheat: 'addMoney', amount: 400000 });
      const c = { x: 24, z: 1100 };
      const end = { x: 618, z: 969 };
      await g.dispatch({ type: 'buildRoad', road: 'avenue', points: [c, end] });
      await g.dispatch({
        type: 'buildRoad',
        road: 'street',
        points: [
          { x: 650, z: 1115 },
          { x: 586, z: 822 },
        ],
      });
      await g.dispatch({
        type: 'zone',
        zone: 'R',
        area: { kind: 'brush', points: [{ x: 440, z: 1008 }, end], radius: 40 },
      });
      await g.dispatch({
        type: 'zone',
        zone: 'R',
        area: {
          kind: 'brush',
          points: [
            { x: 650, z: 1115 },
            { x: 586, z: 822 },
          ],
          radius: 40,
        },
      });
      for (const def of ['coal', 'pump', 'pump', 'treatment', 'landfill'])
        await g.placeCivic(def, { x: 200, z: 1060 });
      await g.advance(1440 * 2);
      const r = await g.dispatch({ type: 'disaster', kind: 'flood', at: end });
      if (!r.ok) console.error('flood failed', r.reason);
      await g.advance(60 * 6);
    });
    await shot(page, 'flood', { x: 600, z: 980, distance: 380, yaw: 2.2, tilt: 0.05 }, 4);
    await shot(page, 'flood-close', { x: 620, z: 980, distance: 180, yaw: 2.4, tilt: 0.05 }, 4);
    await page.close();
  }
} finally {
  await browser.close();
  process.kill(-server.pid);
}
