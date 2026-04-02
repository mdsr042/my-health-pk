import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const dataDir = path.resolve(process.cwd(), 'server/data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'my-health.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS app_store (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

function readJson(key) {
  const row = db.prepare('SELECT value FROM app_store WHERE key = ?').get(key);
  return row ? JSON.parse(row.value) : null;
}

function writeJson(key, value) {
  db.prepare(`
    INSERT INTO app_store (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run(key, JSON.stringify(value), new Date().toISOString());
}

export function readState() {
  return readJson('state');
}

export function writeState(state) {
  writeJson('state', state);
}

export function readSettings() {
  return readJson('settings');
}

export function writeSettings(settings) {
  writeJson('settings', settings);
}

