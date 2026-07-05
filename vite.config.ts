import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    tailwindcss(),
    figmaAssetResolver(),
    react(),
  ],
  // Vitest configuration — run with `pnpm test`
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  assetsInclude: ['**/*.svg', '**/*.csv'],
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('scheduler')) {
              return 'vendor-react';
            }
            if (id.includes('peerjs') || id.includes('peer')) {
              return 'vendor-p2p';
            }
            if (id.includes('@radix-ui') || id.includes('react-day-picker') || id.includes('cmdk') || id.includes('date-fns')) {
              return 'vendor-ui';
            }
            if (id.includes('firebase')) {
              if (id.includes('firestore')) return 'firebase-firestore';
              if (id.includes('auth')) return 'firebase-auth';
              if (id.includes('storage')) return 'firebase-storage';
              if (id.includes('messaging')) return 'firebase-messaging';
              return 'vendor-firebase';
            }
            if (id.includes('@capacitor')) {
              return 'vendor-capacitor';
            }
            if (id.includes('motion') || id.includes('framer-motion')) {
              return 'vendor-motion';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            if (id.includes('sql.js') || id.includes('sql-wasm')) {
              return 'vendor-sql';
            }
            if (id.includes('@sentry')) {
              return 'vendor-sentry';
            }
            if (id.includes('recharts')) {
              return 'vendor-recharts';
            }
          }
        },
      },
    },
  },
})
