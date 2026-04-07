import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { LayoutDashboard, Settings, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface AdminLayoutProps {
  children: ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="w-64 bg-sidebar flex flex-col">
        <div className="p-5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-sidebar-primary/20 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-sidebar-primary" />
          </div>
          <div>
            <p className="text-lg font-bold text-sidebar-foreground tracking-tight">My Health</p>
            <p className="text-xs text-sidebar-muted">Platform Admin</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-1">
          <div className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium bg-sidebar-accent text-sidebar-accent-foreground">
            <LayoutDashboard className="w-4.5 h-4.5" />
            Operations Dashboard
          </div>
          <div className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-muted">
            <Settings className="w-4.5 h-4.5" />
            Platform Controls
          </div>
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <p className="text-sm font-medium text-sidebar-foreground truncate">{user?.email}</p>
          <p className="text-xs text-sidebar-muted">Platform administrator</p>
          <Button variant="ghost" className="mt-3 w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent/50" onClick={() => void logout()}>
            <LogOut className="w-4 h-4 mr-2" /> Sign Out
          </Button>
        </div>
      </aside>

      <main className="flex-1">{children}</main>
    </div>
  );
}
