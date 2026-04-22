import React, { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { exportDesktopDiagnosticsNow, getDesktopRuntimeInfoSync, isDesktopRuntime, lockDesktopNow, rebuildDesktopCacheNow, setupDesktopPin, unlockDesktopWithPin, getDesktopSyncIssues, runDesktopSyncNow } from '@/lib/desktop';
import type { DesktopRuntimeInfo, DesktopSyncIssueSummary } from '@/lib/app-types';

interface DesktopContextValue {
  runtime: DesktopRuntimeInfo;
  issues: DesktopSyncIssueSummary;
  refreshRuntime: () => void;
  refreshIssues: () => Promise<void>;
  runSyncNow: () => Promise<void>;
  rebuildCache: () => Promise<{ ok: boolean; message?: string }>;
  exportDiagnostics: () => Promise<{ ok: boolean; message?: string; filePath?: string }>;
  setupPin: (pin: string) => Promise<void>;
  unlock: (pin: string) => Promise<{ ok: boolean; message?: string }>;
  lock: () => Promise<void>;
}

const DesktopContext = createContext<DesktopContextValue | null>(null);

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

  const exportDiagnostics = async () => {
    const result = await exportDesktopDiagnosticsNow();
    return { ok: result.ok, message: result.message, filePath: result.filePath };
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

  const value = useMemo(() => ({
    runtime,
    issues,
    refreshRuntime,
    refreshIssues,
    runSyncNow,
    rebuildCache,
    exportDiagnostics,
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
