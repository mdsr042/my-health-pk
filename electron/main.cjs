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

function sanitizePathSegment(value, fallback = 'unknown') {
  const normalized = String(value ?? '').trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

async function runDesktopSync() {
  const token = desktopDb.getStoredToken();
  if (!token) {
    desktopDb.markSyncStatus('offline');
    return { ok: false, code: 'NO_TOKEN' };
  }

  const currentRuntime = desktopDb.getRuntimeInfo();
  if (currentRuntime.entitlement?.status === 'locked') {
    desktopDb.markSyncStatus('attention');
    return { ok: false, code: 'ENTITLEMENT_LOCKED', message: currentRuntime.entitlement.lockMessage || 'Desktop access is locked until the subscription is renewed.' };
  }

  desktopDb.markSyncStatus('syncing');
  const pending = desktopDb.getPendingMutations(50);
  let pushResults = [];

  try {
    if (pending.length > 0) {
      const pushResponse = await fetch(`${desktopApiBase}/sync/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ mutations: pending }),
      });

      const pushBody = await pushResponse.json();
      if (!pushResponse.ok) {
        throw new Error(pushBody?.error || `Sync push failed: ${pushResponse.status}`);
      }

      pushResults = pushBody?.data?.results ?? [];
      desktopDb.recordSyncResults(pushResults);
      desktopDb.applyAcceptedSyncResults(pushResults);
    }

    const checkpoint = desktopDb.getCheckpoint('workspace');
    const pullResponse = await fetch(`${desktopApiBase}/sync/pull?checkpoint=${encodeURIComponent(checkpoint)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const pullBody = await pullResponse.json();
    if (!pullResponse.ok) {
      throw new Error(pullBody?.error || `Sync pull failed: ${pullResponse.status}`);
    }

    const snapshot = pullBody?.data?.snapshot ?? null;
    const changes = pullBody?.data?.changes ?? null;
    const nextCheckpoint = pullBody?.data?.checkpoint ?? '';
    const pullEntitlement = pullBody?.data?.entitlement ?? null;
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
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (entitlementResponse.ok) {
        const entitlementBody = await entitlementResponse.json();
        if (entitlementBody?.data) {
          desktopDb.upsertEntitlement(entitlementBody.data);
        }
      }
    }

    return { ok: true, results: pushResults, checkpoint: nextCheckpoint, changesApplied: hasGroupedChanges };
  } catch (error) {
    desktopDb.markSyncStatus('attention');
    if (pending.length > 0) {
      desktopDb.recordSyncResults(
        pending.map(item => ({
          mutationId: item.mutationId,
          status: 'retryable_failure',
          error: error instanceof Error ? error.message : 'Sync failed',
        }))
      );
    }
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
      headers: { Authorization: `Bearer ${token}` },
    }),
    fetch(`${desktopApiBase}/desktop/entitlement`, {
      headers: { Authorization: `Bearer ${token}` },
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
  return { ok: true, filePath: result.filePath };
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
  desktopDb = createDesktopDatabase({ userDataPath: app.getPath('userData'), secrets });

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
  ipcMain.handle('desktop:sync:rebuild-cache', async () => rebuildDesktopCache());
  ipcMain.handle('desktop:sync:export-diagnostics', async () => exportDesktopDiagnostics());
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
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
