/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS-скрипт запуска */
// Запускает prisma с переменными из корневого .env (prisma читает .env только из cwd пакета)
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// Минимальный разбор KEY=VALUE; уже заданные переменные окружения не перезаписываются
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || line.trim().startsWith('#')) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}

loadEnv(path.resolve(__dirname, '../../../.env'));

const bin = require.resolve('prisma/build/index.js');
const result = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: path.resolve(__dirname, '..'),
});
process.exit(result.status ?? 1);
