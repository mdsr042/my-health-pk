const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const crypto = require('node:crypto');

function createDesktopDatabase({ userDataPath, secrets }) {
  const dataDir = path.join(userDataPath, 'desktop-data');
  fs.mkdirSync(dataDir, { recursive: true });

  const db = new Database(path.join(dataDir, 'offline-client.sqlite'));
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

  const initialDeviceId = `desktop_${crypto.randomUUID()}`;
  db.prepare(`
    INSERT INTO sync_state (id, device_id, is_locked, last_sync_status)
    VALUES (1, ?, 0, 'idle')
    ON CONFLICT(id) DO NOTHING
  `).run(initialDeviceId);

  function nowIso() {
    return new Date().toISOString();
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
      oldestPendingAt: oldestPending || '',
      entitlement: effectiveEntitlement,
    };
  }

  function setLocked(isLocked) {
    db.prepare(`
      UPDATE sync_state
      SET is_locked = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(isLocked ? 1 : 0);
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
    return setLocked(false);
  }

  function verifyPin(pin) {
    const entitlement = readRow(`SELECT * FROM device_entitlements WHERE id = 1`);
    if (entitlement?.status === 'locked') {
      return {
        ok: false,
        code: 'ENTITLEMENT_LOCKED',
        message: entitlement.lock_message || 'Your trial/subscription has ended. Renew it to continue using the app.',
      };
    }

    const pinState = readRow(`SELECT * FROM local_pin WHERE id = 1`);
    if (!pinState?.pin_hash) {
      return { ok: false, code: 'PIN_NOT_CONFIGURED', message: 'PIN is not configured yet.' };
    }

    if (pinState.locked_until && new Date(pinState.locked_until).getTime() > Date.now()) {
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
      return { ok: false, code: nextAttempts >= 5 ? 'PIN_TEMP_LOCKED' : 'INVALID_PIN', message: nextAttempts >= 5 ? 'Too many attempts. Try again in 5 minutes.' : 'Incorrect PIN.' };
    }

    db.prepare(`
      UPDATE local_pin
      SET failed_attempts = 0, locked_until = '', updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run();

    setLocked(false);
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

  function getCachedBootstrap() {
    const row = readRow(`SELECT encrypted_session, encrypted_bootstrap FROM auth_cache WHERE id = 1`);
    return {
      session: row?.encrypted_session ? JSON.parse(secrets.decryptText(row.encrypted_session)) : null,
      bootstrap: row?.encrypted_bootstrap ? JSON.parse(secrets.decryptText(row.encrypted_bootstrap)) : null,
    };
  }

  function enqueueMutation(mutation) {
    db.prepare(`
      INSERT OR REPLACE INTO outbox_mutations (
        mutation_id, device_id, workspace_id, entity_type, entity_id, operation_type,
        encrypted_payload, base_version, created_local_at, status, retry_count,
        last_error_code, last_error_message, next_retry_at, processed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      mutation.mutationId,
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
  }

  function getPendingMutations(limit = 50) {
    const rows = db.prepare(`
      SELECT mutation_id, device_id, workspace_id, entity_type, entity_id, operation_type, encrypted_payload,
             base_version, created_local_at, status, retry_count, last_error_code, last_error_message, next_retry_at
      FROM outbox_mutations
      WHERE status IN ('pending', 'retryable')
        AND (next_retry_at = '' OR next_retry_at <= ?)
      ORDER BY created_local_at ASC
      LIMIT ?
    `).all(nowIso(), limit);

    return rows.map(row => ({
      mutationId: row.mutation_id,
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
      const result = item?.result ?? {};

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
    return true;
  }

  function recordSyncResults(results = []) {
    const transaction = db.transaction(items => {
      for (const item of items) {
        const mutationId = String(item?.mutationId ?? '').trim();
        if (!mutationId) continue;

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
            String(item?.result?.remoteKey ?? item?.result?.attachment?.remoteKey ?? '')
          );
          continue;
        }

        if (item.status === 'conflict') {
          db.prepare(`
            INSERT OR REPLACE INTO sync_conflicts (id, entity_type, entity_id, conflict_type, details_json, created_at, resolved_at)
            VALUES (?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM sync_conflicts WHERE id = ?), CURRENT_TIMESTAMP), '')
          `).run(
            `conflict_${mutationId}`,
            String(item.entityType ?? ''),
            String(item.entityId ?? ''),
            String(item.conflictType ?? 'mutation_conflict'),
            JSON.stringify(item),
            `conflict_${mutationId}`
          );

          db.prepare(`
            INSERT OR REPLACE INTO sync_dead_letters (id, mutation_id, reason_code, reason_message, created_at)
            VALUES (?, ?, 'CONFLICT', ?, COALESCE((SELECT created_at FROM sync_dead_letters WHERE mutation_id = ?), CURRENT_TIMESTAMP))
          `).run(`dead_${mutationId}`, mutationId, String(item.error ?? 'Conflict requires attention'), mutationId);

          db.prepare(`
            UPDATE outbox_mutations
            SET status = 'dead_letter',
                last_error_code = 'CONFLICT',
                last_error_message = ?,
                next_retry_at = ''
            WHERE mutation_id = ?
          `).run(String(item.error ?? 'Conflict requires attention'), mutationId);
          updateAttachmentStatusFromSync(item, 'failed');
          continue;
        }

        if (['validation_rejected', 'permission_rejected', 'entitlement_rejected'].includes(item.status)) {
          db.prepare(`
            INSERT OR REPLACE INTO sync_dead_letters (id, mutation_id, reason_code, reason_message, created_at)
            VALUES (?, ?, ?, ?, COALESCE((SELECT created_at FROM sync_dead_letters WHERE mutation_id = ?), CURRENT_TIMESTAMP))
          `).run(`dead_${mutationId}`, mutationId, String(item.status).toUpperCase(), String(item.error ?? ''), mutationId);

          db.prepare(`
            UPDATE outbox_mutations
            SET status = 'dead_letter',
                last_error_code = ?,
                last_error_message = ?,
                next_retry_at = ''
            WHERE mutation_id = ?
          `).run(String(item.status).toUpperCase(), String(item.error ?? ''), mutationId);
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
          `).run(`dead_${mutationId}`, mutationId, String(item.error ?? 'Retry attempts exhausted'), mutationId);

          db.prepare(`
            UPDATE outbox_mutations
            SET status = 'dead_letter',
                retry_count = ?,
                last_error_code = 'RETRY_EXHAUSTED',
                last_error_message = ?,
                next_retry_at = ''
            WHERE mutation_id = ?
          `).run(nextRetryCount, String(item.error ?? 'Retry attempts exhausted'), mutationId);
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
          `).run(nextRetryCount, String(item.status || 'RETRYABLE_FAILURE').toUpperCase(), String(item.error ?? ''), nextRetryAt, mutationId);
          updateAttachmentStatusFromSync(item, 'pending');
        }
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
      SELECT id, entity_type, entity_id, conflict_type, details_json, created_at, resolved_at
      FROM sync_conflicts
      WHERE resolved_at = ''
      ORDER BY created_at DESC
      LIMIT 100
    `).all();

    return { pending, deadLetters, conflicts };
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
        UPDATE sync_state
        SET last_sync_status = 'idle', updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `).run();
    })();
    return { ok: true };
  }

  function exportDiagnosticsSnapshot() {
    const bootstrap = getBootstrapMutable();
    return {
      exportedAt: nowIso(),
      runtime: getRuntimeInfo(),
      issues: listSyncIssues(),
      checkpoint: getCheckpoint('workspace'),
      counts: {
        patients: Array.isArray(bootstrap.patients) ? bootstrap.patients.length : 0,
        appointments: Array.isArray(bootstrap.appointments) ? bootstrap.appointments.length : 0,
        notes: Array.isArray(bootstrap.notes) ? bootstrap.notes.length : 0,
        drafts: bootstrap.drafts && typeof bootstrap.drafts === 'object' ? Object.keys(bootstrap.drafts).length : 0,
        outbox: readRow(`SELECT COUNT(*) AS count FROM outbox_mutations`)?.count ?? 0,
        attachments: readRow(`SELECT COUNT(*) AS count FROM attachment_transfers`)?.count ?? 0,
      },
    };
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
    resetSyncState,
    exportDiagnosticsSnapshot,
    enqueueAttachmentTransfer,
    listAttachments,
    dataDir,
  };
}

module.exports = {
  createDesktopDatabase,
};
