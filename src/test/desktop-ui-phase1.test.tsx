import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import AppLayout from '@/components/layout/AppLayout';
import DesktopSyncIssuesSheet from '@/components/desktop/DesktopSyncIssuesSheet';

const mockUseAuth = vi.fn();
const mockUseDesktop = vi.fn();
const mockUsePatientTabs = vi.fn();
const mockUseData = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/contexts/DesktopContext', () => ({
  useDesktop: () => mockUseDesktop(),
}));

vi.mock('@/contexts/PatientTabsContext', () => ({
  usePatientTabs: () => mockUsePatientTabs(),
}));

vi.mock('@/contexts/DataContext', () => ({
  useData: () => mockUseData(),
}));

vi.mock('@/components/appointments/AppointmentBookingDialog', () => ({
  default: () => null,
}));

vi.mock('@/components/consultation/WalkInModal', () => ({
  default: () => null,
}));

describe('desktop phase 1 UI states', () => {
  const baseRuntime = {
    isDesktop: true,
    locked: false,
    pinConfigured: true,
    pendingMutations: 0,
    pendingBundles: 0,
    failedBundles: 0,
    completedBundles: 0,
    lastSuccessfulSyncAt: '',
    lastSyncStatus: 'up_to_date',
    backupOverdue: false,
    entitlement: { status: 'valid' },
    rebuildRequired: false,
    rebuildReason: '',
  };

  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      doctor: { name: 'Dr Test' },
      activeClinic: { id: 'clinic-1', name: 'Clinic One', logo: '🏥', location: 'Lahore' },
      doctorClinics: [{ id: 'clinic-1', name: 'Clinic One', logo: '🏥', location: 'Lahore' }],
      switchClinic: vi.fn(),
      logout: vi.fn(),
      user: { id: 'doctor-1', role: 'doctor_owner' },
    });

    mockUseDesktop.mockReturnValue({
      runtime: baseRuntime,
      issues: { pending: [], deadLetters: [], conflicts: [] },
      refreshRuntime: vi.fn(),
      refreshIssues: vi.fn().mockResolvedValue(undefined),
      runSyncNow: vi.fn().mockResolvedValue(undefined),
      retryRetryableBundles: vi.fn().mockResolvedValue({ ok: true }),
      resolveConflict: vi.fn().mockResolvedValue({ ok: true }),
      wipeLocalState: vi.fn().mockResolvedValue({ ok: true }),
      rebuildCache: vi.fn().mockResolvedValue({ ok: true }),
      exportDiagnostics: vi.fn().mockResolvedValue({ ok: true, filePath: '/tmp/diag.json' }),
      setupPin: vi.fn().mockResolvedValue(undefined),
      unlock: vi.fn().mockResolvedValue({ ok: true }),
      lock: vi.fn(),
    });

    mockUsePatientTabs.mockReturnValue({
      tabs: [],
      activeTabId: '',
      setActiveTab: vi.fn(),
      closeTab: vi.fn(),
    });

    mockUseData.mockReturnValue({
      patients: [],
      appointments: [],
      upsertAppointment: vi.fn(),
      searchPatients: vi.fn().mockResolvedValue([]),
      getPatientNotes: vi.fn().mockReturnValue([]),
    });
  });

  it('shows restricted read-only banner and disables write entry points', () => {
    mockUseDesktop.mockReturnValue({
      issues: { pending: [], deadLetters: [], conflicts: [] },
      refreshRuntime: vi.fn(),
      refreshIssues: vi.fn().mockResolvedValue(undefined),
      runSyncNow: vi.fn().mockResolvedValue(undefined),
      retryRetryableBundles: vi.fn().mockResolvedValue({ ok: true }),
      resolveConflict: vi.fn().mockResolvedValue({ ok: true }),
      wipeLocalState: vi.fn().mockResolvedValue({ ok: true }),
      rebuildCache: vi.fn().mockResolvedValue({ ok: true }),
      exportDiagnostics: vi.fn().mockResolvedValue({ ok: true, filePath: '/tmp/diag.json' }),
      setupPin: vi.fn().mockResolvedValue(undefined),
      unlock: vi.fn().mockResolvedValue({ ok: true }),
      lock: vi.fn(),
      runtime: {
        ...baseRuntime,
        entitlement: { status: 'restricted' },
      },
    });

    render(
      <AppLayout currentPage="dashboard" onNavigate={vi.fn()} onOpenPatient={vi.fn()}>
        <div>Child content</div>
      </AppLayout>
    );

    expect(screen.getByText(/read-only mode/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /walk-in/i }).hasAttribute('disabled')).toBe(true);
  });

  it('shows rebuild-required banner in the shell', () => {
    mockUseDesktop.mockReturnValue({
      issues: { pending: [], deadLetters: [], conflicts: [] },
      refreshRuntime: vi.fn(),
      refreshIssues: vi.fn().mockResolvedValue(undefined),
      runSyncNow: vi.fn().mockResolvedValue(undefined),
      retryRetryableBundles: vi.fn().mockResolvedValue({ ok: true }),
      resolveConflict: vi.fn().mockResolvedValue({ ok: true }),
      wipeLocalState: vi.fn().mockResolvedValue({ ok: true }),
      rebuildCache: vi.fn().mockResolvedValue({ ok: true }),
      exportDiagnostics: vi.fn().mockResolvedValue({ ok: true, filePath: '/tmp/diag.json' }),
      setupPin: vi.fn().mockResolvedValue(undefined),
      unlock: vi.fn().mockResolvedValue({ ok: true }),
      lock: vi.fn(),
      runtime: {
        ...baseRuntime,
        failedBundles: 1,
        lastSyncStatus: 'attention',
        rebuildRequired: true,
        rebuildReason: 'Checkpoint expired',
      },
    });

    render(
      <AppLayout currentPage="dashboard" onNavigate={vi.fn()} onOpenPatient={vi.fn()}>
        <div>Child content</div>
      </AppLayout>
    );

    expect(screen.getByText(/local cache rebuild/i)).toBeTruthy();
    expect(screen.getByText(/checkpoint expired/i)).toBeTruthy();
  });

  it('opens a conflict details review dialog with local and server snapshots', () => {
    mockUseDesktop.mockReturnValue({
      runtime: {
        ...baseRuntime,
        failedBundles: 1,
        lastSyncStatus: 'attention',
        rebuildRequired: true,
        rebuildReason: 'Checkpoint expired',
      },
      issues: {
        pending: [],
        deadLetters: [],
        conflicts: [
          {
            id: 'conflict-1',
            conflict_type: 'patient_conflict',
            entity_type: 'patient',
            entity_id: 'pt-1',
            created_at: '2026-04-23T10:00:00.000Z',
            local_summary: 'Name: Local Patient',
            server_summary: 'Name: Server Patient',
            local_snapshot: { id: 'pt-1', name: 'Local Patient' },
            server_snapshot: { id: 'pt-1', name: 'Server Patient' },
          },
        ],
      },
      refreshIssues: vi.fn().mockResolvedValue(undefined),
      rebuildCache: vi.fn().mockResolvedValue({ ok: true }),
      exportDiagnostics: vi.fn().mockResolvedValue({ ok: true, filePath: '/tmp/diag.json' }),
      runSyncNow: vi.fn().mockResolvedValue(undefined),
      retryRetryableBundles: vi.fn().mockResolvedValue({ ok: true }),
      resolveConflict: vi.fn().mockResolvedValue({ ok: true }),
      wipeLocalState: vi.fn().mockResolvedValue({ ok: true }),
    });
    mockUseAuth.mockReturnValue({ logout: vi.fn().mockResolvedValue(undefined) });

    render(<DesktopSyncIssuesSheet open={true} onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /review changed fields/i }));

    expect(screen.getByText(/conflict review details/i)).toBeTruthy();
    expect(screen.getAllByText(/local desktop version/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/current server version/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Full Name')).toBeTruthy();
    expect(screen.getByText('Local desktop')).toBeTruthy();
    expect(screen.getByText('Current server')).toBeTruthy();
    expect(screen.getAllByText(/local patient/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/server patient/i).length).toBeGreaterThan(0);
  });
});
