import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    strictPort: false,
  },
  build: {
    target: ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari13'],
    minify: 'terser',
    terserOptions: {
      compress: {
        passes: 2,
      },
      mangle: true,
    },
    cssCodeSplit: false,
    sourcemap: false,
    outDir: 'dist',
    rollupOptions: {
      external: (id) => id.startsWith('@capacitor/') || id === '@capacitor/core',
      output: {
        manualChunks: undefined,
      },
    },
  },
});
