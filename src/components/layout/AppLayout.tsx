import React, { ReactNode, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useDesktop } from '@/contexts/DesktopContext';
import DesktopSyncIssuesSheet from '@/components/desktop/DesktopSyncIssuesSheet';
import { usePatientTabs } from '@/contexts/PatientTabsContext';
import { useData } from '@/contexts/DataContext';
import AppointmentBookingDialog from '@/components/appointments/AppointmentBookingDialog';
import WalkInModal from '@/components/consultation/WalkInModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { readStorage, writeStorage } from '@/lib/storage';
import { mergeAppSettings, SETTINGS_SECTION_OVERVIEW, SETTINGS_STORAGE_KEY, SETTINGS_UPDATED_EVENT } from '@/lib/app-defaults';
import {
  LayoutDashboard, Users, CalendarDays, FileText, Settings, LogOut,
  Stethoscope, ChevronDown, Bell, Search, Menu, X, FolderOpen, PanelLeftClose, PanelLeftOpen, UserCircle2, UserPlus, CalendarPlus, PlayCircle, FileSearch, Eye
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import type { Appointment, Patient } from '@/data/mockData';
import { getLocalDateKey } from '@/lib/date';
import { toast } from 'sonner';

interface AppLayoutProps {
  children: ReactNode;
  currentPage: string;
  onNavigate: (page: string, settingsSection?: string) => void;
  onOpenPatient: (patientId: string) => void;
}

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'queue', label: 'Patient Queue', icon: Users },
  { id: 'appointments', label: 'Appointments', icon: CalendarDays },
  { id: 'records', label: 'Records', icon: FileText },
];

export default function AppLayout({ children, currentPage, onNavigate, onOpenPatient }: AppLayoutProps) {
  const { doctor, activeClinic, doctorClinics, switchClinic, logout, user } = useAuth();
  const { runtime, lock } = useDesktop();
  const { tabs, activeTabId, setActiveTab, closeTab } = usePatientTabs();
  const { patients, appointments, upsertAppointment, searchPatients, getPatientNotes } = useData();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => mergeAppSettings(readStorage(SETTINGS_STORAGE_KEY, {})).sidebarCollapsed);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [bookingPatient, setBookingPatient] = useState<Patient | null>(null);
  const [previewPatient, setPreviewPatient] = useState<Patient | null>(null);
  const [searchResults, setSearchResults] = useState<Patient[]>([]);
  const [isSearchingPatients, setIsSearchingPatients] = useState(false);
  const [highlightedSearchIndex, setHighlightedSearchIndex] = useState(-1);
  const [syncIssuesOpen, setSyncIssuesOpen] = useState(false);
  const isDesktopReadOnly = runtime.entitlement?.status === 'restricted';
  const showGraceBanner = runtime.isDesktop && runtime.entitlement?.status === 'grace';
  const showRestrictedBanner = runtime.isDesktop && isDesktopReadOnly;
  const showRebuildBanner = runtime.isDesktop && runtime.rebuildRequired;

  const handleSelectPatient = (patientId: string) => {
    onOpenPatient(patientId);
    setSearch('');
    setSearchOpen(false);
  };

  const getLatestAppointment = (patientId: string) =>
    appointments
      .filter(appointment => appointment.patientId === patientId)
      .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time) || b.tokenNumber - a.tokenNumber)[0] ?? null;

  const getPatientSearchMeta = (patient: Patient) => {
    const latestAppointment = getLatestAppointment(patient.id);
    const latestStatus = latestAppointment?.status || '';
    const latestNote = getPatientNotes(patient.id)[0];
    const latestDiagnosis = latestNote?.diagnoses.find(dx => dx.isPrimary)?.name || latestNote?.diagnoses[0]?.name || '';
    const latestVisitDate = latestNote?.date
      ? new Date(latestNote.date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })
      : '';

    return {
      latestAppointment,
      latestStatus,
      latestNote,
      latestDiagnosis,
      latestVisitDate,
      hasRecord: Boolean(latestNote),
      isCompletedPatient: latestStatus === 'completed',
    };
  };

  const handleOpenPreview = (patient: Patient) => {
    setPreviewPatient(patient);
    setSearchOpen(false);
  };

  const handleOpenRecord = (patient: Patient) => {
    if (getPatientNotes(patient.id).length === 0) {
      setPreviewPatient(patient);
      setSearchOpen(false);
      toast.info('No visit record yet', { description: 'Showing patient summary and appointment continuity instead.' });
      return;
    }

    onNavigate('records');
    window.dispatchEvent(new CustomEvent('records:focus-patient', { detail: { patientId: patient.id } }));
    setSearch('');
    setSearchOpen(false);
  };

  const handleBookAppointment = (patient: Patient) => {
    setBookingPatient(patient);
    setSearchOpen(false);
  };

  const handleBookNextAppointment = async (form: {
    id: string;
    patientId: string;
    clinicId: string;
    date: string;
    time: string;
    type: Appointment['type'];
    status: Appointment['status'];
    chiefComplaint: string;
    tokenNumber: number;
  }) => {
    if (!form.patientId || !form.clinicId || !form.date || !form.time) {
      toast.error('Please complete clinic, date, and time');
      return;
    }

    await upsertAppointment({
      id: '',
      patientId: form.patientId,
      clinicId: form.clinicId,
      doctorId: user?.id || 'doctor',
      date: form.date,
      time: form.time,
      status: form.status,
      type: form.type,
      chiefComplaint: form.chiefComplaint.trim(),
      tokenNumber: 0,
    });

    toast.success('Appointment booked');
    setBookingPatient(null);
    setSearch('');
  };

  const persistSidebarCollapsed = (nextCollapsed: boolean) => {
    const nextSettings = mergeAppSettings({
      ...readStorage(SETTINGS_STORAGE_KEY, {}),
      sidebarCollapsed: nextCollapsed,
    });
    writeStorage(SETTINGS_STORAGE_KEY, nextSettings);
    window.dispatchEvent(new Event(SETTINGS_UPDATED_EVENT));
    setSidebarCollapsed(nextCollapsed);
  };

  React.useEffect(() => {
    const handleSettingsUpdate = () => {
      const nextSettings = mergeAppSettings(readStorage(SETTINGS_STORAGE_KEY, {}));
      setSidebarCollapsed(nextSettings.sidebarCollapsed);
    };

    window.addEventListener(SETTINGS_UPDATED_EVENT, handleSettingsUpdate);
    return () => window.removeEventListener(SETTINGS_UPDATED_EVENT, handleSettingsUpdate);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    const trimmedSearch = search.trim();
    if (!trimmedSearch) {
      setSearchResults([]);
      setIsSearchingPatients(false);
      return;
    }

    let active = true;
    const timer = window.setTimeout(() => {
      setIsSearchingPatients(true);
      void searchPatients(trimmedSearch)
        .then(results => {
          if (!active) return;
          setSearchResults(results.slice(0, 6));
        })
        .catch(() => {
          if (!active) return;
          setSearchResults(
            patients
              .filter(patient =>
                patient.name.toLowerCase().includes(trimmedSearch.toLowerCase())
                || patient.mrn.toLowerCase().includes(trimmedSearch.toLowerCase())
                || patient.phone.includes(trimmedSearch)
              )
              .slice(0, 6)
          );
        })
        .finally(() => {
          if (active) {
            setIsSearchingPatients(false);
          }
        });
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [patients, search, searchOpen, searchPatients]);

  useEffect(() => {
    setHighlightedSearchIndex(searchResults.length > 0 ? 0 : -1);
  }, [searchResults]);

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-sidebar flex flex-col transition-[transform,width] duration-200 lg:translate-x-0
        ${sidebarCollapsed ? 'lg:w-20' : 'lg:w-64'}
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className={`flex items-center gap-3 ${sidebarCollapsed ? 'justify-center px-2 py-5 lg:px-0' : 'p-5'}`}>
          <div className="w-9 h-9 rounded-lg bg-sidebar-primary/20 flex items-center justify-center">
            <Stethoscope className="w-5 h-5 text-sidebar-primary" />
          </div>
          {!sidebarCollapsed && <span className="text-lg font-bold text-sidebar-foreground tracking-tight">My Health</span>}
          <button
            type="button"
            className={`hidden lg:inline-flex ml-auto rounded-md p-1.5 text-sidebar-foreground hover:bg-sidebar-accent/60 ${sidebarCollapsed ? 'lg:ml-0' : ''}`}
            onClick={() => persistSidebarCollapsed(!sidebarCollapsed)}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
          <button className="lg:hidden ml-auto text-sidebar-foreground" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className={`flex-1 py-2 space-y-1 ${sidebarCollapsed ? 'px-2' : 'px-3'}`}>
          {navItems.map(item => {
            const Icon = item.icon;
            const active = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { onNavigate(item.id); setSidebarOpen(false); }}
                aria-label={item.label}
                title={sidebarCollapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                } ${sidebarCollapsed ? 'lg:justify-center lg:px-2' : ''}`}
              >
                <Icon className="w-4.5 h-4.5" />
                {!sidebarCollapsed && item.label}
              </button>
            );
          })}

          {/* Workspace nav item if tabs open */}
          {tabs.length > 0 && (
            <button
              onClick={() => { onNavigate('workspace'); setSidebarOpen(false); }}
              aria-label="Workspace"
              title={sidebarCollapsed ? 'Workspace' : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                currentPage === 'workspace'
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
              } ${sidebarCollapsed ? 'lg:justify-center lg:px-2' : ''}`}
            >
              <FolderOpen className="w-4.5 h-4.5" />
              {!sidebarCollapsed && 'Workspace'}
              <span className={`bg-sidebar-primary/30 text-sidebar-primary text-xs px-1.5 py-0.5 rounded-full ${sidebarCollapsed ? 'lg:hidden' : 'ml-auto'}`}>
                {tabs.length}
              </span>
            </button>
          )}
        </nav>

        {/* Doctor info */}
        <div className={`border-t border-sidebar-border space-y-3 ${sidebarCollapsed ? 'p-3' : 'p-4'}`}>
          <Button
            variant="ghost"
            className={`w-full border border-sidebar-border/70 text-sidebar-foreground hover:bg-sidebar-accent/60 ${sidebarCollapsed ? 'h-10 justify-center px-0' : 'justify-start gap-3'}`}
            aria-label="Settings"
            title={sidebarCollapsed ? 'Settings' : undefined}
            onClick={() => { onNavigate('settings', SETTINGS_SECTION_OVERVIEW); setSidebarOpen(false); }}
          >
            <Settings className="h-4 w-4" />
            {!sidebarCollapsed && <span>Settings</span>}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={`w-full rounded-lg transition-colors hover:bg-sidebar-accent/50 ${sidebarCollapsed ? 'flex justify-center p-2' : 'flex items-center gap-3 p-2 text-left'}`}
                aria-label="Doctor menu"
                title={sidebarCollapsed ? doctor?.name : undefined}
              >
                <div className="w-9 h-9 rounded-full bg-sidebar-primary/20 flex items-center justify-center text-sm font-semibold text-sidebar-primary">
                  {doctor?.name.split(' ').slice(-2).map(n => n[0]).join('')}
                </div>
                {!sidebarCollapsed && (
                  <>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-sidebar-foreground truncate">{doctor?.name}</p>
                      <p className="text-xs text-sidebar-muted truncate">{doctor?.specialization}</p>
                    </div>
                    <ChevronDown className="h-4 w-4 text-sidebar-muted" />
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onNavigate('profile')}>
                <UserCircle2 className="w-4 h-4 mr-2" /> Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-destructive">
                <LogOut className="w-4 h-4 mr-2" /> Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && <div className="fixed inset-0 bg-foreground/20 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main */}
      <div className={`flex-1 flex flex-col min-h-screen transition-[margin] duration-200 ${sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
        {/* Top bar */}
        <header className="sticky top-0 z-20 bg-card border-b border-border px-4 lg:px-6 h-14 flex items-center gap-3">
          <button className="lg:hidden text-foreground" onClick={() => setSidebarOpen(true)}>
            <Menu className="w-5 h-5" />
          </button>
          <Button
            variant="outline"
            size="icon"
            className="hidden lg:inline-flex"
            onClick={() => persistSidebarCollapsed(!sidebarCollapsed)}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </Button>

          {/* Clinic switcher */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 font-medium text-foreground">
                <span className="text-lg">{activeClinic?.logo}</span>
                <span className="hidden sm:inline">{activeClinic?.name}</span>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              {doctorClinics.map(c => (
                <DropdownMenuItem
                  key={c.id}
                  onClick={() => switchClinic(c.id)}
                  className={c.id === activeClinic?.id ? 'bg-primary/5' : ''}
                >
                  <span className="text-lg mr-2">{c.logo}</span>
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.location}</p>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex-1" />

          <Button
            className="inline-flex gap-2 px-3 md:px-4"
            size="sm"
            onClick={() => setWalkInOpen(true)}
            disabled={isDesktopReadOnly}
            title={isDesktopReadOnly ? 'Desktop is currently in read-only mode.' : 'Add a walk-in patient'}
          >
            <UserPlus className="w-4 h-4" />
            <span className="hidden sm:inline">Walk-in</span>
          </Button>

          {runtime.isDesktop && (
            <button
              type="button"
              onClick={() => setSyncIssuesOpen(true)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                runtime.backupOverdue || runtime.failedBundles > 0
                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                  : runtime.pendingBundles > 0
                    ? 'border-blue-200 bg-blue-50 text-blue-700'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
              }`}
            >
              {runtime.backupOverdue
                ? 'Backup overdue'
                : runtime.failedBundles > 0
                  ? `Attention needed (${runtime.failedBundles} bundles)`
                  : runtime.pendingBundles > 0
                    ? `Sync pending (${runtime.pendingBundles} bundles)`
                    : 'Up to date'}
            </button>
          )}

          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              placeholder="Search patients, records..."
              value={search}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => window.setTimeout(() => setSearchOpen(false), 120)}
              onChange={event => setSearch(event.target.value)}
              onKeyDown={event => {
                if (!searchOpen || searchResults.length === 0) return;

                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setHighlightedSearchIndex(prev => (prev + 1) % searchResults.length);
                  return;
                }

                if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setHighlightedSearchIndex(prev => (prev <= 0 ? searchResults.length - 1 : prev - 1));
                  return;
                }

                if (event.key === 'Enter') {
                  event.preventDefault();
                  const targetPatient = searchResults[highlightedSearchIndex] ?? searchResults[0];
                  if (targetPatient) {
                    handleOpenPreview(targetPatient);
                  }
                  return;
                }

                if (event.key === 'Escape') {
                  setSearchOpen(false);
                }
              }}
              className="w-64 h-9 pl-9 pr-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {searchOpen && search.trim() && (
              <div className="absolute top-11 left-0 w-[28rem] rounded-lg border border-border bg-card shadow-lg overflow-hidden">
                {searchResults.length > 0 ? (
                  <div className="py-2">
                    {searchResults.map((patient, index) => {
                      const {
                        latestStatus,
                        latestDiagnosis,
                        latestVisitDate,
                        hasRecord,
                        isCompletedPatient,
                      } = getPatientSearchMeta(patient);

                      return (
                        <div
                          key={patient.id}
                          className={`border-b border-border/60 px-4 py-3 last:border-b-0 ${index === highlightedSearchIndex ? 'bg-primary/5' : ''}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground">{patient.name}</p>
                              <p className="text-xs text-muted-foreground">{patient.mrn} • {patient.phone || 'No phone'}</p>
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                {latestVisitDate ? `Last visit ${latestVisitDate}` : 'No completed visit yet'}
                                {latestDiagnosis ? ` • ${latestDiagnosis}` : ''}
                              </p>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                <Badge variant="outline">Patient</Badge>
                                <Badge variant="outline" className={hasRecord ? 'border-slate-200 bg-slate-50 text-slate-700' : 'border-dashed'}>
                                  {hasRecord ? 'Record Available' : 'No Record Yet'}
                                </Badge>
                                {latestStatus && (
                                  <Badge
                                    variant="outline"
                                    className={
                                      latestStatus === 'completed'
                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                        : latestStatus === 'in-consultation'
                                          ? 'border-blue-200 bg-blue-50 text-blue-700'
                                          : latestStatus === 'waiting'
                                            ? 'border-amber-200 bg-amber-50 text-amber-700'
                                            : ''
                                    }
                                  >
                                    {latestStatus === 'in-consultation' ? 'In Consultation' : latestStatus.replace('-', ' ')}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1.5 text-xs"
                              onMouseDown={event => event.preventDefault()}
                              onClick={() => handleOpenPreview(patient)}
                            >
                              <Eye className="h-3.5 w-3.5" /> Preview
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1.5 text-xs"
                              onMouseDown={event => event.preventDefault()}
                              onClick={() => handleOpenRecord(patient)}
                            >
                              <FileSearch className="h-3.5 w-3.5" /> Open Record
                            </Button>
                            <Button
                              size="sm"
                              className="h-8 gap-1.5 text-xs"
                              onMouseDown={event => event.preventDefault()}
                              onClick={() => handleSelectPatient(patient.id)}
                              disabled={isDesktopReadOnly}
                            >
                              <PlayCircle className="h-3.5 w-3.5" /> New Visit
                            </Button>
                            <Button
                              size="sm"
                              variant={isCompletedPatient ? 'default' : 'outline'}
                              className="h-8 gap-1.5 text-xs"
                              onMouseDown={event => event.preventDefault()}
                              onClick={() => handleBookAppointment(patient)}
                              disabled={isDesktopReadOnly}
                            >
                              <CalendarPlus className="h-3.5 w-3.5" /> {isCompletedPatient ? 'Book Next Appointment' : 'Book Appointment'}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : isSearchingPatients ? (
                  <div className="px-3 py-3 text-sm text-muted-foreground">Searching patients...</div>
                ) : (
                  <div className="px-3 py-3 text-sm text-muted-foreground">No patients found</div>
                )}
              </div>
            )}
          </div>

          <Button variant="ghost" size="icon" className="relative">
            <Bell className="w-4.5 h-4.5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-destructive" />
          </Button>
          {runtime.isDesktop && (
            <Button variant="ghost" size="sm" className="hidden lg:inline-flex" onClick={() => void lock()}>
              Lock
            </Button>
          )}
        </header>

        {/* Patient tabs bar */}
        {tabs.length > 0 && currentPage === 'workspace' && (
          <div className="bg-card border-b border-border px-4 py-2 flex items-center gap-2 overflow-x-auto scrollbar-thin">
            {tabs.map(tab => (
              <div
                key={tab.patientId}
                role="button"
                tabIndex={0}
                onClick={() => setActiveTab(tab.patientId)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setActiveTab(tab.patientId);
                  }
                }}
                className={`group flex items-center gap-2 px-4 py-2.5 text-sm rounded-lg border transition-colors whitespace-nowrap ${
                  activeTabId === tab.patientId
                    ? 'border-primary/30 bg-primary/10 text-primary font-semibold shadow-sm'
                    : 'border-border/60 bg-background text-muted-foreground hover:text-foreground hover:bg-muted/40'
                }`}
              >
                {tab.hasUnsavedChanges && (
                  <span className={`w-1.5 h-1.5 rounded-full ${activeTabId === tab.patientId ? 'bg-primary' : 'bg-warning'}`} />
                )}
                {tab.patientName}
                <span className={`text-xs ${activeTabId === tab.patientId ? 'text-primary/80' : 'text-muted-foreground'}`}>({tab.mrn})</span>
                <button
                  onClick={e => { e.stopPropagation(); closeTab(tab.patientId); }}
                  type="button"
                  className={`ml-1 rounded p-0.5 transition-opacity ${
                    activeTabId === tab.patientId
                      ? 'opacity-80 hover:bg-primary/10'
                      : 'opacity-0 group-hover:opacity-100 hover:bg-muted'
                  }`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {showRebuildBanner && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
            Desktop sync needs a local cache rebuild before editing can continue safely.
            {runtime.rebuildReason ? ` ${runtime.rebuildReason}` : ''}
          </div>
        )}

        {showRestrictedBanner && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
            This workspace is in read-only mode. Cached records remain available, but local edits and new sync work are paused until billing is resolved.
          </div>
        )}

        {showGraceBanner && (
          <div className="border-b border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-900">
            Desktop is currently in grace mode. You can keep working, but cloud access should be refreshed soon to avoid interruption.
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>

      <Sheet open={Boolean(previewPatient)} onOpenChange={open => !open && setPreviewPatient(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          {previewPatient && (() => {
            const meta = getPatientSearchMeta(previewPatient);
            return (
              <>
                <SheetHeader>
                  <SheetTitle>{previewPatient.name}</SheetTitle>
                  <SheetDescription>
                    {previewPatient.mrn} • {previewPatient.phone || 'No phone on file'}
                  </SheetDescription>
                </SheetHeader>

                <div className="mt-6 space-y-5">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                      <p className="text-[11px] font-medium text-muted-foreground">Current Status</p>
                      <p className="mt-1 text-sm font-medium text-foreground">
                        {meta.latestStatus ? (meta.latestStatus === 'in-consultation' ? 'In Consultation' : meta.latestStatus.replace('-', ' ')) : 'No active appointment'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                      <p className="text-[11px] font-medium text-muted-foreground">Last Visit</p>
                      <p className="mt-1 text-sm font-medium text-foreground">{meta.latestVisitDate || 'Not available yet'}</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                      <p className="text-[11px] font-medium text-muted-foreground">Latest Diagnosis</p>
                      <p className="mt-1 text-sm font-medium text-foreground">{meta.latestDiagnosis || 'Not available yet'}</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                      <p className="text-[11px] font-medium text-muted-foreground">Record Type</p>
                      <p className="mt-1 text-sm font-medium text-foreground">{meta.hasRecord ? 'Record Available' : 'Patient Summary Only'}</p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/60 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Patient Summary</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-[11px] font-medium text-muted-foreground">Age / Gender</p>
                        <p className="text-sm text-foreground">{previewPatient.age}y / {previewPatient.gender}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-medium text-muted-foreground">CNIC</p>
                        <p className="text-sm text-foreground">{previewPatient.cnic || '-'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-medium text-muted-foreground">Blood Group</p>
                        <p className="text-sm text-foreground">{previewPatient.bloodGroup || '-'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-medium text-muted-foreground">Emergency Contact</p>
                        <p className="text-sm text-foreground">{previewPatient.emergencyContact || '-'}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button className="gap-2" onClick={() => { setPreviewPatient(null); handleSelectPatient(previewPatient.id); }} disabled={isDesktopReadOnly}>
                      <PlayCircle className="h-4 w-4" /> New Visit
                    </Button>
                    <Button variant="outline" className="gap-2" onClick={() => { setPreviewPatient(null); handleBookAppointment(previewPatient); }} disabled={isDesktopReadOnly}>
                      <CalendarPlus className="h-4 w-4" /> {meta.isCompletedPatient ? 'Book Next Appointment' : 'Book Appointment'}
                    </Button>
                    <Button variant="outline" className="gap-2" onClick={() => { setPreviewPatient(null); handleOpenRecord(previewPatient); }}>
                      <FileSearch className="h-4 w-4" /> Open Record
                    </Button>
                  </div>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      <WalkInModal
        open={walkInOpen}
        onClose={() => setWalkInOpen(false)}
        onPatientCreated={(patientId) => {
          toast.success('Walk-in patient added to queue');
          setWalkInOpen(false);
          onOpenPatient(patientId);
        }}
      />
      <AppointmentBookingDialog
        open={Boolean(bookingPatient)}
        onOpenChange={open => !open && setBookingPatient(null)}
        title="Book Next Appointment"
        mode="next"
        patient={bookingPatient}
        patients={patients}
        searchPatients={searchPatients}
        clinics={doctorClinics}
        defaultClinicId={activeClinic?.id}
        defaultDate={(() => {
          const next = new Date();
          next.setDate(next.getDate() + 1);
          return getLocalDateKey(next);
        })()}
        defaultType="follow-up"
        onSubmit={handleBookNextAppointment}
      />
      <DesktopSyncIssuesSheet open={syncIssuesOpen} onOpenChange={setSyncIssuesOpen} />
    </div>
  );
}
