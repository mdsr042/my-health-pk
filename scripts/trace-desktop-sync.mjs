import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { Client } from 'pg';
import { getDesktopEnv } from './desktop-env.mjs';

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return '';
  return process.argv[index + 1] || '';
}

function resolveDesktopDbPath() {
  const explicit = process.env.DESKTOP_SQLITE_PATH || readArg('--sqlite');
  if (explicit) return explicit;

  const candidates = [
    path.join(os.homedir(), 'Library', 'Application Support', 'My Health Desktop', 'desktop-data', 'offline-client.sqlite'),
    path.join(os.homedir(), 'Library', 'Application Support', 'vite_react_shadcn_ts', 'desktop-data', 'offline-client.sqlite'),
  ];

  return candidates.find(filePath => fs.existsSync(filePath)) || candidates[0];
}

async function main() {
  const mutationId = readArg('--mutation');
  const bundleId = readArg('--bundle');
  const deviceId = readArg('--device');
  const sqlitePath = resolveDesktopDbPath();
  const env = getDesktopEnv(process.cwd());

  if (!mutationId && !bundleId && !deviceId) {
    console.error('Provide --mutation <id>, --bundle <id>, or --device <id>.');
    process.exit(1);
  }

  if (!fs.existsSync(sqlitePath)) {
    console.error(`Desktop SQLite file not found: ${sqlitePath}`);
    process.exit(1);
  }

  const localDb = new Database(sqlitePath, { readonly: true });
  const pg = new Client({ connectionString: env.DATABASE_URL });
  await pg.connect();

  try {
    const local = {
      runtime: localDb.prepare(`SELECT * FROM sync_state WHERE id = 1`).get(),
      checkpoint: localDb.prepare(`SELECT * FROM pull_checkpoints WHERE stream_key = 'workspace'`).get(),
      outbox: mutationId
        ? localDb.prepare(`SELECT * FROM outbox_mutations WHERE mutation_id = ?`).get(mutationId)
        : bundleId
          ? localDb.prepare(`SELECT * FROM outbox_mutations WHERE bundle_id = ? ORDER BY created_local_at ASC`).all(bundleId)
        : localDb.prepare(`SELECT * FROM outbox_mutations WHERE device_id = ? ORDER BY created_local_at DESC LIMIT 25`).all(deviceId),
      bundles: bundleId
        ? localDb.prepare(`SELECT * FROM sync_bundles WHERE bundle_id = ?`).get(bundleId)
        : mutationId
          ? localDb.prepare(`SELECT * FROM sync_bundles WHERE bundle_id = (SELECT bundle_id FROM outbox_mutations WHERE mutation_id = ? LIMIT 1)`).get(mutationId)
          : localDb.prepare(`SELECT * FROM sync_bundles WHERE device_id = ? ORDER BY created_at DESC LIMIT 25`).all(deviceId),
      conflicts: mutationId
        ? localDb.prepare(`SELECT * FROM sync_conflicts WHERE details_json LIKE ? ORDER BY created_at DESC`).all(`%${mutationId}%`)
        : bundleId
          ? localDb.prepare(`SELECT * FROM sync_conflicts WHERE details_json LIKE ? ORDER BY created_at DESC`).all(`%${bundleId}%`)
        : localDb.prepare(`SELECT * FROM sync_conflicts ORDER BY created_at DESC LIMIT 25`).all(),
      deadLetters: mutationId
        ? localDb.prepare(`SELECT * FROM sync_dead_letters WHERE mutation_id = ? ORDER BY created_at DESC`).all(mutationId)
        : bundleId
          ? localDb.prepare(`
              SELECT sync_dead_letters.*
              FROM sync_dead_letters
              JOIN outbox_mutations ON outbox_mutations.mutation_id = sync_dead_letters.mutation_id
              WHERE outbox_mutations.bundle_id = ?
              ORDER BY sync_dead_letters.created_at DESC
            `).all(bundleId)
        : localDb.prepare(`SELECT * FROM sync_dead_letters ORDER BY created_at DESC LIMIT 25`).all(),
    };

    const serverQueries = [];
    if (mutationId) {
      serverQueries.push(
        pg.query(`SELECT * FROM processed_mutations WHERE mutation_id = $1`, [mutationId]),
      );
      serverQueries.push(
        pg.query(`SELECT * FROM processed_bundles WHERE bundle_id = (SELECT bundle_id FROM processed_mutations WHERE mutation_id = $1 LIMIT 1)`, [mutationId]),
      );
    } else if (bundleId) {
      serverQueries.push(
        pg.query(`SELECT * FROM processed_bundles WHERE bundle_id = $1`, [bundleId]),
      );
      serverQueries.push(
        pg.query(`SELECT * FROM processed_mutations WHERE bundle_id = $1 ORDER BY created_at ASC`, [bundleId]),
      );
    } else {
      serverQueries.push(
        pg.query(`SELECT * FROM desktop_devices WHERE device_id = $1`, [deviceId]),
      );
      serverQueries.push(
        pg.query(`SELECT * FROM processed_mutations WHERE device_id = $1 ORDER BY created_at DESC LIMIT 25`, [deviceId]),
      );
    }

    const serverResults = await Promise.all(serverQueries);
    const report = {
      sqlitePath,
      mutationId: mutationId || null,
      bundleId: bundleId || null,
      deviceId: deviceId || null,
      local,
      server: mutationId
        ? { processedMutations: serverResults[0].rows, processedBundles: serverResults[1].rows }
        : bundleId
          ? { processedBundles: serverResults[0].rows, processedMutations: serverResults[1].rows }
          : { devices: serverResults[0].rows, processedMutations: serverResults[1].rows },
    };

    console.log(JSON.stringify(report, null, 2));
  } finally {
    localDb.close();
    await pg.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
