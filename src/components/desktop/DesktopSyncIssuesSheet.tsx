import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useDesktop } from '@/contexts/DesktopContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useState } from 'react';

interface DesktopSyncIssuesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function DesktopSyncIssuesSheet({ open, onOpenChange }: DesktopSyncIssuesSheetProps) {
  const { issues, refreshIssues, rebuildCache, exportDiagnostics, runSyncNow, retryRetryableBundles, resolveConflict, wipeLocalState, runtime } = useDesktop();
  const { logout } = useAuth();
  const [detailConflictId, setDetailConflictId] = useState('');

  const detailConflict = issues.conflicts.find(item => item.id === detailConflictId) || null;

  const getConflictTone = (conflictType: string) => {
    if (conflictType === 'appointment_conflict') {
      return {
        label: 'Appointment Conflict',
        description: 'Another device or screen changed consultation state for this visit.',
      };
    }
    if (conflictType === 'patient_conflict') {
      return {
        label: 'Patient Conflict',
        description: 'Demographic details changed elsewhere and need an explicit local-versus-server decision.',
      };
    }
    if (conflictType === 'draft_conflict') {
      return {
        label: 'Draft Conflict',
        description: 'A newer consultation draft exists elsewhere and needs review before overwriting.',
      };
    }
    return {
      label: 'Sync Conflict',
      description: 'This change needs attention before it can sync safely.',
    };
  };

  const handleRebuildCache = async () => {
    const result = await rebuildCache();
    if (result.ok) {
      toast.success('Local desktop cache rebuilt');
      return;
    }
    toast.error(result.message || 'Unable to rebuild the local cache.');
  };

  const handleExportDiagnostics = async () => {
    const result = await exportDiagnostics();
    if (result.ok) {
      toast.success('Diagnostics exported', {
        description: result.filePath || 'Desktop diagnostic file created.',
      });
      return;
    }
    if (result.message) {
      toast.error(result.message);
    }
  };

  const handleRetryRetryables = async () => {
    const result = await retryRetryableBundles();
    if (result.ok) {
      toast.success('Retryable bundles moved back to pending sync');
      return;
    }
    toast.error(result.message || 'Unable to retry pending bundles.');
  };

  const handleConflictAction = async (conflictId: string, action: string, successMessage: string) => {
    const result = await resolveConflict(conflictId, action);
    if (result.ok) {
      toast.success(result.message || successMessage);
      return;
    }
    toast.error(result.message || 'Unable to resolve this conflict.');
  };

  const handleSignOutAndWipe = async () => {
    await logout();
    const result = await wipeLocalState();
    if (result.ok) {
      toast.success('Signed out and local desktop cache wiped');
      onOpenChange(false);
      return;
    }
    toast.error(result.message || 'Unable to wipe the local desktop cache.');
  };

  const formatSnapshot = (value: unknown) => {
    if (!value) return 'No snapshot captured.';
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return 'Unable to display this snapshot.';
    }
  };

  const buildPatientFieldDiff = (localSnapshot: Record<string, unknown> | null | undefined, serverSnapshot: Record<string, unknown> | null | undefined) => {
    const fieldLabels: Record<string, string> = {
      mrn: 'MRN',
      name: 'Full Name',
      phone: 'Phone',
      age: 'Age',
      gender: 'Gender',
      cnic: 'CNIC',
      address: 'Address',
      bloodGroup: 'Blood Group',
      emergencyContact: 'Emergency Contact',
    };

    const keys = Object.keys(fieldLabels).filter(key => {
      const localValue = String(localSnapshot?.[key] ?? '').trim();
      const serverValue = String(serverSnapshot?.[key] ?? '').trim();
      return localValue !== serverValue;
    });

    return keys.map(key => ({
      key,
      label: fieldLabels[key],
      localValue: String(localSnapshot?.[key] ?? '').trim() || 'Not set',
      serverValue: String(serverSnapshot?.[key] ?? '').trim() || 'Not set',
    }));
  };

  const patientFieldDiff = detailConflict?.conflict_type === 'patient_conflict'
    ? buildPatientFieldDiff(detailConflict.local_snapshot ?? null, detailConflict.server_snapshot ?? null)
    : [];

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Desktop Sync Issues</SheetTitle>
            <SheetDescription>
              Review pending offline changes and items that need attention before cloud backup completes.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void runSyncNow()}>Run Sync Now</Button>
              <Button variant="outline" size="sm" onClick={() => void handleRetryRetryables()}>Retry Retryable Bundles</Button>
              <Button variant="outline" size="sm" onClick={() => void refreshIssues()}>Refresh</Button>
              <Button variant="outline" size="sm" onClick={() => void handleRebuildCache()}>Rebuild Cache</Button>
              <Button variant="outline" size="sm" onClick={() => void handleExportDiagnostics()}>Export Diagnostics</Button>
              <Button variant="outline" size="sm" onClick={() => void handleSignOutAndWipe()}>Sign Out And Wipe</Button>
            </div>

            {runtime.rebuildRequired && (
              <div className="rounded-lg border border-amber-300/40 bg-amber-50/70 p-3">
                <p className="text-sm font-medium text-foreground">Local cache rebuild required</p>
                <p className="mt-1 text-xs text-amber-900">{runtime.rebuildReason || 'Desktop sync needs a local cache rebuild before it can continue safely.'}</p>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Conflicts</h3>
                <Badge variant={issues.conflicts.length ? 'destructive' : 'secondary'}>{issues.conflicts.length}</Badge>
              </div>
              {issues.conflicts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active sync conflicts right now.</p>
              ) : (
                <div className="space-y-2">
                  {issues.conflicts.map(item => {
                    const tone = getConflictTone(item.conflict_type);
                    return (
                      <div key={item.id} className="rounded-lg border border-amber-300/40 bg-amber-50/70 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-foreground">{tone.label}</p>
                            <p className="text-xs text-muted-foreground">{item.entity_type} • {item.entity_id}</p>
                          </div>
                          <Badge variant="outline">{item.conflict_type}</Badge>
                        </div>
                        <p className="mt-2 text-xs text-amber-900">{tone.description}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          System decision stays conservative: it preserves clearly safe local additions and otherwise prefers the canonical server version.
                        </p>
                        {item.local_summary && (
                          <p className="mt-2 text-xs text-muted-foreground">Local: {item.local_summary}</p>
                        )}
                        {item.server_summary && (
                          <p className="mt-1 text-xs text-muted-foreground">Server: {item.server_summary}</p>
                        )}
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(item.conflict_type === 'draft_conflict') && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => void handleConflictAction(item.id, 'keep_local_as_new_draft', 'Local draft moved back into the sync queue')}>
                                Keep Local As New Draft
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => void handleConflictAction(item.id, 'discard_local', 'Local draft discarded and server version restored')}>
                                Discard Local And Use Server
                              </Button>
                              <Button size="sm" variant="secondary" onClick={() => void handleConflictAction(item.id, 'system_decide', 'System resolved the draft conflict')}>
                                Let System Decide
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setDetailConflictId(item.id)}>
                                Review Details
                              </Button>
                            </>
                          )}
                          {(item.conflict_type === 'appointment_conflict') && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => void handleConflictAction(item.id, 'refresh_from_server', 'Appointment refreshed from the server state')}>
                                Refresh From Server
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => void handleConflictAction(item.id, 'retry_allowed_transition', 'Appointment transition moved back into the sync queue')}>
                                Retry Allowed Transition
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => void handleConflictAction(item.id, 'discard_local', 'Local appointment change discarded')}>
                                Discard Local Change
                              </Button>
                              <Button size="sm" variant="secondary" onClick={() => void handleConflictAction(item.id, 'system_decide', 'System resolved the appointment conflict')}>
                                Let System Decide
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setDetailConflictId(item.id)}>
                                Review Details
                              </Button>
                            </>
                          )}
                          {(item.conflict_type === 'patient_conflict') && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => void handleConflictAction(item.id, 'use_local', 'Local patient change moved back into the sync queue')}>
                                Use Local
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => void handleConflictAction(item.id, 'use_server', 'Server demographic details restored locally')}>
                                Use Server
                              </Button>
                              <Button size="sm" variant="secondary" onClick={() => void handleConflictAction(item.id, 'system_decide', 'System resolved the patient conflict')}>
                                Let System Decide
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setDetailConflictId(item.id)}>
                                Review Changed Fields
                              </Button>
                            </>
                          )}
                          {(item.conflict_type !== 'draft_conflict' && item.conflict_type !== 'appointment_conflict' && item.conflict_type !== 'patient_conflict') && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => void handleConflictAction(item.id, 'use_local', 'Local version moved back into the sync queue')}>
                                Use Local
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => void handleConflictAction(item.id, 'use_server', 'Server version restored locally')}>
                                Use Server
                              </Button>
                              <Button size="sm" variant="secondary" onClick={() => void handleConflictAction(item.id, 'system_decide', 'System resolved the conflict')}>
                                Let System Decide
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setDetailConflictId(item.id)}>
                                Review Details
                              </Button>
                            </>
                          )}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Pending mutations</h3>
                <Badge variant="secondary">{issues.pending.length}</Badge>
              </div>
              {issues.pending.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending offline mutations right now.</p>
              ) : (
                <div className="space-y-2">
                  {issues.pending.map(item => (
                    <div key={item.mutation_id} className="rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{item.entity_type} • {item.operation_type}</p>
                          <p className="text-xs text-muted-foreground">{item.entity_id}</p>
                        </div>
                        <Badge variant="outline">{item.status}</Badge>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Queued at {new Date(item.created_local_at).toLocaleString()}
                        {item.retry_count ? ` • retries ${item.retry_count}` : ''}
                      </p>
                      {(item.last_error_code || item.last_error_message) && (
                        <p className="mt-2 text-xs text-amber-700">
                          {item.last_error_code || 'SYNC_ERROR'} {item.last_error_message ? `• ${item.last_error_message}` : ''}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Dead-letter items</h3>
              {issues.deadLetters.length === 0 ? (
                <p className="text-sm text-muted-foreground">No dead-letter items yet.</p>
              ) : (
                <div className="space-y-2">
                  {issues.deadLetters.map(item => (
                    <div key={item.id} className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                      <p className="text-sm font-medium text-foreground">{item.reason_code}</p>
                      <p className="text-xs text-muted-foreground">{item.mutation_id}</p>
                      {item.reason_message && <p className="mt-2 text-xs text-destructive">{item.reason_message}</p>}
                      <p className="mt-2 text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={Boolean(detailConflict)} onOpenChange={nextOpen => !nextOpen && setDetailConflictId('')}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Conflict Review Details</DialogTitle>
            <DialogDescription>
              Compare the local desktop version with the current server version before deciding how this conflict should be resolved.
            </DialogDescription>
          </DialogHeader>

          {detailConflict && (
            <>
              {detailConflict.conflict_type === 'patient_conflict' && patientFieldDiff.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-foreground">Changed patient fields</p>
                  <div className="overflow-hidden rounded-lg border border-border">
                    <div className="grid grid-cols-[1.1fr_1fr_1fr] gap-px bg-border text-xs">
                      <div className="bg-muted/60 px-3 py-2 font-medium text-foreground">Field</div>
                      <div className="bg-amber-50 px-3 py-2 font-medium text-amber-950">Local desktop</div>
                      <div className="bg-blue-50 px-3 py-2 font-medium text-blue-950">Current server</div>
                    </div>
                    {patientFieldDiff.map(item => (
                      <div key={item.key} className="grid grid-cols-[1.1fr_1fr_1fr] gap-px bg-border text-xs">
                        <div className="bg-background px-3 py-2 font-medium text-foreground">{item.label}</div>
                        <div className="bg-amber-50/60 px-3 py-2 font-medium text-amber-950">{item.localValue}</div>
                        <div className="bg-blue-50/70 px-3 py-2 font-medium text-blue-950">{item.serverValue}</div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Only changed fields are shown here so the final decision is easier to review quickly.
                  </p>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Local desktop version</p>
                  {detailConflict.local_summary && (
                    <p className="text-xs text-muted-foreground">{detailConflict.local_summary}</p>
                  )}
                  <pre className="max-h-80 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-xs leading-5 text-foreground whitespace-pre-wrap">
                    {formatSnapshot(detailConflict.local_snapshot)}
                  </pre>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Current server version</p>
                  {detailConflict.server_summary && (
                    <p className="text-xs text-muted-foreground">{detailConflict.server_summary}</p>
                  )}
                  <pre className="max-h-80 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-xs leading-5 text-foreground whitespace-pre-wrap">
                    {formatSnapshot(detailConflict.server_snapshot)}
                  </pre>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
