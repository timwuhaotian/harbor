import { defineConfig } from 'vite';

export default defineConfig({
  clearScreen: false,
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
  },
  server: {
    strictPort: true,
    port: 5173,
  },
});
