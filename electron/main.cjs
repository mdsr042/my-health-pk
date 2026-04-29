const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { app, BrowserWindow, dialog, ipcMain, shell, safeStorage } = require('electron');
const { createSecretManager } = require('./services/crypto.cjs');
const { createDesktopDatabase } = require('./services/local-db.cjs');

let mainWindow = null;
let desktopDb = null;
let secretManager = null;
const desktopApiBase = process.env.ELECTRON_API_URL || process.env.DESKTOP_API_URL || 'http://localhost:4001/api';
const desktopClientVersion = app.getVersion();

function getDesktopRequestHeaders(token = '') {
  const runtime = desktopDb?.getRuntimeInfo?.() ?? null;
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'X-Desktop-Version': desktopClientVersion,
    ...(runtime?.deviceId ? { 'X-Desktop-Device-Id': runtime.deviceId } : {}),
  };
}

function showStartupError(error) {
  const message = error instanceof Error ? error.message : 'Unknown startup error';
  const detail = error instanceof Error ? error.stack || message : String(error);

  dialog.showErrorBox(
    'My Health Desktop Failed To Start',
    `${message}\n\nIf this mentions better-sqlite3, run:\n\nnpm run desktop:rebuild-native`
  );
  console.error('desktop_startup_failed', detail);
}

function sanitizePathSegment(value, fallback = 'unknown') {
  const normalized = String(value ?? '').trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

async function runDesktopSync() {
  const token = desktopDb.getStoredToken();
  const syncRunId = desktopDb.startSyncRun('push_pull');
  if (!token) {
    desktopDb.markSyncStatus('offline');
    desktopDb.finishSyncRun(syncRunId, 'blocked', { code: 'NO_TOKEN' });
    return { ok: false, code: 'NO_TOKEN' };
  }

  const currentRuntime = desktopDb.getRuntimeInfo();
  if (currentRuntime.entitlement?.status === 'locked') {
    desktopDb.markSyncStatus('attention');
    desktopDb.finishSyncRun(syncRunId, 'blocked', {
      code: 'ENTITLEMENT_LOCKED',
      entitlementStatus: currentRuntime.entitlement.status,
    });
    return { ok: false, code: 'ENTITLEMENT_LOCKED', message: currentRuntime.entitlement.lockMessage || 'Desktop access is locked until the subscription is renewed.' };
  }

  const pushBlockedByRestriction = currentRuntime.entitlement?.status === 'restricted';
  desktopDb.markSyncStatus('syncing');
  const pendingBundles = desktopDb.getPendingBundles(20);
  const pending = pendingBundles.flatMap(bundle => bundle.mutations);
  let pushResults = [];
  let pushBundleResults = [];

  try {
    if (pendingBundles.length > 0 && !pushBlockedByRestriction) {
      desktopDb.markBundlesSyncing(pendingBundles.map(bundle => bundle.bundleId));
      const pushResponse = await fetch(`${desktopApiBase}/sync/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getDesktopRequestHeaders(token),
        },
        body: JSON.stringify({ bundles: pendingBundles }),
      });

      const pushBody = await pushResponse.json();
      if (!pushResponse.ok) {
        if (pushResponse.status === 426 || pushBody?.code === 'DESKTOP_CLIENT_OUTDATED') {
          desktopDb.markSyncStatus('attention');
          desktopDb.finishSyncRun(syncRunId, 'blocked', {
            code: 'CLIENT_VERSION_UNSUPPORTED',
            compatibility: pushBody?.data?.compatibility ?? null,
          });
          return {
            ok: false,
            code: 'CLIENT_VERSION_UNSUPPORTED',
            message: pushBody?.error || 'Desktop client version is not supported for sync. Please update the app.',
            compatibility: pushBody?.data?.compatibility ?? null,
          };
        }
        throw new Error(pushBody?.error || `Sync push failed: ${pushResponse.status}`);
      }

      pushResults = pushBody?.data?.results ?? [];
      pushBundleResults = pushBody?.data?.bundles ?? [];
      desktopDb.recordSyncResults(pushResults);
      desktopDb.applyAcceptedSyncResults(pushResults);
    }

    const checkpoint = desktopDb.getCheckpoint('workspace');
    const pullResponse = await fetch(`${desktopApiBase}/sync/pull?checkpoint=${encodeURIComponent(checkpoint)}`, {
      headers: getDesktopRequestHeaders(token),
    });
    const pullBody = await pullResponse.json();
    if (!pullResponse.ok) {
      if (pullResponse.status === 426 || pullBody?.code === 'DESKTOP_CLIENT_OUTDATED') {
        desktopDb.markSyncStatus('attention');
        desktopDb.finishSyncRun(syncRunId, 'blocked', {
          code: 'CLIENT_VERSION_UNSUPPORTED',
          compatibility: pullBody?.data?.compatibility ?? null,
        });
        return {
          ok: false,
          code: 'CLIENT_VERSION_UNSUPPORTED',
          message: pullBody?.error || 'Desktop client version is not supported for sync. Please update the app.',
          compatibility: pullBody?.data?.compatibility ?? null,
        };
      }
      throw new Error(pullBody?.error || `Sync pull failed: ${pullResponse.status}`);
    }

    const snapshot = pullBody?.data?.snapshot ?? null;
    const changes = pullBody?.data?.changes ?? null;
    const nextCheckpoint = pullBody?.data?.checkpoint ?? '';
    const checkpointStatus = pullBody?.data?.checkpointStatus ?? 'ok';
    const rebuildRequired = Boolean(pullBody?.data?.rebuildRequired);
    const pullEntitlement = pullBody?.data?.entitlement ?? null;
    if (rebuildRequired || checkpointStatus === 'unknown_checkpoint' || checkpointStatus === 'expired_checkpoint' || checkpointStatus === 'rebuild_required') {
      desktopDb.setRebuildRequired(true, `Desktop sync checkpoint is ${checkpointStatus.replaceAll('_', ' ')}. Rebuild the local cache to continue syncing safely.`);
      desktopDb.markSyncStatus('attention');
      desktopDb.finishSyncRun(syncRunId, 'blocked', {
        pushed: pending.length,
        pushedBundles: pendingBundles.length,
        checkpointStatus,
        rebuildRequired: true,
      });
      return {
        ok: false,
        code: 'REBUILD_REQUIRED',
        message: 'Desktop sync requires a cache rebuild before it can continue.',
        checkpoint: nextCheckpoint,
      };
    }
    const hasGroupedChanges = Boolean(changes) && (
      (Array.isArray(changes?.patients) && changes.patients.length > 0)
      || (Array.isArray(changes?.appointments) && changes.appointments.length > 0)
      || (Array.isArray(changes?.notes) && changes.notes.length > 0)
      || (Array.isArray(changes?.attachments) && changes.attachments.length > 0)
      || (changes?.drafts && Object.keys(changes.drafts).length > 0)
    );
    if (hasGroupedChanges) {
      desktopDb.applyPulledChanges(changes, nextCheckpoint);
    } else if (snapshot) {
      desktopDb.applyPulledBootstrap(snapshot, nextCheckpoint);
    } else if (nextCheckpoint) {
      desktopDb.setCheckpoint('workspace', nextCheckpoint);
      desktopDb.touchSuccessfulSync();
    } else if (pushResults.length > 0) {
      desktopDb.touchSuccessfulSync();
    } else {
      desktopDb.markSyncStatus('up_to_date');
    }

    if (pullEntitlement) {
      desktopDb.upsertEntitlement(pullEntitlement);
    } else {
      const entitlementResponse = await fetch(`${desktopApiBase}/desktop/entitlement`, {
        headers: getDesktopRequestHeaders(token),
      });
      if (entitlementResponse.ok) {
        const entitlementBody = await entitlementResponse.json();
        if (entitlementBody?.data) {
          desktopDb.upsertEntitlement(entitlementBody.data);
        }
      }
    }

    desktopDb.finishSyncRun(syncRunId, 'completed', {
      pushed: pending.length,
      pushedBundles: pendingBundles.length,
      pushResults,
      pushBundleResults,
      checkpoint: nextCheckpoint,
      checkpointStatus,
      pushBlockedByRestriction,
      changesApplied: hasGroupedChanges,
    });
    return { ok: true, results: pushResults, bundles: pushBundleResults, checkpoint: nextCheckpoint, changesApplied: hasGroupedChanges };
  } catch (error) {
    desktopDb.markSyncStatus('attention');
    if (pending.length > 0) {
      desktopDb.recordSyncResults(
        pending.map(item => ({
          mutationId: item.mutationId,
          status: 'retryable_failure',
          errorCode: 'RETRYABLE_FAILURE',
          errorMessage: error instanceof Error ? error.message : 'Sync failed',
        }))
      );
    }
    desktopDb.finishSyncRun(syncRunId, 'failed', {
      pushed: pending.length,
      pushedBundles: pendingBundles.length,
      error: error instanceof Error ? error.message : 'Sync failed',
    });
    return { ok: false, code: 'SYNC_FAILED', message: error instanceof Error ? error.message : 'Sync failed' };
  }
}

async function rebuildDesktopCache() {
  const token = desktopDb.getStoredToken();
  if (!token) {
    return { ok: false, code: 'NO_TOKEN', message: 'Login is required before rebuilding the local cache.' };
  }

  const [bootstrapResponse, entitlementResponse] = await Promise.all([
    fetch(`${desktopApiBase}/desktop/bootstrap`, {
      headers: getDesktopRequestHeaders(token),
    }),
    fetch(`${desktopApiBase}/desktop/entitlement`, {
      headers: getDesktopRequestHeaders(token),
    }),
  ]);

  const bootstrapBody = await bootstrapResponse.json();
  if (!bootstrapResponse.ok) {
    return { ok: false, code: 'BOOTSTRAP_FAILED', message: bootstrapBody?.error || `Bootstrap fetch failed: ${bootstrapResponse.status}` };
  }

  desktopDb.overwriteBootstrapSnapshot(bootstrapBody?.data ?? {});
  if (entitlementResponse.ok) {
    const entitlementBody = await entitlementResponse.json();
    if (entitlementBody?.data) {
      desktopDb.upsertEntitlement(entitlementBody.data);
    }
  }
  desktopDb.resetSyncState();
  desktopDb.setRebuildRequired(false);
  desktopDb.touchSuccessfulSync();
  return { ok: true };
}

async function exportDesktopDiagnostics() {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Desktop Diagnostics',
    defaultPath: path.join(app.getPath('documents'), `my-health-desktop-diagnostics-${new Date().toISOString().slice(0, 10)}.json`),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });

  if (result.canceled || !result.filePath) {
    return { ok: false, code: 'CANCELLED' };
  }

  const snapshot = desktopDb.exportDiagnosticsSnapshot();
  fs.writeFileSync(result.filePath, JSON.stringify(snapshot, null, 2), 'utf8');
  desktopDb.recordAuditEvent('diagnostics_exported', 'info', {
    filePath: result.filePath,
  });
  return { ok: true, filePath: result.filePath };
}

async function exportDesktopBackup() {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Desktop Backup',
    defaultPath: path.join(app.getPath('documents'), `my-health-desktop-backup-${new Date().toISOString().slice(0, 10)}.sqlite`),
    filters: [{ name: 'SQLite Backup', extensions: ['sqlite', 'db'] }],
  });

  if (result.canceled || !result.filePath) {
    return { ok: false, code: 'CANCELLED' };
  }

  return desktopDb.exportLocalBackup(result.filePath, { reason: 'manual_export' });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1200,
    minHeight: 800,
    title: 'My Health Desktop',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.webContents.on('did-finish-load', () => {
    console.info('desktop_renderer_loaded', mainWindow?.webContents.getURL());
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('desktop_renderer_failed_load', { errorCode, errorDescription, validatedURL });
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('desktop_renderer_process_gone', details);
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console[level === 3 ? 'error' : level === 2 ? 'warn' : 'log']('desktop_renderer_console', {
      level,
      message,
      line,
      sourceId,
    });
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

async function pickAndStoreAttachment({ workspaceId = '', patientId = '', appointmentId = '', entityType = '', entityId = '' } = {}) {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Document',
    buttonLabel: 'Add Document',
    properties: ['openFile'],
    filters: [
      { name: 'Documents', extensions: ['pdf', 'jpg', 'jpeg', 'png'] },
    ],
  });

  if (result.canceled || !result.filePaths[0]) {
    return { ok: false, code: 'CANCELLED' };
  }

  const sourcePath = result.filePaths[0];
  const fileBuffer = fs.readFileSync(sourcePath);
  const checksum = secretManager.checksumBuffer(fileBuffer);
  const encryptedBuffer = secretManager.encryptBuffer(fileBuffer);
  const fileName = path.basename(sourcePath);
  const extension = path.extname(sourcePath) || '';
  const attachmentId = `attach_${crypto.randomUUID()}`;
  const storageDir = path.join(
    desktopDb.dataDir,
    'attachments',
    sanitizePathSegment(workspaceId, 'workspace'),
    sanitizePathSegment(patientId, 'patient')
  );

  fs.mkdirSync(storageDir, { recursive: true });
  const localPath = path.join(storageDir, `${attachmentId}${extension}.enc`);
  fs.writeFileSync(localPath, encryptedBuffer);

  const attachment = {
    id: attachmentId,
    attachmentId,
    workspaceId,
    entityType: entityType || (appointmentId ? 'appointment' : 'patient'),
    entityId: entityId || appointmentId || patientId,
    patientId,
    appointmentId,
    fileName,
    mimeType: extension.toLowerCase() === '.pdf'
      ? 'application/pdf'
      : extension.toLowerCase() === '.png'
        ? 'image/png'
        : 'image/jpeg',
    fileSize: fileBuffer.byteLength,
    checksum,
    localPath,
    remoteKey: '',
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  desktopDb.enqueueAttachmentTransfer(attachment);
  return { ok: true, attachment };
}

app.whenReady().then(() => {
  const secrets = createSecretManager({ safeStorage });
  secretManager = secrets;
  desktopDb = createDesktopDatabase({ userDataPath: app.getPath('userData'), secrets, appVersion: desktopClientVersion });

  ipcMain.on('desktop:runtime-info', event => {
    event.returnValue = desktopDb.getRuntimeInfo();
  });

  ipcMain.on('desktop:auth-token:get', event => {
    const runtime = desktopDb.getRuntimeInfo();
    event.returnValue = runtime.locked ? '' : desktopDb.getStoredToken();
  });

  ipcMain.on('desktop:auth-token:clear', event => {
    event.returnValue = desktopDb.clearStoredToken();
  });

  ipcMain.handle('desktop:bootstrap-session', async (_event, payload) => {
    return desktopDb.saveBootstrapSession(payload);
  });
  ipcMain.handle('desktop:bootstrap:update', async (_event, snapshot) => desktopDb.updateBootstrapSnapshot(snapshot));

  ipcMain.handle('desktop:pin:setup', async (_event, pin) => desktopDb.setPin(pin));
  ipcMain.handle('desktop:pin:unlock', async (_event, pin) => desktopDb.verifyPin(pin));
  ipcMain.handle('desktop:lock', async () => desktopDb.setLocked(true));
  ipcMain.handle('desktop:bootstrap:get-cached', async () => desktopDb.getCachedBootstrap());
  ipcMain.handle('desktop:sync:enqueue-mutation', async (_event, mutation) => {
    desktopDb.enqueueMutation(mutation);
    return { ok: true };
  });
  ipcMain.handle('desktop:sync:get-issues', async () => desktopDb.listSyncIssues());
  ipcMain.handle('desktop:sync:run', async () => runDesktopSync());
  ipcMain.handle('desktop:sync:retry-retryable-bundles', async () => desktopDb.retryRetryableBundles());
  ipcMain.handle('desktop:sync:resolve-conflict', async (_event, payload) => desktopDb.resolveConflict(payload));
  ipcMain.handle('desktop:sync:wipe-local-state', async () => desktopDb.wipeLocalState());
  ipcMain.handle('desktop:sync:rebuild-cache', async () => rebuildDesktopCache());
  ipcMain.handle('desktop:sync:export-diagnostics', async () => exportDesktopDiagnostics());
  ipcMain.handle('desktop:sync:export-backup', async () => exportDesktopBackup());
  ipcMain.handle('desktop:sync:verify-integrity', async () => desktopDb.verifyIntegrity({ persist: true, source: 'manual' }));
  ipcMain.handle('desktop:sync:queue-attachment', async (_event, attachment) => {
    desktopDb.enqueueAttachmentTransfer(attachment);
    return { ok: true };
  });
  ipcMain.handle('desktop:attachments:pick-store', async (_event, payload) => pickAndStoreAttachment(payload));
  ipcMain.handle('desktop:attachments:list', async (_event, filters) => desktopDb.listAttachments(filters));

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch(error => {
  showStartupError(error);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
