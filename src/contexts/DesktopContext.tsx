import React, { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { exportDesktopBackupNow, exportDesktopDiagnosticsNow, getDesktopRuntimeInfoSync, isDesktopRuntime, lockDesktopNow, rebuildDesktopCacheNow, resolveDesktopConflict, retryDesktopRetryablesNow, setupDesktopPin, unlockDesktopWithPin, getDesktopSyncIssues, runDesktopSyncNow, verifyDesktopIntegrityNow, wipeDesktopLocalStateNow } from '@/lib/desktop';
import type { DesktopRuntimeInfo, DesktopSyncIssueSummary } from '@/lib/app-types';

interface DesktopContextValue {
  runtime: DesktopRuntimeInfo;
  issues: DesktopSyncIssueSummary;
  refreshRuntime: () => void;
  refreshIssues: () => Promise<void>;
  runSyncNow: () => Promise<void>;
  retryRetryableBundles: () => Promise<{ ok: boolean; message?: string }>;
  resolveConflict: (conflictId: string, action: string) => Promise<{ ok: boolean; message?: string }>;
  wipeLocalState: () => Promise<{ ok: boolean; message?: string }>;
  rebuildCache: () => Promise<{ ok: boolean; message?: string }>;
  exportDiagnostics: () => Promise<{ ok: boolean; message?: string; filePath?: string }>;
  exportBackup: () => Promise<{ ok: boolean; message?: string; filePath?: string; manifestPath?: string }>;
  verifyIntegrity: () => Promise<{ ok: boolean; message?: string; checkedAt?: string; issues?: string[] }>;
  setupPin: (pin: string) => Promise<void>;
  unlock: (pin: string) => Promise<{ ok: boolean; message?: string }>;
  lock: () => Promise<void>;
}

const DesktopContext = createContext<DesktopContextValue | null>(null);
const IDLE_LOCK_MS = 15 * 60 * 1000;

export function DesktopProvider({ children }: { children: ReactNode }) {
  const [runtime, setRuntime] = useState<DesktopRuntimeInfo>(() => getDesktopRuntimeInfoSync());
  const [issues, setIssues] = useState<DesktopSyncIssueSummary>({ pending: [], deadLetters: [], conflicts: [] });

  const refreshRuntime = () => {
    setRuntime(getDesktopRuntimeInfoSync());
  };

  const refreshIssues = async () => {
    setIssues(await getDesktopSyncIssues());
    setRuntime(getDesktopRuntimeInfoSync());
  };

  const runSyncNow = async () => {
    if (!isDesktopRuntime()) return;
    await runDesktopSyncNow();
    await refreshIssues();
  };

  const rebuildCache = async () => {
    const result = await rebuildDesktopCacheNow();
    await refreshIssues();
    return { ok: result.ok, message: result.message };
  };

  const retryRetryableBundles = async () => {
    const result = await retryDesktopRetryablesNow();
    await refreshIssues();
    return { ok: result.ok, message: result.message };
  };

  const resolveConflict = async (conflictId: string, action: string) => {
    const result = await resolveDesktopConflict({ conflictId, action });
    await refreshIssues();
    return { ok: result.ok, message: result.message };
  };

  const wipeLocalState = async () => {
    const result = await wipeDesktopLocalStateNow();
    await refreshIssues();
    return { ok: result.ok, message: result.message };
  };

  const exportDiagnostics = async () => {
    const result = await exportDesktopDiagnosticsNow();
    return { ok: result.ok, message: result.message, filePath: result.filePath };
  };

  const exportBackup = async () => {
    const result = await exportDesktopBackupNow();
    return { ok: result.ok, message: result.message, filePath: result.filePath, manifestPath: result.manifestPath };
  };

  const verifyIntegrity = async () => {
    const result = await verifyDesktopIntegrityNow();
    await refreshIssues();
    return {
      ok: result.ok,
      message: result.ok ? '' : result.issues?.[0] || 'Local integrity verification failed.',
      checkedAt: result.checkedAt,
      issues: result.issues,
    };
  };

  const setupPin = async (pin: string) => {
    const next = await setupDesktopPin(pin);
    setRuntime(next);
    await refreshIssues();
  };

  const unlock = async (pin: string) => {
    const result = await unlockDesktopWithPin(pin);
    if (result.ok && result.runtime) {
      setRuntime(result.runtime);
    }
    await refreshIssues();
    return { ok: result.ok, message: result.message };
  };

  const lock = async () => {
    const next = await lockDesktopNow();
    setRuntime(next);
  };

  React.useEffect(() => {
    void refreshIssues();
    const timer = window.setInterval(() => {
      if (!isDesktopRuntime()) return;
      if (getDesktopRuntimeInfoSync().locked) {
        void refreshIssues();
        return;
      }
      void runSyncNow();
    }, 3000);
    return () => window.clearInterval(timer);
  }, []);

  React.useEffect(() => {
    if (!isDesktopRuntime()) return;
    if (!runtime.pinConfigured) return;

    let timeoutId = 0;

    const scheduleLock = () => {
      window.clearTimeout(timeoutId);
      const current = getDesktopRuntimeInfoSync();
      if (current.locked || !current.pinConfigured) return;
      timeoutId = window.setTimeout(() => {
        const latest = getDesktopRuntimeInfoSync();
        if (latest.locked || !latest.pinConfigured) return;
        void lock().then(() => {
          void refreshIssues();
        });
      }, IDLE_LOCK_MS);
    };

    const activityEvents: Array<keyof WindowEventMap> = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'focus'];
    const handleActivity = () => scheduleLock();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        scheduleLock();
      }
    };

    scheduleLock();
    activityEvents.forEach(eventName => window.addEventListener(eventName, handleActivity, { passive: true }));
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearTimeout(timeoutId);
      activityEvents.forEach(eventName => window.removeEventListener(eventName, handleActivity));
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [runtime.locked, runtime.pinConfigured]);

  const value = useMemo(() => ({
    runtime,
    issues,
    refreshRuntime,
    refreshIssues,
    runSyncNow,
    rebuildCache,
    retryRetryableBundles,
    resolveConflict,
    wipeLocalState,
    exportDiagnostics,
    exportBackup,
    verifyIntegrity,
    setupPin,
    unlock,
    lock,
  }), [issues, runtime]);

  if (!isDesktopRuntime()) {
    return (
      <DesktopContext.Provider value={value}>
        {children}
      </DesktopContext.Provider>
    );
  }

  return (
    <DesktopContext.Provider value={value}>
      {children}
    </DesktopContext.Provider>
  );
}

export function useDesktop() {
  const value = useContext(DesktopContext);
  if (!value) {
    throw new Error('useDesktop must be used within DesktopProvider');
  }
  return value;
}
