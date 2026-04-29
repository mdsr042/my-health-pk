const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const crypto = require('node:crypto');

function createDesktopDatabase({ userDataPath, secrets, appVersion = '0.0.0' }) {
  const dataDir = path.join(userDataPath, 'desktop-data');
  fs.mkdirSync(dataDir, { recursive: true });

  const dbPath = path.join(dataDir, 'offline-client.sqlite');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS desktop_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS auth_cache (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      encrypted_token TEXT NOT NULL DEFAULT '',
      encrypted_session TEXT NOT NULL DEFAULT '',
      encrypted_bootstrap TEXT NOT NULL DEFAULT '',
      workspace_id TEXT NOT NULL DEFAULT '',
      doctor_user_id TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS local_pin (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      pin_salt TEXT NOT NULL DEFAULT '',
      pin_hash TEXT NOT NULL DEFAULT '',
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      device_id TEXT NOT NULL,
      is_locked INTEGER NOT NULL DEFAULT 0,
      last_successful_sync_at TEXT NOT NULL DEFAULT '',
      last_sync_status TEXT NOT NULL DEFAULT 'idle',
      backup_overdue_days INTEGER NOT NULL DEFAULT 3,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS outbox_mutations (
      mutation_id TEXT PRIMARY KEY,
      bundle_id TEXT NOT NULL DEFAULT '',
      bundle_type TEXT NOT NULL DEFAULT 'mutation',
      root_entity_id TEXT NOT NULL DEFAULT '',
      device_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation_type TEXT NOT NULL,
      encrypted_payload TEXT NOT NULL DEFAULT '',
      base_version TEXT NOT NULL DEFAULT '',
      created_local_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      retry_count INTEGER NOT NULL DEFAULT 0,
      last_error_code TEXT NOT NULL DEFAULT '',
      last_error_message TEXT NOT NULL DEFAULT '',
      next_retry_at TEXT NOT NULL DEFAULT '',
      processed_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS sync_bundles (
      bundle_id TEXT PRIMARY KEY,
      bundle_type TEXT NOT NULL DEFAULT 'mutation',
      root_entity_id TEXT NOT NULL DEFAULT '',
      device_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      entity_type TEXT NOT NULL DEFAULT '',
      entity_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      item_count INTEGER NOT NULL DEFAULT 0,
      committed_item_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT NOT NULL DEFAULT '',
      last_error_code TEXT NOT NULL DEFAULT '',
      last_error_message TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS pull_checkpoints (
      stream_key TEXT PRIMARY KEY,
      checkpoint_value TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sync_runs (
      id TEXT PRIMARY KEY,
      run_type TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT NOT NULL DEFAULT '',
      summary_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS sync_conflicts (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      conflict_type TEXT NOT NULL,
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS sync_dead_letters (
      id TEXT PRIMARY KEY,
      mutation_id TEXT NOT NULL,
      reason_code TEXT NOT NULL,
      reason_message TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS attachment_transfers (
      id TEXT PRIMARY KEY,
      attachment_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL DEFAULT '',
      entity_type TEXT NOT NULL DEFAULT '',
      entity_id TEXT NOT NULL DEFAULT '',
      patient_id TEXT NOT NULL DEFAULT '',
      appointment_id TEXT NOT NULL DEFAULT '',
      file_name TEXT NOT NULL DEFAULT '',
      mime_type TEXT NOT NULL DEFAULT '',
      file_size INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL DEFAULT '',
      local_path TEXT NOT NULL DEFAULT '',
      remote_key TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS device_entitlements (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      workspace_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'unknown',
      plan_name TEXT NOT NULL DEFAULT '',
      trial_ends_at TEXT NOT NULL DEFAULT '',
      entitlement_valid_until TEXT NOT NULL DEFAULT '',
      grace_deadline TEXT NOT NULL DEFAULT '',
      last_checked_at TEXT NOT NULL DEFAULT '',
      lock_message TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      event_level TEXT NOT NULL DEFAULT 'info',
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  function ensureColumn(tableName, columnName, definition) {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    if (columns.some(column => column.name === columnName)) return;
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }

  ensureColumn('outbox_mutations', 'bundle_id', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('outbox_mutations', 'bundle_type', "TEXT NOT NULL DEFAULT 'mutation'");
  ensureColumn('outbox_mutations', 'root_entity_id', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('sync_conflicts', 'mutation_id', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('sync_conflicts', 'bundle_id', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('sync_conflicts', 'local_summary', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('sync_conflicts', 'server_summary', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('sync_conflicts', 'local_snapshot_json', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('sync_conflicts', 'server_snapshot_json', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('sync_conflicts', 'server_base_version', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('sync_conflicts', 'resolution_status', "TEXT NOT NULL DEFAULT 'pending'");
  ensureColumn('sync_conflicts', 'chosen_action', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('sync_conflicts', 'resolution_reason', "TEXT NOT NULL DEFAULT ''");

  const initialDeviceId = `desktop_${crypto.randomUUID()}`;
  db.prepare(`
    INSERT INTO sync_state (id, device_id, is_locked, last_sync_status)
    VALUES (1, ?, 0, 'idle')
    ON CONFLICT(id) DO NOTHING
  `).run(initialDeviceId);

  function nowIso() {
    return new Date().toISOString();
  }

  function getMeta(key, fallback = '') {
    return readRow(`SELECT value FROM desktop_meta WHERE key = ?`, [key])?.value ?? fallback;
  }

  function setMeta(key, value = '') {
    db.prepare(`
      INSERT INTO desktop_meta (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, String(value ?? ''));
    return true;
  }

  function clearMeta(key) {
    db.prepare(`DELETE FROM desktop_meta WHERE key = ?`).run(key);
    return true;
  }

  function setRebuildRequired(required, reason = '') {
    if (required) {
      setMeta('rebuild_required', '1');
      setMeta('rebuild_reason', reason || 'Desktop sync needs a cache rebuild before it can continue.');
    } else {
      clearMeta('rebuild_required');
      clearMeta('rebuild_reason');
    }
    return true;
  }

  function recordAuditEvent(eventType, eventLevel = 'info', details = {}) {
    db.prepare(`
      INSERT INTO audit_events (id, event_type, event_level, details_json, created_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      `audit_${crypto.randomUUID()}`,
      String(eventType || 'desktop_event').trim() || 'desktop_event',
      String(eventLevel || 'info').trim() || 'info',
      JSON.stringify(details ?? {})
    );
    return true;
  }

  function parseJsonText(value, fallback = null) {
    if (!value) return fallback;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function summarizeSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return '';
    if (snapshot.name || snapshot.id || snapshot.status) {
      return [snapshot.name, snapshot.id, snapshot.status].filter(Boolean).join(' • ');
    }
    if (snapshot.appointmentId || snapshot.patientId || snapshot.chiefComplaint) {
      return [snapshot.appointmentId, snapshot.patientId, snapshot.chiefComplaint].filter(Boolean).join(' • ');
    }
    const text = JSON.stringify(snapshot);
    return text.length > 180 ? `${text.slice(0, 177)}...` : text;
  }

  function isMeaningfulValue(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (typeof value === 'number') return Number.isFinite(value) && value !== 0;
    if (typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return false;
  }

  function normalizeDraftSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return {};
    const next = { ...snapshot };
    delete next.savedAt;
    return next;
  }

  function decideSystemConflictResolution(conflictType, localSnapshot, serverSnapshot, serverBaseVersion) {
    if (conflictType === 'appointment_conflict') {
      return {
        action: 'refresh_from_server',
        reason: 'The visit state changed elsewhere, so refreshing from the server is the safest automatic choice.',
      };
    }

    if (conflictType === 'draft_conflict') {
      const normalizedLocal = normalizeDraftSnapshot(localSnapshot);
      const normalizedServer = normalizeDraftSnapshot(serverSnapshot);
      if (JSON.stringify(normalizedLocal) === JSON.stringify(normalizedServer)) {
        return {
          action: 'discard_local',
          reason: 'The local draft already matches the server content, so the system keeps the server copy.',
        };
      }

      const localHasClinicalContent = Object.values(normalizedLocal).some(isMeaningfulValue);
      if (localHasClinicalContent && serverBaseVersion) {
        return {
          action: 'keep_local_as_new_draft',
          reason: 'The local draft still contains meaningful clinical work, so the system preserves it against the latest server base version.',
        };
      }

      return {
        action: 'discard_local',
        reason: 'The local draft does not add enough unique content to outweigh the newer server draft, so the system keeps the server copy.',
      };
    }

    if (conflictType === 'patient_conflict') {
      const fields = ['mrn', 'name', 'phone', 'age', 'gender', 'cnic', 'address', 'bloodGroup', 'emergencyContact'];
      let localOnlyAdditions = 0;
      let conflictingValues = 0;

      for (const field of fields) {
        const localValue = localSnapshot?.[field];
        const serverValue = serverSnapshot?.[field];
        const localMeaningful = isMeaningfulValue(localValue);
        const serverMeaningful = isMeaningfulValue(serverValue);

        if (localMeaningful && !serverMeaningful) {
          localOnlyAdditions += 1;
          continue;
        }

        if (localMeaningful && serverMeaningful && String(localValue).trim() !== String(serverValue).trim()) {
          conflictingValues += 1;
        }
      }

      if (localOnlyAdditions > 0 && conflictingValues === 0 && serverBaseVersion) {
        return {
          action: 'use_local',
          reason: 'The local patient record only fills missing server details without contradicting populated server fields, so the system keeps the local update.',
        };
      }

      return {
        action: 'use_server',
        reason: 'The patient record has competing populated values, so the system prefers the current server demographics for safety.',
      };
    }

    return {
      action: 'use_server',
      reason: 'The system could not safely merge this conflict automatically, so it kept the canonical server version.',
    };
  }

  function readRow(statement, params = []) {
    return db.prepare(statement).get(...params);
  }

  function getRuntimeInfo() {
    const syncState = readRow(`SELECT * FROM sync_state WHERE id = 1`);
    const pinState = readRow(`SELECT * FROM local_pin WHERE id = 1`);
    const entitlement = readRow(`SELECT * FROM device_entitlements WHERE id = 1`);
    const backupOverdue = Boolean(
      syncState?.last_successful_sync_at
        && (Date.now() - new Date(syncState.last_successful_sync_at).getTime()) > ((syncState.backup_overdue_days || 3) * 24 * 60 * 60 * 1000)
    );
    const pendingMutations = readRow(`SELECT COUNT(*) AS count FROM outbox_mutations WHERE status IN ('pending', 'retryable')`)?.count ?? 0;
    const failedMutations = readRow(`SELECT COUNT(*) AS count FROM sync_dead_letters`)?.count ?? 0;
    const pendingBundles = readRow(`SELECT COUNT(*) AS count FROM sync_bundles WHERE status IN ('pending', 'retryable', 'syncing')`)?.count ?? 0;
    const failedBundles = readRow(`SELECT COUNT(*) AS count FROM sync_bundles WHERE status IN ('dead_letter', 'conflict')`)?.count ?? 0;
    const completedBundles = readRow(`SELECT COUNT(*) AS count FROM sync_bundles WHERE status = 'completed'`)?.count ?? 0;
    const oldestPending = readRow(`
      SELECT created_local_at
      FROM outbox_mutations
      WHERE status IN ('pending', 'retryable')
      ORDER BY created_local_at ASC
      LIMIT 1
    `)?.created_local_at ?? '';

    const effectiveEntitlement = (() => {
      if (!entitlement) return null;
      const base = {
        status: entitlement.status,
        planName: entitlement.plan_name,
        trialEndsAt: entitlement.trial_ends_at || null,
        entitlementValidUntil: entitlement.entitlement_valid_until || null,
        graceDeadline: entitlement.grace_deadline || null,
        lastCheckedAt: entitlement.last_checked_at || null,
        lockMessage: entitlement.lock_message || '',
      };

      if (base.status === 'locked' || base.status === 'restricted') {
        return base;
      }

      const now = Date.now();
      const validUntil = base.entitlementValidUntil ? new Date(base.entitlementValidUntil).getTime() : NaN;
      const graceDeadline = base.graceDeadline ? new Date(base.graceDeadline).getTime() : NaN;

      if (!Number.isNaN(validUntil) && validUntil < now) {
        if (!Number.isNaN(graceDeadline) && graceDeadline > now) {
          return {
            ...base,
            status: 'grace',
            lockMessage: base.lockMessage || 'Subscription recheck is overdue. Connect to the internet soon to keep offline access.',
          };
        }

        return {
          ...base,
          status: 'locked',
          lockMessage: base.lockMessage || 'Your trial/subscription has ended. Renew it to continue using the app.',
        };
      }

      return base;
    })();

    return {
      isDesktop: true,
      deviceId: syncState?.device_id || initialDeviceId,
      pinConfigured: Boolean(pinState?.pin_hash),
      locked: Boolean(syncState?.is_locked),
      syncStatus: syncState?.last_sync_status || 'idle',
      lastSuccessfulSyncAt: syncState?.last_successful_sync_at || '',
      backupOverdue,
      pendingMutations: Number(pendingMutations || 0),
      failedMutations: Number(failedMutations || 0),
      pendingBundles: Number(pendingBundles || 0),
      failedBundles: Number(failedBundles || 0),
      completedBundles: Number(completedBundles || 0),
      oldestPendingAt: oldestPending || '',
      rebuildRequired: getMeta('rebuild_required', '') === '1',
      rebuildReason: getMeta('rebuild_reason', ''),
      entitlement: effectiveEntitlement,
    };
  }

  function setLocked(isLocked) {
    db.prepare(`
      UPDATE sync_state
      SET is_locked = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(isLocked ? 1 : 0);
    recordAuditEvent(isLocked ? 'desktop_locked' : 'desktop_unlocked', 'info', {
      locked: Boolean(isLocked),
    });
    return getRuntimeInfo();
  }

  function toEntitlementStatus(subscriptionStatus = '', trialEndsAt = '') {
    if (subscriptionStatus === 'active') return 'valid';
    if (subscriptionStatus === 'trial') return 'valid_but_recheck_due';
    if (subscriptionStatus === 'suspended') return 'restricted';
    if (subscriptionStatus === 'cancelled') return 'locked';

    if (trialEndsAt && new Date(trialEndsAt).getTime() > Date.now()) {
      return 'valid_but_recheck_due';
    }

    return 'unknown';
  }

  function upsertEntitlement(entitlement = {}) {
    const status = String(entitlement.status || 'unknown').trim() || 'unknown';
    const lockMessage = status === 'locked'
      ? String(entitlement.lockMessage || 'Your trial/subscription has ended. Renew it to continue using the app.')
      : String(entitlement.lockMessage || '');

    db.prepare(`
      INSERT INTO device_entitlements (
        id, workspace_id, status, plan_name, trial_ends_at, entitlement_valid_until, grace_deadline, last_checked_at, lock_message
      )
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        workspace_id = excluded.workspace_id,
        status = excluded.status,
        plan_name = excluded.plan_name,
        trial_ends_at = excluded.trial_ends_at,
        entitlement_valid_until = excluded.entitlement_valid_until,
        grace_deadline = excluded.grace_deadline,
        last_checked_at = excluded.last_checked_at,
        lock_message = excluded.lock_message
    `).run(
      String(entitlement.workspaceId || ''),
      status,
      String(entitlement.planName || ''),
      String(entitlement.trialEndsAt || ''),
      String(entitlement.entitlementValidUntil || ''),
      String(entitlement.graceDeadline || ''),
      String(entitlement.lastCheckedAt || nowIso()),
      lockMessage
    );

    return getRuntimeInfo();
  }

  function setPin(pin) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = secrets.hashPin(pin, salt);
    db.prepare(`
      INSERT INTO local_pin (id, pin_salt, pin_hash, failed_attempts, locked_until, updated_at)
      VALUES (1, ?, ?, 0, '', CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        pin_salt = excluded.pin_salt,
        pin_hash = excluded.pin_hash,
        failed_attempts = 0,
        locked_until = '',
        updated_at = CURRENT_TIMESTAMP
    `).run(salt, hash);
    recordAuditEvent('pin_configured', 'info', {
      hasPin: true,
    });
    return setLocked(false);
  }

  function verifyPin(pin) {
    const entitlement = readRow(`SELECT * FROM device_entitlements WHERE id = 1`);
    if (entitlement?.status === 'locked') {
      recordAuditEvent('pin_unlock_blocked', 'warn', {
        reason: 'entitlement_locked',
      });
      return {
        ok: false,
        code: 'ENTITLEMENT_LOCKED',
        message: entitlement.lock_message || 'Your trial/subscription has ended. Renew it to continue using the app.',
      };
    }

    const pinState = readRow(`SELECT * FROM local_pin WHERE id = 1`);
    if (!pinState?.pin_hash) {
      recordAuditEvent('pin_unlock_failed', 'warn', {
        reason: 'pin_not_configured',
      });
      return { ok: false, code: 'PIN_NOT_CONFIGURED', message: 'PIN is not configured yet.' };
    }

    if (pinState.locked_until && new Date(pinState.locked_until).getTime() > Date.now()) {
      recordAuditEvent('pin_unlock_failed', 'warn', {
        reason: 'pin_temp_locked',
        lockedUntil: pinState.locked_until,
      });
      return { ok: false, code: 'PIN_TEMP_LOCKED', message: 'Too many attempts. Try again shortly.' };
    }

    const nextHash = secrets.hashPin(pin, pinState.pin_salt);
    if (nextHash !== pinState.pin_hash) {
      const nextAttempts = Number(pinState.failed_attempts || 0) + 1;
      const lockedUntil = nextAttempts >= 5 ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : '';
      db.prepare(`
        UPDATE local_pin
        SET failed_attempts = ?, locked_until = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `).run(nextAttempts, lockedUntil);
      recordAuditEvent('pin_unlock_failed', nextAttempts >= 5 ? 'error' : 'warn', {
        reason: nextAttempts >= 5 ? 'pin_temp_locked' : 'invalid_pin',
        failedAttempts: nextAttempts,
        lockedUntil,
      });
      return { ok: false, code: nextAttempts >= 5 ? 'PIN_TEMP_LOCKED' : 'INVALID_PIN', message: nextAttempts >= 5 ? 'Too many attempts. Try again in 5 minutes.' : 'Incorrect PIN.' };
    }

    db.prepare(`
      UPDATE local_pin
      SET failed_attempts = 0, locked_until = '', updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run();

    setLocked(false);
    recordAuditEvent('pin_unlock_succeeded', 'info', {});
    return { ok: true, runtime: getRuntimeInfo() };
  }

  function saveBootstrapSession({ token, session, bootstrap }) {
    db.transaction(() => {
      db.prepare(`
        INSERT INTO auth_cache (id, encrypted_token, encrypted_session, encrypted_bootstrap, workspace_id, doctor_user_id, updated_at)
        VALUES (1, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          encrypted_token = excluded.encrypted_token,
          encrypted_session = excluded.encrypted_session,
          encrypted_bootstrap = excluded.encrypted_bootstrap,
          workspace_id = excluded.workspace_id,
          doctor_user_id = excluded.doctor_user_id,
          updated_at = excluded.updated_at
      `).run(
        secrets.encryptText(token),
        secrets.encryptText(JSON.stringify(session)),
        secrets.encryptText(JSON.stringify(bootstrap)),
        session?.workspace?.id || '',
        session?.user?.id || '',
        nowIso()
      );

      db.prepare(`
        UPDATE sync_state
        SET last_successful_sync_at = ?, last_sync_status = 'up_to_date', updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `).run(nowIso());

      if (session?.workspace?.subscription) {
        upsertEntitlement({
          workspaceId: session.workspace.id || '',
          status: toEntitlementStatus(
            session.workspace.subscription.status,
            session.workspace.subscription.trialEndsAt || ''
          ),
          planName: session.workspace.subscription.planName || '',
          trialEndsAt: session.workspace.subscription.trialEndsAt || '',
          entitlementValidUntil: session.workspace.subscription.trialEndsAt || '',
          graceDeadline: session.workspace.subscription.trialEndsAt || '',
          lastCheckedAt: nowIso(),
          lockMessage: session.workspace.subscription.status === 'cancelled'
            ? 'Your trial/subscription has ended. Renew it to continue using the app.'
            : '',
        });
      }
    })();

    recordAuditEvent('desktop_session_bootstrapped', 'info', {
      workspaceId: session?.workspace?.id || '',
      doctorUserId: session?.user?.id || '',
    });

    return getRuntimeInfo();
  }

  function updateBootstrapSnapshot(bootstrap) {
    const row = readRow(`SELECT encrypted_bootstrap FROM auth_cache WHERE id = 1`);
    const currentBootstrap = row?.encrypted_bootstrap
      ? JSON.parse(secrets.decryptText(row.encrypted_bootstrap))
      : {};
    const nextBootstrap = {
      ...currentBootstrap,
      ...(bootstrap ?? {}),
    };
    db.prepare(`
      INSERT INTO auth_cache (id, encrypted_token, encrypted_session, encrypted_bootstrap, workspace_id, doctor_user_id, updated_at)
      VALUES (1, '', '', ?, '', '', ?)
      ON CONFLICT(id) DO UPDATE SET
        encrypted_bootstrap = excluded.encrypted_bootstrap,
        updated_at = excluded.updated_at
    `).run(
      secrets.encryptText(JSON.stringify(nextBootstrap)),
      nowIso()
    );

    if (row?.encrypted_bootstrap) {
      db.prepare(`UPDATE auth_cache SET encrypted_bootstrap = ?, updated_at = ? WHERE id = 1`)
        .run(secrets.encryptText(JSON.stringify(nextBootstrap)), nowIso());
    }

    return true;
  }

  function getStoredToken() {
    const row = readRow(`SELECT encrypted_token FROM auth_cache WHERE id = 1`);
    return row?.encrypted_token ? secrets.decryptText(row.encrypted_token) : '';
  }

  function clearStoredToken() {
    db.prepare(`UPDATE auth_cache SET encrypted_token = '', updated_at = CURRENT_TIMESTAMP WHERE id = 1`).run();
    return true;
  }

  function getBootstrapMutable() {
    const row = readRow(`SELECT encrypted_bootstrap FROM auth_cache WHERE id = 1`);
    return row?.encrypted_bootstrap
      ? JSON.parse(secrets.decryptText(row.encrypted_bootstrap))
      : {};
  }

  function saveBootstrapMutable(bootstrap) {
    updateBootstrapSnapshot(bootstrap);
  }

  function overwriteBootstrapSnapshot(bootstrap) {
    const nextBootstrap = bootstrap ?? {};
    db.prepare(`
      INSERT INTO auth_cache (id, encrypted_token, encrypted_session, encrypted_bootstrap, workspace_id, doctor_user_id, updated_at)
      VALUES (1, '', '', ?, '', '', ?)
      ON CONFLICT(id) DO UPDATE SET
        encrypted_bootstrap = excluded.encrypted_bootstrap,
        updated_at = excluded.updated_at
    `).run(
      secrets.encryptText(JSON.stringify(nextBootstrap)),
      nowIso()
    );
    return true;
  }

  function applyServerSnapshotToBootstrap(entityType, entityId, serverSnapshot, localSnapshot = null) {
    if ((!serverSnapshot || typeof serverSnapshot !== 'object') && entityType !== 'consultation_draft') return false;

    const bootstrap = getBootstrapMutable();
    const nextBootstrap = {
      ...bootstrap,
      patients: Array.isArray(bootstrap.patients) ? [...bootstrap.patients] : [],
      appointments: Array.isArray(bootstrap.appointments) ? [...bootstrap.appointments] : [],
      notes: Array.isArray(bootstrap.notes) ? [...bootstrap.notes] : [],
      drafts: bootstrap.drafts && typeof bootstrap.drafts === 'object' ? { ...bootstrap.drafts } : {},
      attachments: Array.isArray(bootstrap.attachments) ? [...bootstrap.attachments] : [],
      generatedAt: nowIso(),
    };

    if (entityType === 'patient' && serverSnapshot?.id) {
      const index = nextBootstrap.patients.findIndex(item => item.id === serverSnapshot.id);
      if (index >= 0) nextBootstrap.patients[index] = serverSnapshot;
      else nextBootstrap.patients.unshift(serverSnapshot);
    }

    if (entityType === 'appointment' && serverSnapshot?.id) {
      const index = nextBootstrap.appointments.findIndex(item => item.id === serverSnapshot.id);
      if (index >= 0) nextBootstrap.appointments[index] = serverSnapshot;
      else nextBootstrap.appointments.unshift(serverSnapshot);
    }

    if (entityType === 'consultation_draft') {
      const draftKey = String(serverSnapshot?.appointmentId || localSnapshot?.appointmentId || entityId || '').trim();
      if (draftKey) {
        if (serverSnapshot && Object.keys(serverSnapshot).length > 0) {
          nextBootstrap.drafts[draftKey] = serverSnapshot;
        } else {
          delete nextBootstrap.drafts[draftKey];
        }
      }
    }

    overwriteBootstrapSnapshot(nextBootstrap);
    return true;
  }

  function getCachedBootstrap() {
    const row = readRow(`SELECT encrypted_session, encrypted_bootstrap FROM auth_cache WHERE id = 1`);
    return {
      session: row?.encrypted_session ? JSON.parse(secrets.decryptText(row.encrypted_session)) : null,
      bootstrap: row?.encrypted_bootstrap ? JSON.parse(secrets.decryptText(row.encrypted_bootstrap)) : null,
    };
  }

  function ensureBundle(bundle) {
    db.prepare(`
      INSERT INTO sync_bundles (
        bundle_id, bundle_type, root_entity_id, device_id, workspace_id, entity_type, entity_id, status, item_count, committed_item_count, created_at, updated_at, completed_at, last_error_code, last_error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, '', '', '')
      ON CONFLICT(bundle_id) DO UPDATE SET
        bundle_type = excluded.bundle_type,
        root_entity_id = excluded.root_entity_id,
        device_id = excluded.device_id,
        workspace_id = excluded.workspace_id,
        entity_type = excluded.entity_type,
        entity_id = excluded.entity_id,
        item_count = (
          SELECT COUNT(*)
          FROM outbox_mutations
          WHERE bundle_id = excluded.bundle_id
        ),
        updated_at = excluded.updated_at
    `).run(
      bundle.bundleId,
      bundle.bundleType || 'mutation',
      bundle.rootEntityId || bundle.entityId || '',
      bundle.deviceId,
      bundle.workspaceId,
      bundle.entityType || '',
      bundle.entityId || '',
      bundle.status || 'pending',
      bundle.itemCount || 0,
      bundle.createdAt || nowIso(),
      nowIso()
    );
  }

  function refreshBundleState(bundleId) {
    const bundleKey = String(bundleId || '').trim();
    if (!bundleKey) return null;

    const summary = db.prepare(`
      SELECT
        COUNT(*) AS item_count,
        SUM(CASE WHEN status = 'processed' THEN 1 ELSE 0 END) AS committed_item_count,
        SUM(CASE WHEN status = 'dead_letter' AND last_error_code = 'CONFLICT' THEN 1 ELSE 0 END) AS conflict_count,
        SUM(CASE WHEN status = 'dead_letter' AND last_error_code <> 'CONFLICT' THEN 1 ELSE 0 END) AS dead_letter_count,
        SUM(CASE WHEN status = 'retryable' THEN 1 ELSE 0 END) AS retryable_count,
        SUM(CASE WHEN status IN ('pending', 'syncing') THEN 1 ELSE 0 END) AS pending_count,
        MAX(CASE WHEN last_error_code <> '' THEN last_error_code ELSE NULL END) AS last_error_code,
        MAX(CASE WHEN last_error_message <> '' THEN last_error_message ELSE NULL END) AS last_error_message
      FROM outbox_mutations
      WHERE bundle_id = ?
    `).get(bundleKey);

    const itemCount = Number(summary?.item_count || 0);
    if (itemCount === 0) {
      db.prepare(`DELETE FROM sync_bundles WHERE bundle_id = ?`).run(bundleKey);
      return null;
    }

    const committedItemCount = Number(summary?.committed_item_count || 0);
    const conflictCount = Number(summary?.conflict_count || 0);
    const deadLetterCount = Number(summary?.dead_letter_count || 0);
    const retryableCount = Number(summary?.retryable_count || 0);
    const pendingCount = Number(summary?.pending_count || 0);

    let status = 'pending';
    if (committedItemCount === itemCount) {
      status = 'completed';
    } else if (conflictCount > 0) {
      status = 'conflict';
    } else if (deadLetterCount > 0) {
      status = 'dead_letter';
    } else if (retryableCount > 0) {
      status = 'retryable';
    } else if (pendingCount > 0) {
      status = 'pending';
    }

    db.prepare(`
      UPDATE sync_bundles
      SET status = ?,
          item_count = ?,
          committed_item_count = ?,
          updated_at = CURRENT_TIMESTAMP,
          completed_at = CASE WHEN ? = 'completed' THEN COALESCE(NULLIF(completed_at, ''), ?) ELSE '' END,
          last_error_code = CASE WHEN ? IN ('retryable', 'conflict', 'dead_letter') THEN COALESCE(?, '') ELSE '' END,
          last_error_message = CASE WHEN ? IN ('retryable', 'conflict', 'dead_letter') THEN COALESCE(?, '') ELSE '' END
      WHERE bundle_id = ?
    `).run(
      status,
      itemCount,
      committedItemCount,
      status,
      nowIso(),
      status,
      summary?.last_error_code ?? '',
      status,
      summary?.last_error_message ?? '',
      bundleKey
    );

    return { bundleId: bundleKey, status, itemCount, committedItemCount };
  }

  function markBundlesSyncing(bundleIds = []) {
    const uniqueBundleIds = Array.from(new Set((bundleIds || []).map(item => String(item || '').trim()).filter(Boolean)));
    const markStatement = db.prepare(`
      UPDATE sync_bundles
      SET status = 'syncing',
          updated_at = CURRENT_TIMESTAMP
      WHERE bundle_id = ?
        AND status IN ('pending', 'retryable')
    `);

    const transaction = db.transaction(items => {
      for (const bundleId of items) {
        markStatement.run(bundleId);
      }
    });

    transaction(uniqueBundleIds);
    return uniqueBundleIds.length;
  }

  function enqueueMutation(mutation) {
    db.prepare(`
      INSERT OR REPLACE INTO outbox_mutations (
        mutation_id, bundle_id, bundle_type, root_entity_id, device_id, workspace_id, entity_type, entity_id, operation_type,
        encrypted_payload, base_version, created_local_at, status, retry_count,
        last_error_code, last_error_message, next_retry_at, processed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      mutation.mutationId,
      mutation.bundleId || mutation.mutationId,
      mutation.bundleType || 'mutation',
      mutation.rootEntityId || mutation.entityId,
      mutation.deviceId,
      mutation.workspaceId,
      mutation.entityType,
      mutation.entityId,
      mutation.operationType,
      secrets.encryptText(JSON.stringify(mutation.payload ?? {})),
      mutation.baseVersion || '',
      mutation.createdLocalAt || nowIso(),
      mutation.status || 'pending',
      mutation.retryCount || 0,
      mutation.lastErrorCode || '',
      mutation.lastErrorMessage || '',
      mutation.nextRetryAt || '',
      mutation.processedAt || ''
    );

    ensureBundle({
      bundleId: mutation.bundleId || mutation.mutationId,
      bundleType: mutation.bundleType || 'mutation',
      rootEntityId: mutation.rootEntityId || mutation.entityId,
      deviceId: mutation.deviceId,
      workspaceId: mutation.workspaceId,
      entityType: mutation.entityType,
      entityId: mutation.entityId,
      status: 'pending',
      createdAt: mutation.createdLocalAt || nowIso(),
    });
    db.prepare(`
      UPDATE sync_bundles
      SET item_count = (
        SELECT COUNT(*)
        FROM outbox_mutations
        WHERE bundle_id = ?
      ),
      status = CASE WHEN status = 'completed' THEN 'pending' ELSE status END,
      updated_at = CURRENT_TIMESTAMP
      WHERE bundle_id = ?
    `).run(mutation.bundleId || mutation.mutationId, mutation.bundleId || mutation.mutationId);
  }

  function getPendingMutations(limit = 50) {
    const rows = db.prepare(`
      SELECT mutation_id, bundle_id, bundle_type, root_entity_id, device_id, workspace_id, entity_type, entity_id, operation_type, encrypted_payload,
             base_version, created_local_at, status, retry_count, last_error_code, last_error_message, next_retry_at
      FROM outbox_mutations
      WHERE status IN ('pending', 'retryable')
        AND (next_retry_at = '' OR next_retry_at <= ?)
      ORDER BY created_local_at ASC
      LIMIT ?
    `).all(nowIso(), limit);

    return rows.map(row => ({
      mutationId: row.mutation_id,
      bundleId: row.bundle_id,
      bundleType: row.bundle_type,
      rootEntityId: row.root_entity_id,
      deviceId: row.device_id,
      workspaceId: row.workspace_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      operationType: row.operation_type,
      payload: row.encrypted_payload ? JSON.parse(secrets.decryptText(row.encrypted_payload)) : {},
      baseVersion: row.base_version,
      createdLocalAt: row.created_local_at,
      status: row.status,
      retryCount: row.retry_count,
      lastErrorCode: row.last_error_code,
      lastErrorMessage: row.last_error_message,
      nextRetryAt: row.next_retry_at,
    }));
  }

  function getPendingBundles(limit = 20) {
    const bundles = db.prepare(`
      SELECT bundle_id, bundle_type, root_entity_id, device_id, workspace_id, entity_type, entity_id, status, item_count, created_at
      FROM sync_bundles
      WHERE status IN ('pending', 'retryable', 'syncing')
      ORDER BY created_at ASC
      LIMIT ?
    `).all(limit);

    return bundles.map(bundle => ({
      bundleId: bundle.bundle_id,
      bundleType: bundle.bundle_type,
      rootEntityId: bundle.root_entity_id,
      deviceId: bundle.device_id,
      workspaceId: bundle.workspace_id,
      entityType: bundle.entity_type,
      entityId: bundle.entity_id,
      status: bundle.status,
      itemCount: bundle.item_count,
      createdAt: bundle.created_at,
      mutations: db.prepare(`
        SELECT mutation_id, bundle_id, bundle_type, root_entity_id, device_id, workspace_id, entity_type, entity_id, operation_type, encrypted_payload,
               base_version, created_local_at, status, retry_count, last_error_code, last_error_message, next_retry_at
        FROM outbox_mutations
        WHERE bundle_id = ?
        ORDER BY created_local_at ASC
      `).all(bundle.bundle_id).map(row => ({
        mutationId: row.mutation_id,
        bundleId: row.bundle_id,
        bundleType: row.bundle_type,
        rootEntityId: row.root_entity_id,
        deviceId: row.device_id,
        workspaceId: row.workspace_id,
        entityType: row.entity_type,
        entityId: row.entity_id,
        operationType: row.operation_type,
        payload: row.encrypted_payload ? JSON.parse(secrets.decryptText(row.encrypted_payload)) : {},
        baseVersion: row.base_version,
        createdLocalAt: row.created_local_at,
        status: row.status,
        retryCount: row.retry_count,
        lastErrorCode: row.last_error_code,
        lastErrorMessage: row.last_error_message,
        nextRetryAt: row.next_retry_at,
      })),
    }));
  }

  function markSyncStatus(status) {
    db.prepare(`
      UPDATE sync_state
      SET last_sync_status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(status);
  }

  function touchSuccessfulSync() {
    db.prepare(`
      UPDATE sync_state
      SET last_successful_sync_at = ?, last_sync_status = 'up_to_date', updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(nowIso());
  }

  function updateAttachmentStatusFromSync(item, status, remoteKey = '') {
    const attachmentId = String(
      item?.result?.attachmentId
      ?? item?.attachmentId
      ?? item?.result?.attachment?.attachmentId
      ?? item?.entityId
      ?? ''
    ).trim();

    if (!attachmentId) return;

    db.prepare(`
      UPDATE attachment_transfers
      SET status = ?,
          remote_key = CASE WHEN ? <> '' THEN ? ELSE remote_key END,
          updated_at = CURRENT_TIMESTAMP
      WHERE attachment_id = ? OR id = ?
    `).run(status, remoteKey, remoteKey, attachmentId, attachmentId);
  }

  function applyAcceptedSyncResults(results = []) {
    const accepted = Array.isArray(results)
      ? results.filter(item => item?.status === 'accepted' || item?.status === 'accepted_already_processed')
      : [];

    if (accepted.length === 0) return false;

    const bootstrap = getBootstrapMutable();
    const patients = Array.isArray(bootstrap.patients) ? [...bootstrap.patients] : [];
    const appointments = Array.isArray(bootstrap.appointments) ? [...bootstrap.appointments] : [];
    const notes = Array.isArray(bootstrap.notes) ? [...bootstrap.notes] : [];
    const drafts = bootstrap.drafts && typeof bootstrap.drafts === 'object' ? { ...bootstrap.drafts } : {};
    const attachments = Array.isArray(bootstrap.attachments) ? [...bootstrap.attachments] : [];

    for (const item of accepted) {
      const result = item?.canonicalEntity ?? item?.result ?? {};

      if (result?.patient?.id) {
        const nextPatient = result.patient;
        const existingIndex = patients.findIndex(entry => entry.id === nextPatient.id);
        if (existingIndex >= 0) {
          patients[existingIndex] = nextPatient;
        } else {
          patients.unshift(nextPatient);
        }
      }

      if (result?.appointment?.id) {
        const nextAppointment = result.appointment;
        const existingIndex = appointments.findIndex(entry => entry.id === nextAppointment.id);
        if (existingIndex >= 0) {
          appointments[existingIndex] = nextAppointment;
        } else {
          appointments.unshift(nextAppointment);
        }
      }

      if (result?.patient?.id && result?.appointment?.id && item?.entityType === 'walk_in') {
        const nextPatient = result.patient;
        if (!patients.some(entry => entry.id === nextPatient.id)) {
          patients.unshift(nextPatient);
        }
      }

      if (result?.appointmentId && item?.entityType === 'consultation_draft') {
        delete drafts[String(result.appointmentId)];
      }

      if (result?.note?.id && item?.entityType === 'consultation') {
        const nextNote = result.note;
        const appointmentId = String(nextNote.appointmentId || item.entityId || '').trim();
        const filteredNotes = notes.filter(entry =>
          entry.id !== nextNote.id
          && !(appointmentId && entry.appointmentId === appointmentId)
          && !(appointmentId && String(entry.id || '').startsWith('clinote_local_') && entry.appointmentId === appointmentId)
        );
        notes.splice(0, notes.length, nextNote, ...filteredNotes);
        if (appointmentId) {
          delete drafts[appointmentId];
          const existingIndex = appointments.findIndex(entry => entry.id === appointmentId);
          if (existingIndex >= 0) {
            appointments[existingIndex] = {
              ...appointments[existingIndex],
              status: 'completed',
            };
          }
        }
      }

      if (result?.attachment?.id || result?.attachmentId) {
        const nextAttachment = result.attachment ?? {
          id: result.attachmentId,
          attachmentId: result.attachmentId,
          workspaceId: '',
          entityType: item.entityType || 'attachment',
          entityId: item.entityId || '',
          fileName: '',
          mimeType: '',
          fileSize: 0,
          checksum: '',
          localPath: '',
          remoteKey: result.remoteKey || '',
          status: 'uploaded',
        };
        const attachmentKey = String(nextAttachment.attachmentId || nextAttachment.id || '');
        const existingIndex = attachments.findIndex(entry => entry.attachmentId === attachmentKey || entry.id === attachmentKey);
        if (existingIndex >= 0) {
          attachments[existingIndex] = { ...attachments[existingIndex], ...nextAttachment, status: 'uploaded' };
        } else {
          attachments.unshift({ ...nextAttachment, status: 'uploaded' });
        }
      }
    }

    saveBootstrapMutable({
      ...bootstrap,
      generatedAt: nowIso(),
      patients,
      appointments,
      notes,
      drafts,
      attachments,
    });

    return true;
  }

  function applyPulledChanges(changes = {}, checkpoint = '') {
    const bootstrap = getBootstrapMutable();
    const nextBootstrap = {
      ...bootstrap,
      patients: Array.isArray(bootstrap.patients) ? [...bootstrap.patients] : [],
      appointments: Array.isArray(bootstrap.appointments) ? [...bootstrap.appointments] : [],
      notes: Array.isArray(bootstrap.notes) ? [...bootstrap.notes] : [],
      drafts: bootstrap.drafts && typeof bootstrap.drafts === 'object' ? { ...bootstrap.drafts } : {},
      attachments: Array.isArray(bootstrap.attachments) ? [...bootstrap.attachments] : [],
      generatedAt: nowIso(),
    };

    for (const patient of Array.isArray(changes.patients) ? changes.patients : []) {
      const index = nextBootstrap.patients.findIndex(entry => entry.id === patient.id);
      if (index >= 0) nextBootstrap.patients[index] = patient;
      else nextBootstrap.patients.unshift(patient);
    }

    for (const appointment of Array.isArray(changes.appointments) ? changes.appointments : []) {
      const index = nextBootstrap.appointments.findIndex(entry => entry.id === appointment.id);
      if (index >= 0) nextBootstrap.appointments[index] = appointment;
      else nextBootstrap.appointments.unshift(appointment);
    }

    for (const note of Array.isArray(changes.notes) ? changes.notes : []) {
      const appointmentId = String(note?.appointmentId || '').trim();
      nextBootstrap.notes = nextBootstrap.notes.filter(entry =>
        entry.id !== note.id
        && !(appointmentId && entry.appointmentId === appointmentId)
      );
      nextBootstrap.notes.unshift(note);
      if (appointmentId) {
        delete nextBootstrap.drafts[appointmentId];
      }
    }

    for (const [draftKey, draft] of Object.entries(changes.drafts && typeof changes.drafts === 'object' ? changes.drafts : {})) {
      nextBootstrap.drafts[draftKey] = draft;
    }

    for (const attachment of Array.isArray(changes.attachments) ? changes.attachments : []) {
      const attachmentKey = String(attachment?.attachmentId || attachment?.id || '').trim();
      if (!attachmentKey) continue;
      const index = nextBootstrap.attachments.findIndex(entry => entry.attachmentId === attachmentKey || entry.id === attachmentKey);
      if (index >= 0) nextBootstrap.attachments[index] = attachment;
      else nextBootstrap.attachments.unshift(attachment);
    }

    overwriteBootstrapSnapshot(nextBootstrap);
    syncAttachmentsFromBootstrap(nextBootstrap.attachments);
    if (checkpoint) {
      setCheckpoint('workspace', checkpoint);
    }
    touchSuccessfulSync();
    setRebuildRequired(false);
    return true;
  }

  function recordSyncResults(results = []) {
    const transaction = db.transaction(items => {
      const touchedBundleIds = new Set();
      for (const item of items) {
        const mutationId = String(item?.mutationId ?? '').trim();
        if (!mutationId) continue;
        const mutationRow = readRow(`SELECT bundle_id, encrypted_payload FROM outbox_mutations WHERE mutation_id = ?`, [mutationId]);
        if (mutationRow?.bundle_id) {
          touchedBundleIds.add(String(mutationRow.bundle_id));
        }

        if (item.status === 'accepted' || item.status === 'accepted_already_processed') {
          db.prepare(`
            UPDATE outbox_mutations
            SET status = 'processed',
                processed_at = ?,
                last_error_code = '',
                last_error_message = '',
                next_retry_at = ''
            WHERE mutation_id = ?
          `).run(nowIso(), mutationId);

          db.prepare(`DELETE FROM sync_dead_letters WHERE mutation_id = ?`).run(mutationId);
          updateAttachmentStatusFromSync(
            item,
            'uploaded',
            String(item?.canonicalEntity?.remoteKey ?? item?.result?.remoteKey ?? item?.result?.attachment?.remoteKey ?? '')
          );
          continue;
        }

        if (item.status === 'conflict') {
          const localSnapshot = mutationRow?.encrypted_payload
            ? parseJsonText(secrets.decryptText(mutationRow.encrypted_payload), null)
            : null;
          db.prepare(`
            INSERT OR REPLACE INTO sync_conflicts (
              id, mutation_id, bundle_id, entity_type, entity_id, conflict_type, details_json,
              local_summary, server_summary, local_snapshot_json, server_snapshot_json, server_base_version,
              resolution_status, chosen_action, resolution_reason, created_at, resolved_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', '', '', COALESCE((SELECT created_at FROM sync_conflicts WHERE id = ?), CURRENT_TIMESTAMP), '')
          `).run(
            `conflict_${mutationId}`,
            mutationId,
            String(mutationRow?.bundle_id ?? ''),
            String(item.entityType ?? ''),
            String(item.entityId ?? ''),
            String(item.conflictType ?? 'mutation_conflict'),
            JSON.stringify(item),
            summarizeSnapshot(localSnapshot),
            summarizeSnapshot(item.serverSnapshot),
            localSnapshot ? JSON.stringify(localSnapshot) : '',
            item.serverSnapshot ? JSON.stringify(item.serverSnapshot) : '',
            String(item.serverBaseVersion ?? ''),
            `conflict_${mutationId}`
          );

          db.prepare(`
            INSERT OR REPLACE INTO sync_dead_letters (id, mutation_id, reason_code, reason_message, created_at)
            VALUES (?, ?, 'CONFLICT', ?, COALESCE((SELECT created_at FROM sync_dead_letters WHERE mutation_id = ?), CURRENT_TIMESTAMP))
          `).run(`dead_${mutationId}`, mutationId, String(item.errorMessage ?? item.error ?? 'Conflict requires attention'), mutationId);

          db.prepare(`
            UPDATE outbox_mutations
            SET status = 'dead_letter',
                last_error_code = 'CONFLICT',
                last_error_message = ?,
                next_retry_at = ''
            WHERE mutation_id = ?
          `).run(String(item.errorMessage ?? item.error ?? 'Conflict requires attention'), mutationId);
          updateAttachmentStatusFromSync(item, 'failed');
          continue;
        }

        if (['validation_rejected', 'permission_rejected', 'entitlement_rejected'].includes(item.status)) {
          db.prepare(`
            INSERT OR REPLACE INTO sync_dead_letters (id, mutation_id, reason_code, reason_message, created_at)
            VALUES (?, ?, ?, ?, COALESCE((SELECT created_at FROM sync_dead_letters WHERE mutation_id = ?), CURRENT_TIMESTAMP))
          `).run(`dead_${mutationId}`, mutationId, String(item.errorCode || item.status).toUpperCase(), String(item.errorMessage ?? item.error ?? ''), mutationId);

          db.prepare(`
            UPDATE outbox_mutations
            SET status = 'dead_letter',
                last_error_code = ?,
                last_error_message = ?,
                next_retry_at = ''
            WHERE mutation_id = ?
          `).run(String(item.errorCode || item.status).toUpperCase(), String(item.errorMessage ?? item.error ?? ''), mutationId);
          updateAttachmentStatusFromSync(item, 'failed');
          continue;
        }

        const existing = readRow(`SELECT retry_count FROM outbox_mutations WHERE mutation_id = ?`, [mutationId]);
        const nextRetryCount = Number(existing?.retry_count || 0) + 1;
        const nextRetryAt = new Date(Date.now() + Math.min(30, 2 ** nextRetryCount) * 1000).toISOString();
        const shouldDeadLetter = nextRetryCount >= 5;

        if (shouldDeadLetter) {
          db.prepare(`
            INSERT OR REPLACE INTO sync_dead_letters (id, mutation_id, reason_code, reason_message, created_at)
            VALUES (?, ?, 'RETRY_EXHAUSTED', ?, COALESCE((SELECT created_at FROM sync_dead_letters WHERE mutation_id = ?), CURRENT_TIMESTAMP))
          `).run(`dead_${mutationId}`, mutationId, String(item.errorMessage ?? item.error ?? 'Retry attempts exhausted'), mutationId);

          db.prepare(`
            UPDATE outbox_mutations
            SET status = 'dead_letter',
                retry_count = ?,
                last_error_code = 'RETRY_EXHAUSTED',
                last_error_message = ?,
                next_retry_at = ''
            WHERE mutation_id = ?
          `).run(nextRetryCount, String(item.errorMessage ?? item.error ?? 'Retry attempts exhausted'), mutationId);
          updateAttachmentStatusFromSync(item, 'failed');
        } else {
          db.prepare(`
            UPDATE outbox_mutations
            SET status = 'retryable',
                retry_count = ?,
                last_error_code = ?,
                last_error_message = ?,
                next_retry_at = ?
            WHERE mutation_id = ?
          `).run(nextRetryCount, String(item.errorCode || item.status || 'RETRYABLE_FAILURE').toUpperCase(), String(item.errorMessage ?? item.error ?? ''), nextRetryAt, mutationId);
          updateAttachmentStatusFromSync(item, 'pending');
        }
      }

      for (const bundleId of touchedBundleIds) {
        refreshBundleState(bundleId);
      }
    });

    transaction(results);
  }

  function getCheckpoint(streamKey = 'default') {
    return readRow(`SELECT checkpoint_value FROM pull_checkpoints WHERE stream_key = ?`, [streamKey])?.checkpoint_value ?? '';
  }

  function setCheckpoint(streamKey = 'default', checkpointValue = '') {
    db.prepare(`
      INSERT INTO pull_checkpoints (stream_key, checkpoint_value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(stream_key) DO UPDATE SET
        checkpoint_value = excluded.checkpoint_value,
        updated_at = CURRENT_TIMESTAMP
    `).run(streamKey, checkpointValue);
    return true;
  }

  function applyPulledBootstrap(snapshot, checkpoint = '') {
    updateBootstrapSnapshot(snapshot);
    syncAttachmentsFromBootstrap(snapshot?.attachments ?? []);
    if (checkpoint) {
      setCheckpoint('workspace', checkpoint);
    }
    touchSuccessfulSync();
    setRebuildRequired(false);
    return true;
  }

  function enqueueAttachmentTransfer(attachment) {
    db.prepare(`
      INSERT OR REPLACE INTO attachment_transfers (
        id, attachment_id, workspace_id, entity_type, entity_id, patient_id, appointment_id, file_name, mime_type, file_size, checksum,
        local_path, remote_key, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM attachment_transfers WHERE id = ?), CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
    `).run(
      attachment.id,
      attachment.attachmentId,
      attachment.workspaceId || '',
      attachment.entityType || '',
      attachment.entityId || '',
      attachment.patientId || '',
      attachment.appointmentId || '',
      attachment.fileName || '',
      attachment.mimeType || '',
      attachment.fileSize || 0,
      attachment.checksum || '',
      attachment.localPath || '',
      attachment.remoteKey || '',
      attachment.status || 'pending',
      attachment.id
    );
  }

  function syncAttachmentsFromBootstrap(attachments = []) {
    const transaction = db.transaction(items => {
      for (const attachment of items) {
        if (!attachment?.attachmentId) continue;
        db.prepare(`
          INSERT INTO attachment_transfers (
            id, attachment_id, workspace_id, entity_type, entity_id, patient_id, appointment_id, file_name, mime_type, file_size, checksum,
            local_path, remote_key, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            attachment_id = excluded.attachment_id,
            workspace_id = excluded.workspace_id,
            entity_type = excluded.entity_type,
            entity_id = excluded.entity_id,
            patient_id = excluded.patient_id,
            appointment_id = excluded.appointment_id,
            file_name = excluded.file_name,
            mime_type = excluded.mime_type,
            file_size = excluded.file_size,
            checksum = CASE WHEN excluded.checksum <> '' THEN excluded.checksum ELSE attachment_transfers.checksum END,
            remote_key = CASE WHEN excluded.remote_key <> '' THEN excluded.remote_key ELSE attachment_transfers.remote_key END,
            status = CASE
              WHEN attachment_transfers.status IN ('pending', 'uploading') THEN attachment_transfers.status
              ELSE excluded.status
            END,
            updated_at = excluded.updated_at
        `).run(
          attachment.id || attachment.attachmentId,
          attachment.attachmentId,
          attachment.workspaceId || '',
          attachment.entityType || '',
          attachment.entityId || '',
          attachment.patientId || '',
          attachment.appointmentId || '',
          attachment.fileName || '',
          attachment.mimeType || '',
          attachment.fileSize || 0,
          attachment.checksum || '',
          attachment.localPath || '',
          attachment.remoteKey || '',
          attachment.status || 'uploaded',
          attachment.createdAt || nowIso(),
          attachment.updatedAt || nowIso()
        );
      }
    });

    transaction(Array.isArray(attachments) ? attachments : []);
  }

  function listAttachments({ patientId = '', appointmentId = '' } = {}) {
    let rows = [];
    if (appointmentId && patientId) {
      rows = db.prepare(`
        SELECT *
        FROM attachment_transfers
        WHERE appointment_id = ? OR patient_id = ?
        ORDER BY updated_at DESC, created_at DESC
      `).all(appointmentId, patientId);
    } else if (appointmentId) {
      rows = db.prepare(`
        SELECT *
        FROM attachment_transfers
        WHERE appointment_id = ?
        ORDER BY updated_at DESC, created_at DESC
      `).all(appointmentId);
    } else if (patientId) {
      rows = db.prepare(`
        SELECT *
        FROM attachment_transfers
        WHERE patient_id = ?
        ORDER BY updated_at DESC, created_at DESC
      `).all(patientId);
    } else {
      rows = db.prepare(`
        SELECT *
        FROM attachment_transfers
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 100
      `).all();
    }

    return rows.map(row => ({
      id: row.id,
      attachmentId: row.attachment_id,
      workspaceId: row.workspace_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      patientId: row.patient_id,
      appointmentId: row.appointment_id,
      fileName: row.file_name,
      mimeType: row.mime_type,
      fileSize: row.file_size,
      checksum: row.checksum,
      localPath: row.local_path,
      remoteKey: row.remote_key,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  function listSyncIssues() {
    const pending = db.prepare(`
      SELECT mutation_id, entity_type, entity_id, operation_type, created_local_at, status, retry_count, last_error_code, last_error_message
      FROM outbox_mutations
      WHERE status IN ('pending', 'retryable')
      ORDER BY created_local_at ASC
      LIMIT 100
    `).all();

    const deadLetters = db.prepare(`
      SELECT id, mutation_id, reason_code, reason_message, created_at
      FROM sync_dead_letters
      ORDER BY created_at DESC
      LIMIT 100
    `).all();

    const conflicts = db.prepare(`
      SELECT id, mutation_id, bundle_id, entity_type, entity_id, conflict_type, details_json, local_summary, server_summary,
             local_snapshot_json, server_snapshot_json, server_base_version, resolution_status, chosen_action, created_at, resolved_at
             , resolution_reason
      FROM sync_conflicts
      WHERE resolved_at = ''
      ORDER BY created_at DESC
      LIMIT 100
    `).all().map(item => ({
      ...item,
      local_snapshot: parseJsonText(item.local_snapshot_json, null),
      server_snapshot: parseJsonText(item.server_snapshot_json, null),
    }));

    return { pending, deadLetters, conflicts };
  }

  function sanitizeSyncIssuesForDiagnostics(issues) {
    return {
      pending: (issues?.pending ?? []).map(item => ({
        mutation_id: item.mutation_id,
        entity_type: item.entity_type,
        entity_id: item.entity_id,
        operation_type: item.operation_type,
        created_local_at: item.created_local_at,
        status: item.status,
        retry_count: item.retry_count,
        last_error_code: item.last_error_code,
      })),
      deadLetters: (issues?.deadLetters ?? []).map(item => ({
        id: item.id,
        mutation_id: item.mutation_id,
        reason_code: item.reason_code,
        created_at: item.created_at,
      })),
      conflicts: (issues?.conflicts ?? []).map(item => ({
        id: item.id,
        mutation_id: item.mutation_id,
        bundle_id: item.bundle_id,
        entity_type: item.entity_type,
        entity_id: item.entity_id,
        conflict_type: item.conflict_type,
        created_at: item.created_at,
        resolved_at: item.resolved_at,
        resolution_status: item.resolution_status,
        chosen_action: item.chosen_action,
      })),
    };
  }

  function retryRetryableBundles() {
    db.transaction(() => {
      db.prepare(`
        UPDATE outbox_mutations
        SET status = 'pending',
            last_error_code = '',
            last_error_message = '',
            next_retry_at = ''
        WHERE status = 'retryable'
      `).run();
      db.prepare(`
        UPDATE sync_bundles
        SET status = 'pending',
            last_error_code = '',
            last_error_message = '',
            updated_at = CURRENT_TIMESTAMP
        WHERE status = 'retryable'
      `).run();
    })();
    return { ok: true };
  }

  function resolveConflict({ conflictId = '', action = '' } = {}) {
    const conflict = readRow(`SELECT * FROM sync_conflicts WHERE id = ? LIMIT 1`, [conflictId]);
    if (!conflict) {
      return { ok: false, code: 'CONFLICT_NOT_FOUND', message: 'Conflict could not be found.' };
    }

    const mutationId = String(conflict.mutation_id || '').trim();
    const bundleId = String(conflict.bundle_id || '').trim();
    const entityType = String(conflict.entity_type || '').trim();
    const entityId = String(conflict.entity_id || '').trim();
    const conflictType = String(conflict.conflict_type || '').trim();
    const serverSnapshot = parseJsonText(conflict.server_snapshot_json, null);
    const localSnapshot = parseJsonText(conflict.local_snapshot_json, null);
    const serverBaseVersion = String(conflict.server_base_version || '').trim();
    const requestedAction = String(action || '').trim();
    const systemDecision = requestedAction === 'system_decide'
      ? decideSystemConflictResolution(conflictType, localSnapshot, serverSnapshot, serverBaseVersion)
      : null;
    const resolvedAction = systemDecision?.action || requestedAction;
    const resolutionReason = systemDecision?.reason || '';

    db.transaction(() => {
      if (resolvedAction === 'discard_local' || resolvedAction === 'use_server' || resolvedAction === 'refresh_from_server') {
        if (mutationId) {
          db.prepare(`DELETE FROM outbox_mutations WHERE mutation_id = ?`).run(mutationId);
          db.prepare(`DELETE FROM sync_dead_letters WHERE mutation_id = ?`).run(mutationId);
        }
        applyServerSnapshotToBootstrap(entityType, entityId, serverSnapshot || {}, localSnapshot);
      } else if (resolvedAction === 'use_local' || resolvedAction === 'retry_with_server_version' || resolvedAction === 'retry_allowed_transition' || resolvedAction === 'keep_local_as_new_draft') {
        if (mutationId) {
          db.prepare(`
            UPDATE outbox_mutations
            SET status = 'pending',
                base_version = ?,
                last_error_code = '',
                last_error_message = '',
                next_retry_at = ''
            WHERE mutation_id = ?
          `).run(serverBaseVersion, mutationId);
          db.prepare(`DELETE FROM sync_dead_letters WHERE mutation_id = ?`).run(mutationId);
        }
      }

      db.prepare(`
        UPDATE sync_conflicts
        SET resolution_status = 'resolved',
            chosen_action = ?,
            resolution_reason = ?,
            resolved_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        requestedAction === 'system_decide'
          ? `system_decide:${resolvedAction}`
          : String(resolvedAction || ''),
        resolutionReason,
        conflictId
      );

      if (bundleId) {
        refreshBundleState(bundleId);
      }
    })();

    recordAuditEvent('sync_conflict_resolved', 'info', {
      conflictId,
      entityType,
      entityId,
      conflictType,
      action: requestedAction,
      resolvedAction,
      bundleId,
    });

    return {
      ok: true,
      action: resolvedAction,
      message: requestedAction === 'system_decide'
        ? `System chose ${resolvedAction.replaceAll('_', ' ')}. ${resolutionReason}`
        : '',
    };
  }

  function wipeLocalState() {
    db.transaction(() => {
      db.prepare(`DELETE FROM auth_cache`).run();
      db.prepare(`DELETE FROM outbox_mutations`).run();
      db.prepare(`DELETE FROM sync_bundles`).run();
      db.prepare(`DELETE FROM pull_checkpoints`).run();
      db.prepare(`DELETE FROM sync_runs`).run();
      db.prepare(`DELETE FROM sync_conflicts`).run();
      db.prepare(`DELETE FROM sync_dead_letters`).run();
      db.prepare(`DELETE FROM attachment_transfers`).run();
      db.prepare(`DELETE FROM device_entitlements`).run();
      db.prepare(`DELETE FROM local_pin`).run();
      db.prepare(`DELETE FROM desktop_meta`).run();
      db.prepare(`
        UPDATE sync_state
        SET is_locked = 0,
            last_successful_sync_at = '',
            last_sync_status = 'idle',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `).run();
    })();
    recordAuditEvent('local_state_wiped', 'warn', {});
    return { ok: true };
  }

  function resetSyncState() {
    db.transaction(() => {
      db.prepare(`DELETE FROM sync_dead_letters`).run();
      db.prepare(`DELETE FROM sync_conflicts`).run();
      db.prepare(`
        UPDATE outbox_mutations
        SET status = 'pending',
            last_error_code = '',
            last_error_message = '',
            next_retry_at = ''
        WHERE status IN ('retryable', 'dead_letter')
      `).run();
      db.prepare(`
        UPDATE sync_bundles
        SET status = 'pending',
            committed_item_count = (
              SELECT COUNT(*)
              FROM outbox_mutations
              WHERE outbox_mutations.bundle_id = sync_bundles.bundle_id
                AND outbox_mutations.status = 'processed'
            ),
            completed_at = CASE
              WHEN EXISTS (
                SELECT 1
                FROM outbox_mutations
                WHERE outbox_mutations.bundle_id = sync_bundles.bundle_id
                  AND outbox_mutations.status = 'processed'
              ) THEN completed_at
              ELSE ''
            END,
            last_error_code = '',
            last_error_message = '',
            updated_at = CURRENT_TIMESTAMP
        WHERE status IN ('retryable', 'dead_letter', 'conflict', 'syncing')
      `).run();
      db.prepare(`
        UPDATE sync_state
        SET last_sync_status = 'idle', updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `).run();
    })();
    recordAuditEvent('sync_state_reset', 'info', {});
    return { ok: true };
  }

  function startSyncRun(runType = 'sync') {
    const runId = `syncrun_${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO sync_runs (id, run_type, status, started_at, summary_json)
      VALUES (?, ?, 'running', ?, '{}')
    `).run(runId, runType, nowIso());
    return runId;
  }

  function finishSyncRun(runId, status = 'completed', summary = {}) {
    db.prepare(`
      UPDATE sync_runs
      SET status = ?,
          finished_at = ?,
          summary_json = ?
      WHERE id = ?
    `).run(status, nowIso(), JSON.stringify(summary ?? {}), runId);
    return true;
  }

  function summarizeOutbox() {
    const byStatus = db.prepare(`
      SELECT status, COUNT(*) AS count
      FROM outbox_mutations
      GROUP BY status
      ORDER BY status ASC
    `).all();
    const byEntity = db.prepare(`
      SELECT entity_type, operation_type, status, COUNT(*) AS count
      FROM outbox_mutations
      GROUP BY entity_type, operation_type, status
      ORDER BY entity_type ASC, operation_type ASC, status ASC
    `).all();
    const recentRuns = db.prepare(`
      SELECT id, run_type, status, started_at, finished_at, summary_json
      FROM sync_runs
      ORDER BY started_at DESC
      LIMIT 20
    `).all();
    const bundlesByStatus = db.prepare(`
      SELECT status, COUNT(*) AS count
      FROM sync_bundles
      GROUP BY status
      ORDER BY status ASC
    `).all();
    const deadLettersByReason = db.prepare(`
      SELECT reason_code, COUNT(*) AS count
      FROM sync_dead_letters
      GROUP BY reason_code
      ORDER BY count DESC, reason_code ASC
    `).all();
    const conflictsByType = db.prepare(`
      SELECT conflict_type, COUNT(*) AS count
      FROM sync_conflicts
      WHERE resolved_at = ''
      GROUP BY conflict_type
      ORDER BY count DESC, conflict_type ASC
    `).all();
    const oldestPendingBundle = db.prepare(`
      SELECT created_at
      FROM sync_bundles
      WHERE status IN ('pending', 'retryable', 'syncing', 'conflict')
      ORDER BY created_at ASC
      LIMIT 1
    `).get();

    const oldestPendingBundleAgeMinutes = oldestPendingBundle?.created_at
      ? Math.max(0, Math.floor((Date.now() - new Date(oldestPendingBundle.created_at).getTime()) / (60 * 1000)))
      : 0;

    return {
      byStatus,
      byEntity,
      bundlesByStatus,
      deadLettersByReason,
      conflictsByType,
      oldestPendingBundleAgeMinutes,
      recentRuns,
    };
  }

  function verifyIntegrity({ persist = true, source = 'manual' } = {}) {
    const issues = [];
    let integrity = 'unknown';
    let ok = false;

    try {
      const result = db.pragma('integrity_check', { simple: true });
      integrity = String(result || '').trim() || 'unknown';
      ok = integrity.toLowerCase() === 'ok';
      if (!ok) {
        issues.push(`SQLite integrity check returned: ${integrity}`);
      }
    } catch (error) {
      ok = false;
      integrity = 'error';
      issues.push(error instanceof Error ? error.message : 'SQLite integrity check failed');
    }

    const checkedAt = nowIso();
    setMeta('last_integrity_check_at', checkedAt);
    setMeta('last_integrity_check_status', ok ? 'ok' : 'failed');
    setMeta('last_integrity_check_source', source);

    if (!ok && persist) {
      setRebuildRequired(true, 'Local desktop database failed integrity verification. Export a backup if possible, then rebuild the cache before continuing.');
    }

    if (persist) {
      recordAuditEvent(ok ? 'local_integrity_ok' : 'local_integrity_failed', ok ? 'info' : 'error', {
        source,
        integrity,
        issues,
      });
    }

    return {
      ok,
      integrity,
      checkedAt,
      issues,
      rebuildRequired: !ok,
    };
  }

  function exportLocalBackup(targetPath, { reason = 'manual_export' } = {}) {
    const filePath = String(targetPath || '').trim();
    if (!filePath) {
      return { ok: false, code: 'INVALID_BACKUP_PATH', message: 'Backup file path is required.' };
    }

    const backupDir = path.dirname(filePath);
    fs.mkdirSync(backupDir, { recursive: true });
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    const quotedPath = filePath.replace(/'/g, "''");
    db.exec(`VACUUM INTO '${quotedPath}'`);

    const manifestPath = `${filePath}.manifest.json`;
    const attachmentCounts = db.prepare(`
      SELECT status, COUNT(*) AS count
      FROM attachment_transfers
      GROUP BY status
      ORDER BY status ASC
    `).all();
    const manifest = {
      exportedAt: nowIso(),
      reason,
      appVersion,
      sourceDatabase: dbPath,
      backupFile: filePath,
      attachments: {
        total: readRow(`SELECT COUNT(*) AS count FROM attachment_transfers`)?.count ?? 0,
        byStatus: attachmentCounts,
      },
      runtime: {
        deviceId: getRuntimeInfo().deviceId,
        checkpoint: getCheckpoint('workspace'),
      },
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    setMeta('last_backup_export_at', manifest.exportedAt);
    recordAuditEvent('local_backup_exported', 'info', {
      backupFile: filePath,
      manifestFile: manifestPath,
      reason,
    });

    return {
      ok: true,
      filePath,
      manifestPath,
    };
  }

  function ensureUpgradeBackupIfNeeded() {
    const previousVersion = getMeta('desktop_app_version', '');
    if (previousVersion === appVersion) return false;

    const backupDir = path.join(dataDir, 'upgrade-backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = nowIso().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `pre-upgrade-${sanitizeFileName(previousVersion || 'fresh-install')}-to-${sanitizeFileName(appVersion)}-${stamp}.sqlite`);
    const result = exportLocalBackup(backupFile, {
      reason: previousVersion ? 'pre_upgrade' : 'initial_version_snapshot',
    });

    if (!result.ok) {
      throw new Error(result.message || 'Unable to create pre-upgrade backup.');
    }

    setMeta('desktop_app_version', appVersion);
    setMeta('last_upgrade_backup_path', result.filePath || '');
    return true;
  }

  function sanitizeFileName(value) {
    return String(value || '').trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
  }

  function exportDiagnosticsSnapshot({ includeSensitive = false } = {}) {
    const bootstrap = getBootstrapMutable();
    const issues = listSyncIssues();
    const runtime = getRuntimeInfo();
    return {
      exportedAt: nowIso(),
      runtime,
      issues: includeSensitive ? issues : sanitizeSyncIssuesForDiagnostics(issues),
      checkpoint: getCheckpoint('workspace'),
      rebuildRequired: getMeta('rebuild_required', '') === '1',
      rebuildReason: getMeta('rebuild_reason', ''),
      compatibility: {
        appVersion,
      },
      localSafety: {
        lastIntegrityCheckAt: getMeta('last_integrity_check_at', ''),
        lastIntegrityCheckStatus: getMeta('last_integrity_check_status', ''),
        lastBackupExportAt: getMeta('last_backup_export_at', ''),
      },
      syncSummary: summarizeOutbox(),
      counts: {
        patients: Array.isArray(bootstrap.patients) ? bootstrap.patients.length : 0,
        appointments: Array.isArray(bootstrap.appointments) ? bootstrap.appointments.length : 0,
        notes: Array.isArray(bootstrap.notes) ? bootstrap.notes.length : 0,
        drafts: bootstrap.drafts && typeof bootstrap.drafts === 'object' ? Object.keys(bootstrap.drafts).length : 0,
        outbox: readRow(`SELECT COUNT(*) AS count FROM outbox_mutations`)?.count ?? 0,
        bundles: readRow(`SELECT COUNT(*) AS count FROM sync_bundles`)?.count ?? 0,
        attachments: readRow(`SELECT COUNT(*) AS count FROM attachment_transfers`)?.count ?? 0,
      },
    };
  }

  ensureUpgradeBackupIfNeeded();
  const startupIntegrity = verifyIntegrity({ persist: true, source: 'startup' });
  if (!startupIntegrity.ok) {
    markSyncStatus('attention');
  }

  const pinConfigured = Boolean(readRow(`SELECT pin_hash FROM local_pin WHERE id = 1`)?.pin_hash);
  if (pinConfigured) {
    setLocked(true);
  }

  return {
    getRuntimeInfo,
    setLocked,
    setPin,
    verifyPin,
    saveBootstrapSession,
    getStoredToken,
    clearStoredToken,
    getCachedBootstrap,
    overwriteBootstrapSnapshot,
    updateBootstrapSnapshot,
    enqueueMutation,
    getPendingMutations,
    getPendingBundles,
    markBundlesSyncing,
    recordSyncResults,
    getCheckpoint,
    setCheckpoint,
    applyPulledBootstrap,
    markSyncStatus,
    touchSuccessfulSync,
    upsertEntitlement,
    applyAcceptedSyncResults,
    applyPulledChanges,
    listSyncIssues,
    retryRetryableBundles,
    resolveConflict,
    wipeLocalState,
    resetSyncState,
    startSyncRun,
    finishSyncRun,
    exportDiagnosticsSnapshot,
    exportLocalBackup,
    verifyIntegrity,
    recordAuditEvent,
    setRebuildRequired,
    enqueueAttachmentTransfer,
    listAttachments,
    dataDir,
    close: () => db.close(),
  };
}

module.exports = {
  createDesktopDatabase,
};
