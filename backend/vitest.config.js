import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    include: ['tests/**/*.test.js'],
    testTimeout: 60000,
    hookTimeout: 120000, // first run downloads a MongoDB binary for mongodb-memory-server
  },
})
