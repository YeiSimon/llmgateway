import { defineConfig, devices } from "@playwright/test";

const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const mockApiUrl = "http://localhost:4012";

export default defineConfig({
	testDir: "./tests/ui",
	fullyParallel: false,
	workers: 1,
	use: {
		baseURL: "http://localhost:3002",
		trace: "on-first-retry",
	},
	projects: [
		{
			name: "chromium",
			use: {
				...devices["Desktop Chrome"],
				...(chromiumExecutablePath
					? { launchOptions: { executablePath: chromiumExecutablePath } }
					: {}),
				viewport: { width: 1440, height: 900 },
			},
		},
		{
			name: "mobile-chromium",
			use: {
				...devices["Pixel 5"],
				...(chromiumExecutablePath
					? { launchOptions: { executablePath: chromiumExecutablePath } }
					: {}),
				viewport: { width: 390, height: 844 },
			},
		},
	],
	webServer: [
		{
			command: "pnpm exec tsx tests/ui/helpers/mock-api-server.ts",
			url: mockApiUrl,
			reuseExistingServer: !process.env.CI,
			timeout: 30_000,
		},
		{
			command: `API_URL=${mockApiUrl} API_BACKEND_URL=${mockApiUrl} pnpm --filter ui dev`,
			url: "http://localhost:3002",
			reuseExistingServer: !process.env.CI,
			timeout: 120_000,
		},
	],
});
