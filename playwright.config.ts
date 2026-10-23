import { defineConfig, devices } from '@playwright/test';

const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = externalBaseURL || 'http://127.0.0.1:5173';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 3,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL, channel: 'chromium', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 960 } },
    },
    { name: 'tablet', use: { ...devices['iPad Mini'], defaultBrowserType: 'chromium' } },
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
  ],
  webServer: externalBaseURL
    ? undefined
    : [
        {
          command: 'npm run dev:backend',
          url: 'http://127.0.0.1:3000/api/health',
          timeout: 60_000,
          reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === '1',
        },
        {
          command: 'npm run dev:frontend',
          url: baseURL,
          timeout: 60_000,
          reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === '1',
        },
      ],
});
