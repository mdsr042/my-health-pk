import React, { ReactNode, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePatientTabs } from '@/contexts/PatientTabsContext';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard, Users, CalendarDays, FileText, Settings, LogOut,
  Stethoscope, ChevronDown, Bell, Search, Menu, X
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';

interface AppLayoutProps {
  children: ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
}

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'queue', label: 'Patient Queue', icon: Users },
  { id: 'appointments', label: 'Appointments', icon: CalendarDays },
  { id: 'records', label: 'Records', icon: FileText },
];

export default function AppLayout({ children, currentPage, onNavigate }: AppLayoutProps) {
  const { doctor, activeClinic, doctorClinics, switchClinic, logout } = useAuth();
  const { tabs, activeTabId, setActiveTab, closeTab } = usePatientTabs();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-sidebar flex flex-col transition-transform lg:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-sidebar-primary/20 flex items-center justify-center">
            <Stethoscope className="w-5 h-5 text-sidebar-primary" />
          </div>
          <span className="text-lg font-bold text-sidebar-foreground tracking-tight">My Health</span>
          <button className="lg:hidden ml-auto text-sidebar-foreground" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-1">
          {navItems.map(item => {
            const Icon = item.icon;
            const active = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { onNavigate(item.id); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                }`}
              >
                <Icon className="w-4.5 h-4.5" />
                {item.label}
              </button>
            );
          })}

          {/* Workspace nav item if tabs open */}
          {tabs.length > 0 && (
            <button
              onClick={() => { onNavigate('workspace'); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                currentPage === 'workspace'
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
              }`}
            >
              <FileText className="w-4.5 h-4.5" />
              Workspace
              <span className="ml-auto bg-sidebar-primary/30 text-sidebar-primary text-xs px-1.5 py-0.5 rounded-full">
                {tabs.length}
              </span>
            </button>
          )}
        </nav>

        {/* Doctor info */}
        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-sidebar-primary/20 flex items-center justify-center text-sm font-semibold text-sidebar-primary">
              {doctor?.name.split(' ').slice(-2).map(n => n[0]).join('')}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{doctor?.name}</p>
              <p className="text-xs text-sidebar-muted truncate">{doctor?.specialization}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && <div className="fixed inset-0 bg-foreground/20 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main */}
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="sticky top-0 z-20 bg-card border-b border-border px-4 lg:px-6 h-14 flex items-center gap-3">
          <button className="lg:hidden text-foreground" onClick={() => setSidebarOpen(true)}>
            <Menu className="w-5 h-5" />
          </button>

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
              className="w-64 h-9 pl-9 pr-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <Button variant="ghost" size="icon" className="relative">
            <Bell className="w-4.5 h-4.5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-destructive" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <Settings className="w-4.5 h-4.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onNavigate('profile')}>Profile</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onNavigate('settings')}>Settings</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-destructive">
                <LogOut className="w-4 h-4 mr-2" /> Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* Patient tabs bar */}
        {tabs.length > 0 && currentPage === 'workspace' && (
          <div className="bg-card border-b border-border px-4 flex items-center gap-0.5 overflow-x-auto scrollbar-thin">
            {tabs.map(tab => (
              <button
                key={tab.patientId}
                onClick={() => setActiveTab(tab.patientId)}
                className={`group flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 transition-colors whitespace-nowrap ${
                  activeTabId === tab.patientId
                    ? 'border-primary text-primary font-medium'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.hasUnsavedChanges && <span className="w-1.5 h-1.5 rounded-full bg-warning" />}
                {tab.patientName}
                <span className="text-xs text-muted-foreground">({tab.mrn})</span>
                <button
                  onClick={e => { e.stopPropagation(); closeTab(tab.patientId); }}
                  className="ml-1 opacity-0 group-hover:opacity-100 hover:bg-muted rounded p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </button>
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
