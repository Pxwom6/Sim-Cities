import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // The long soak and playthrough tests run only with `npm run soak` and `npm run playthrough`.
  grepInvert: process.env.SOAK || process.env.PLAYTHROUGH ? undefined : /@soak|@playthrough/,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4174',
    viewport: { width: 1280, height: 800 },
    launchOptions: {
      args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  webServer: {
    command: 'npx vite preview --outDir dist-test --port 4174 --strictPort',
    port: 4174,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
