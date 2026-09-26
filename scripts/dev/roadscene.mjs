// Dev: build a few roads via the test API and screenshot them.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
const out = process.argv[2];
const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-test', '--port', '4181', '--strictPort'], {
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
  await page.goto('http://localhost:4181/?paused=1');
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 60000 });
  const res = await page.evaluate(async () => {
    const g = window.__game;
    const s = await g.getState();
    const cz = s.highwayZ;
    const r = [];
    const b = (road, points) =>
      g.dispatch({ type: 'buildRoad', road, points }).then((x) => r.push(x.ok ? 'ok' : x.reason));
    await b('avenue', [
      { x: 24, z: cz },
      { x: 424, z: cz },
    ]);
    await b('street', [
      { x: 424, z: cz },
      { x: 560, z: cz },
      { x: 590, z: cz + 140 },
    ]);
    await b('street', [
      { x: 220, z: cz - 180 },
      { x: 220, z: cz + 200 },
    ]);
    await b('dirt', [
      { x: 320, z: cz },
      { x: 320, z: cz - 160 },
    ]);
    await b('street', [
      { x: 120, z: cz + 110 },
      { x: 219, z: cz + 110 },
    ]);
    await g.dispatch({
      type: 'zone',
      zone: 'R',
      area: {
        kind: 'brush',
        points: [
          { x: 120, z: cz + 60 },
          { x: 400, z: cz + 60 },
        ],
        radius: 45,
      },
    });
    await g.dispatch({
      type: 'zone',
      zone: 'C',
      area: {
        kind: 'brush',
        points: [
          { x: 120, z: cz - 40 },
          { x: 400, z: cz - 40 },
        ],
        radius: 25,
      },
    });
    await g.dispatch({
      type: 'zone',
      zone: 'I',
      area: {
        kind: 'brush',
        points: [
          { x: 250, z: cz - 120 },
          { x: 400, z: cz - 120 },
        ],
        radius: 30,
      },
    });
    g.setCamera({ x: 300, z: cz, distance: 420, yaw: 0.5, tilt: 0 });
    return r;
  });
  console.log(JSON.stringify(res));
  await page.evaluate(() => window.__game.waitFrames(2));
  await page.screenshot({ path: `${out}/roads-a.png` });
  await page.evaluate(async () => {
    const s = await window.__game.getState();
    window.__game.setCamera({ x: 220, z: s.highwayZ, distance: 90, yaw: 0.8, tilt: 0 });
  });
  await page.evaluate(() => window.__game.waitFrames(2));
  await page.screenshot({ path: `${out}/roads-b.png` });
  if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
} finally {
  await browser.close();
  process.kill(-server.pid);
}
