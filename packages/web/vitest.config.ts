import { defineConfig } from 'vitest/config';

// Tests cover the pure logic in src/lib, so they run without the app's Vite
// plugins (the Tamagui compiler doesn't load under Vitest).
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
