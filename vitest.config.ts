import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Mobile modules are testable here only when they import nothing from
    // React Native or expo-router — this environment is plain node.
    include: ['src/**/*.test.ts', 'mobile/src/**/*.test.ts'],
    environment: 'node',
  },
});
