import { resolve } from 'path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

// Dev-исключение для CSP: Vite dev-сервер и HMR (@vitejs/plugin-react) требуют
// инлайн-преамбулы, несовместимой с `script-src 'self'` из meta-тега index.html.
// Плагин вырезает meta только при serve (ctx.server), прод-сборка не меняется.
function stripCspMetaInDev(): Plugin {
  return {
    name: 'systemdeck-strip-csp-meta-in-dev',
    transformIndexHtml(html, ctx) {
      if (ctx.server) {
        return html.replace(/<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>\s*/i, '');
      }
      return html;
    },
  };
}

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
  },
  preload: {
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          // Sandboxed preload не поддерживает ESM (Electron docs), поэтому — CJS (.cjs). См. ADR 0007.
          format: 'cjs',
        },
      },
    },
  },
  renderer: {
    // Явный IPv4-loopback вместо 'localhost': Node (dns-порядок verbatim) резолвит
    // localhost в ::1, Vite слушает только IPv6-loopback, а Chromium/Electron
    // стартует с 127.0.0.1 → ERR_CONNECTION_REFUSED в dev. Кроме того, 127.0.0.1
    // не раскрывает dev-сервер в локальную сеть (best practice, electron-best-practices).
    server: {
      host: '127.0.0.1',
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared'),
      },
    },
    plugins: [react(), stripCspMetaInDev()],
  },
});
