import { defineConfig } from 'vite'
import path from 'node:path'
import fs from 'node:fs'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer/src'),
    },
  },
  plugins: [
    react(),
    electron([
      {
        entry: 'src/main/index.ts',
        vite: {
          build: {
            outDir: 'dist-electron/main',
            rollupOptions: {
              external: ['node-pty'],
            },
          },
        },
      },
    ]),
    {
      name: 'copy-preload-cjs',
      buildStart() {
        const outDir = path.resolve(__dirname, 'dist-electron/preload');
        fs.mkdirSync(outDir, { recursive: true });
        fs.copyFileSync(
          path.resolve(__dirname, 'src/preload/index.cjs'),
          path.join(outDir, 'index.cjs')
        );
      },
      closeBundle() {
        const outDir = path.resolve(__dirname, 'dist-electron/preload');
        fs.mkdirSync(outDir, { recursive: true });
        fs.copyFileSync(
          path.resolve(__dirname, 'src/preload/index.cjs'),
          path.join(outDir, 'index.cjs')
        );
      },
    },
    renderer(),
  ],
})
