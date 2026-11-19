import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Разрешаем пакеты @chatbot/<name> напрямую в исходники TypeScript
    alias: [
      {
        find: /^@chatbot\/([^/]+)$/,
        replacement: path.resolve(currentDir, '../../packages/$1/src/index.ts'),
      },
    ],
  },
  server: {
    port: 5173,
  },
});
