import type { DesktopAttachmentTransfer, DesktopBootstrapSnapshot, DesktopDiagnosticsExportResult, DesktopOutboxMutation, DesktopRuntimeInfo, DesktopSyncIssueSummary, SessionPayload } from '@/lib/app-types';

const webRuntime: DesktopRuntimeInfo = {
  isDesktop: false,
  deviceId: '',
  pinConfigured: false,
  locked: false,
  syncStatus: 'web',
  lastSuccessfulSyncAt: '',
  backupOverdue: false,
  pendingMutations: 0,
  failedMutations: 0,
  oldestPendingAt: '',
  entitlement: null,
};

export function isDesktopRuntime() {
  return Boolean(window.desktopApp?.isDesktop);
}

export function getDesktopRuntimeInfoSync(): DesktopRuntimeInfo {
  if (!isDesktopRuntime()) {
    return webRuntime;
  }

  try {
    return window.desktopApp?.getRuntimeInfoSync() ?? webRuntime;
  } catch {
    return webRuntime;
  }
}

export function getDesktopStoredTokenSync() {
  if (!isDesktopRuntime()) return '';
  try {
    return window.desktopApp?.getAuthTokenSync() ?? '';
  } catch {
    return '';
  }
}

export function clearDesktopStoredTokenSync() {
  if (!isDesktopRuntime()) return false;
  try {
    return Boolean(window.desktopApp?.clearAuthTokenSync());
  } catch {
    return false;
  }
}

export async function bootstrapDesktopSession(payload: { token: string; session: SessionPayload; bootstrap: DesktopBootstrapSnapshot }) {
  if (!isDesktopRuntime()) return webRuntime;
  return window.desktopApp!.bootstrapSession(payload);
}

export async function updateDesktopBootstrapSnapshot(snapshot: DesktopBootstrapSnapshot) {
  if (!isDesktopRuntime()) return false;
  return window.desktopApp!.updateBootstrapSnapshot(snapshot);
}

export async function setupDesktopPin(pin: string) {
  if (!isDesktopRuntime()) return webRuntime;
  return window.desktopApp!.setupPin(pin);
}

export async function unlockDesktopWithPin(pin: string) {
  if (!isDesktopRuntime()) {
    return { ok: true, runtime: webRuntime };
  }
  return window.desktopApp!.unlockWithPin(pin);
}

export async function lockDesktopNow() {
  if (!isDesktopRuntime()) return webRuntime;
  return window.desktopApp!.lockNow();
}

export async function getCachedDesktopBootstrap() {
  if (!isDesktopRuntime()) {
    return { session: null, bootstrap: null };
  }
  return window.desktopApp!.getCachedBootstrap();
}

export async function enqueueDesktopMutation(mutation: DesktopOutboxMutation) {
  if (!isDesktopRuntime()) return { ok: false };
  return window.desktopApp!.enqueueMutation(mutation);
}

export async function getDesktopSyncIssues(): Promise<DesktopSyncIssueSummary> {
  if (!isDesktopRuntime()) {
    return { pending: [], deadLetters: [], conflicts: [] };
  }
  return window.desktopApp!.getSyncIssues();
}

export async function runDesktopSyncNow() {
  if (!isDesktopRuntime()) {
    return { ok: false, code: 'WEB_RUNTIME' };
  }
  return window.desktopApp!.runSync();
}

export async function rebuildDesktopCacheNow() {
  if (!isDesktopRuntime()) {
    return { ok: false, code: 'WEB_RUNTIME', message: 'Desktop rebuild is only available in the desktop app.' };
  }
  return window.desktopApp!.rebuildCache();
}

export async function exportDesktopDiagnosticsNow(): Promise<DesktopDiagnosticsExportResult> {
  if (!isDesktopRuntime()) {
    return { ok: false, code: 'WEB_RUNTIME', message: 'Desktop diagnostics are only available in the desktop app.' };
  }
  return window.desktopApp!.exportDiagnostics();
}

export async function queueDesktopAttachmentTransfer(attachment: DesktopAttachmentTransfer) {
  if (!isDesktopRuntime()) {
    return { ok: false };
  }
  return window.desktopApp!.queueAttachment(attachment);
}

export async function pickAndStoreDesktopAttachment(payload: {
  workspaceId: string;
  patientId?: string;
  appointmentId?: string;
  entityType?: string;
  entityId?: string;
}) {
  if (!isDesktopRuntime()) {
    return { ok: false, code: 'WEB_RUNTIME' };
  }
  return window.desktopApp!.pickAndStoreAttachment(payload);
}

export async function listDesktopAttachments(filters: { patientId?: string; appointmentId?: string }) {
  if (!isDesktopRuntime()) {
    return [] as DesktopAttachmentTransfer[];
  }
  return window.desktopApp!.listAttachments(filters);
}
