/**
 * Jest configuration for SMS Reminders
 *
 * Uses Node's experimental VM modules for ESM support (package.json has "type": "module").
 * Run with: node --experimental-vm-modules node_modules/.bin/jest
 * Or:        npm test
 *
 * Test layers:
 *   unit/        Fast, no I/O — run on every commit via CI
 *   integration/ Requires local Supabase running — run manually or in CI with services
 *   e2e/         Full end-to-end — run manually against staging
 */

export default {
  // Use Node test environment (no DOM needed — this is a backend service)
  testEnvironment: "node",

  // Match all test files in the tests/ folder
  testMatch: [
    "<rootDir>/tests/unit/**/*.test.js",
    "<rootDir>/tests/integration/**/*.test.js",
    "<rootDir>/tests/e2e/**/*.test.js",
  ],

  // No transform needed — native ESM with Node 20
  transform: {},

  // How long a single test can run before timing out
  testTimeout: 10_000,

  // Integration and e2e tests talk to local Supabase — give them more time
  // Override per-file with: jest.setTimeout(30_000)

  // Show individual test names in output
  verbose: true,

  // Coverage settings (used when running: npm run test:coverage)
  collectCoverageFrom: [
    "scripts/**/*.js",
    "!scripts/seed.js",         // seed is a utility, not business logic
    "!scripts/Setup-Local.ps1",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov"],

  // Global setup / teardown (uncomment when you add integration tests)
  // globalSetup: "./tests/helpers/globalSetup.js",
  // globalTeardown: "./tests/helpers/globalTeardown.js",
};
