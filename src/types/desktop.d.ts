import type { SessionPayload, DesktopBootstrapSnapshot, DesktopRuntimeInfo, DesktopOutboxMutation, DesktopSyncIssueSummary, DesktopAttachmentTransfer, DesktopSyncBundleResult, DesktopSyncMutationResult } from '@/lib/app-types';

declare global {
  interface Window {
    desktopApp?: {
      isDesktop: boolean;
      getRuntimeInfoSync: () => DesktopRuntimeInfo;
      getAuthTokenSync: () => string;
      clearAuthTokenSync: () => boolean;
      bootstrapSession: (payload: { token: string; session: SessionPayload; bootstrap: DesktopBootstrapSnapshot }) => Promise<DesktopRuntimeInfo>;
      updateBootstrapSnapshot: (snapshot: DesktopBootstrapSnapshot) => Promise<boolean>;
      setupPin: (pin: string) => Promise<DesktopRuntimeInfo>;
      unlockWithPin: (pin: string) => Promise<{ ok: boolean; code?: string; message?: string; runtime?: DesktopRuntimeInfo }>;
      lockNow: () => Promise<DesktopRuntimeInfo>;
      getCachedBootstrap: () => Promise<{ session: SessionPayload | null; bootstrap: DesktopBootstrapSnapshot | null }>;
      enqueueMutation: (mutation: DesktopOutboxMutation) => Promise<{ ok: true }>;
      getSyncIssues: () => Promise<DesktopSyncIssueSummary>;
      runSync: () => Promise<{ ok: boolean; code?: string; message?: string; results?: DesktopSyncMutationResult[]; bundles?: DesktopSyncBundleResult[]; checkpoint?: string; changesApplied?: boolean }>;
      retryRetryableBundles: () => Promise<{ ok: boolean; code?: string; message?: string }>;
      resolveConflict: (payload: { conflictId: string; action: string }) => Promise<{ ok: boolean; code?: string; message?: string }>;
      wipeLocalState: () => Promise<{ ok: boolean; code?: string; message?: string }>;
      rebuildCache: () => Promise<{ ok: boolean; code?: string; message?: string }>;
      exportDiagnostics: () => Promise<{ ok: boolean; code?: string; message?: string; filePath?: string }>;
      exportBackup: () => Promise<{ ok: boolean; code?: string; message?: string; filePath?: string; manifestPath?: string }>;
      verifyIntegrity: () => Promise<{ ok: boolean; integrity: string; checkedAt: string; issues: string[]; rebuildRequired: boolean }>;
      queueAttachment: (attachment: DesktopAttachmentTransfer) => Promise<{ ok: true }>;
      pickAndStoreAttachment: (payload: {
        workspaceId: string;
        patientId?: string;
        appointmentId?: string;
        entityType?: string;
        entityId?: string;
      }) => Promise<{ ok: boolean; code?: string; attachment?: DesktopAttachmentTransfer }>;
      listAttachments: (filters: { patientId?: string; appointmentId?: string }) => Promise<DesktopAttachmentTransfer[]>;
    };
  }
}

export {};
