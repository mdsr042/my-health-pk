import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function parseEnvFile(content) {
  const result = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

export function loadDesktopEnv(cwd = process.cwd()) {
  const files = [
    path.join(cwd, '.env.desktop.local'),
    path.join(cwd, '.env.desktop'),
  ];

  const loaded = {};
  for (const filePath of files) {
    if (!fs.existsSync(filePath)) continue;
    const parsed = parseEnvFile(fs.readFileSync(filePath, 'utf8'));
    Object.assign(loaded, parsed);
  }

  return loaded;
}

export function getDesktopEnv(cwd = process.cwd()) {
  const fileEnv = loadDesktopEnv(cwd);
  const username = os.userInfo().username;
  const defaults = {
    DATABASE_URL: `postgresql://${username}@localhost:5432/my_health`,
    JWT_SECRET: 'dev-secret',
    ADMIN_EMAIL: 'admin@myhealth.pk',
    ADMIN_PASSWORD: 'admin123',
    API_PORT: '4001',
    VITE_PORT: '8080',
    VITE_HOST: '127.0.0.1',
  };

  return {
    ...defaults,
    ...fileEnv,
    ...Object.fromEntries(
      Object.entries(process.env).filter(([, value]) => value != null)
    ),
  };
}

export function getMissingDesktopEnv(env) {
  return ['DATABASE_URL', 'JWT_SECRET', 'ADMIN_EMAIL', 'ADMIN_PASSWORD']
    .filter(key => !String(env[key] || '').trim());
}

