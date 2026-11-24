import { defineConfig } from 'vite'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import react from '@vitejs/plugin-react'
import { THEME_IDS } from './src/shared/types'

function extractPreloadKeys(source: string): string[] {
  const start = source.indexOf('exposeInMainWorld(')
  const body = start >= 0 ? source.slice(start) : source
  return [...body.matchAll(/^\s{2}([A-Za-z0-9_]+)\s*:/gm)].map((m) => m[1]).sort()
}

function verifyThemeWhitelist(rootDir: string) {
  const htmlFile = path.resolve(rootDir, 'index.html')
  const html = fs.readFileSync(htmlFile, 'utf-8')
  const match = html.match(/\[([^\]]+)\]\.indexOf\(theme\)/)
  if (!match) throw new Error('[theme-sync] Could not locate inline theme whitelist in index.html')
  const htmlThemes = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort()
  const sharedThemes = [...THEME_IDS].sort()
  if (htmlThemes.join(',') !== sharedThemes.join(',')) {
    throw new Error(`[theme-sync] index.html theme whitelist does not match THEME_IDS: html=[${htmlThemes.join(', ')}], shared=[${sharedThemes.join(', ')}]`)
  }
}

function verifyAndCopyPreload(rootDir: string) {
  verifyThemeWhitelist(rootDir)
  const cjsFile = path.resolve(rootDir, 'src/preload/index.cjs')
  const tsFile = path.resolve(rootDir, 'src/preload/index.ts')
  const cjsKeys = extractPreloadKeys(fs.readFileSync(cjsFile, 'utf-8'))
  const tsKeys = extractPreloadKeys(fs.readFileSync(tsFile, 'utf-8'))
  if (cjsKeys.join(',') !== tsKeys.join(',')) {
    const onlyCjs = cjsKeys.filter((k) => !tsKeys.includes(k))
    const onlyTs = tsKeys.filter((k) => !cjsKeys.includes(k))
    throw new Error(`[preload-sync] src/preload/index.cjs and index.ts keys differ: onlyInCjs=[${onlyCjs.join(', ')}], onlyInTs=[${onlyTs.join(', ')}]`)
  }
  const outDir = path.resolve(rootDir, 'dist-electron/preload')
  fs.mkdirSync(outDir, { recursive: true })
  fs.copyFileSync(cjsFile, path.join(outDir, 'index.cjs'))
}

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
      name: 'copy-preload-and-csp',
      buildStart() {
        verifyAndCopyPreload(__dirname)
      },
      closeBundle() {
        verifyAndCopyPreload(__dirname)
      },
      transformIndexHtml: {
        order: 'post',
        handler(html, ctx) {
          // 仅在生产构建产物注入 CSP（开发模式下保留 Vite HMR / React Fast Refresh 内联脚本）
          if (!ctx.bundle) return html
          const hashes: string[] = []
          for (const match of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
            // 浏览器解析 HTML 时先把 CRLF / CR 统一成 LF 再算哈希；Windows 上检出的 index.html 是 CRLF，须先归一化
            const digest = crypto.createHash('sha256').update(match[1].replace(/\r\n?/g, '\n'), 'utf8').digest('base64')
            hashes.push(`'sha256-${digest}'`)
          }
          const scriptSrc = ["'self'", ...hashes].join(' ')
          const policy = [
            "default-src 'self'",
            `script-src ${scriptSrc}`,
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "media-src 'self' oneai-music: https: http: data: blob:",
            "font-src 'self' data:",
            "connect-src 'self' oneai-music:",
            "worker-src 'self' blob:",
            "object-src 'none'",
            "base-uri 'self'",
          ].join('; ')
          return html.replace(
            '<meta charset="UTF-8" />',
            `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`
          )
        },
      },
    },
    renderer(),
  ],
})
