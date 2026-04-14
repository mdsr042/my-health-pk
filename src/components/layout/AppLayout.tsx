import React, { ReactNode, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePatientTabs } from '@/contexts/PatientTabsContext';
import { useData } from '@/contexts/DataContext';
import { Button } from '@/components/ui/button';
import { readStorage, writeStorage } from '@/lib/storage';
import { mergeAppSettings, SETTINGS_SECTION_OVERVIEW, SETTINGS_STORAGE_KEY, SETTINGS_UPDATED_EVENT } from '@/lib/app-defaults';
import {
  LayoutDashboard, Users, CalendarDays, FileText, Settings, LogOut,
  Stethoscope, ChevronDown, Bell, Search, Menu, X, FolderOpen, PanelLeftClose, PanelLeftOpen, UserCircle2
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';

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
  const { doctor, activeClinic, doctorClinics, switchClinic, logout } = useAuth();
  const { tabs, activeTabId, setActiveTab, closeTab } = usePatientTabs();
  const { patients } = useData();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => mergeAppSettings(readStorage(SETTINGS_STORAGE_KEY, {})).sidebarCollapsed);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const searchResults = search.trim()
    ? patients
        .filter(patient =>
          patient.name.toLowerCase().includes(search.toLowerCase()) ||
          patient.mrn.toLowerCase().includes(search.toLowerCase()) ||
          patient.phone.includes(search)
        )
        .slice(0, 6)
    : [];

  const handleSelectPatient = (patientId: string) => {
    onOpenPatient(patientId);
    setSearch('');
    setSearchOpen(false);
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

          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              placeholder="Search patients, records..."
              value={search}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => window.setTimeout(() => setSearchOpen(false), 120)}
              onChange={event => setSearch(event.target.value)}
              className="w-64 h-9 pl-9 pr-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {searchOpen && search.trim() && (
              <div className="absolute top-11 left-0 w-80 rounded-lg border border-border bg-card shadow-lg overflow-hidden">
                {searchResults.length > 0 ? (
                  <div className="py-1">
                    {searchResults.map(patient => (
                      <button
                        key={patient.id}
                        type="button"
                        onMouseDown={event => event.preventDefault()}
                        onClick={() => handleSelectPatient(patient.id)}
                        className="w-full px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                      >
                        <p className="text-sm font-medium text-foreground">{patient.name}</p>
                        <p className="text-xs text-muted-foreground">{patient.mrn} • {patient.phone}</p>
                      </button>
                    ))}
                  </div>
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

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
