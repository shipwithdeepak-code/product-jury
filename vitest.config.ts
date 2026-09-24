import { defineConfig } from 'vitest/config';

/**
 * Stage 1 · The test runner.
 *
 * The suites are the thirteen groups the Stage 1 brief names. They are
 * integrity tests: each one asserts that the product does NOT produce something
 * when it has no basis for it.
 *
 * `PJ_PROVIDER_TIMEOUT_MS` is short here so the timeout suite exercises the
 * real code path rather than a mocked clock. The production default (30s) is
 * read from the same variable in `server/geminiClient.ts`.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    env: {
      PJ_PROVIDER_TIMEOUT_MS: '80',
      GEMINI_API_KEY: 'test-key-not-used-by-the-stub',
    },
    testTimeout: 20_000,
  },
});
