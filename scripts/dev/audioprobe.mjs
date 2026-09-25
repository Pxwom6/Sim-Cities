// Dev: render every sound offline in Chromium and print levels, then check the live engine starts.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-test', '--port', '4183', '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('http://localhost:4183/?paused=1');
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 60000 });
  const r = await page.evaluate(() => window.__game.renderSounds());
  for (const c of r) console.log(c.name.padEnd(10), 'peak', c.peak.toFixed(3), 'rms', c.rms.toFixed(4), 'finite', c.finite, 'dur', c.seconds.toFixed(2));
  await page.mouse.click(640, 400);
  await page.getByTestId('menu-button').click();
  await page.waitForTimeout(1500);
  console.log(JSON.stringify(await page.evaluate(() => window.__game.getAudio())));
  if (errors.length) console.log('ERRORS', errors);
} finally { await browser.close(); server.kill(); }
