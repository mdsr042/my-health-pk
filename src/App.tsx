import { useState } from 'react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { DesktopProvider, useDesktop } from '@/contexts/DesktopContext';
import { PatientTabsProvider, usePatientTabs } from '@/contexts/PatientTabsContext';
import { DataProvider, useData } from '@/contexts/DataContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { APP_NAVIGATE_EVENT, SETTINGS_SECTION_OVERVIEW } from '@/lib/app-defaults';
import LoginPage from '@/pages/Login';
import ClinicSelection from '@/pages/ClinicSelection';
import AppLayout from '@/components/layout/AppLayout';
import AdminLayout from '@/components/layout/AdminLayout';
import Dashboard from '@/pages/Dashboard';
import PatientQueue from '@/pages/PatientQueue';
import PatientWorkspace from '@/pages/PatientWorkspace';
import Appointments from '@/pages/Appointments';
import MedicalRecords from '@/pages/MedicalRecords';
import Profile from '@/pages/Profile';
import SettingsPage from '@/pages/Settings';
import ClinicsPage from '@/pages/Clinics';
import AdminDashboard from '@/pages/AdminDashboard';
import { useEffect } from 'react';
import DesktopUnlockScreen from '@/components/desktop/DesktopUnlockScreen';
import DesktopPinSetupDialog from '@/components/desktop/DesktopPinSetupDialog';

const queryClient = new QueryClient();

function AppContent() {
  const { isAuthenticated, isLoading, clinicSelected, user } = useAuth();
  const { runtime } = useDesktop();
  const { openTab } = usePatientTabs();
  const { getPatient } = useData();
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [settingsSection, setSettingsSection] = useState(SETTINGS_SECTION_OVERVIEW);

  const navigateToPage = (page: string, nextSettingsSection = SETTINGS_SECTION_OVERVIEW) => {
    setCurrentPage(page);
    if (page === 'settings') {
      setSettingsSection(nextSettingsSection);
    }
  };

  useEffect(() => {
    const handleNavigate = (event: Event) => {
      const detail = (event as CustomEvent<{ page?: string; settingsSection?: string }>).detail;
      if (detail?.page) {
        navigateToPage(detail.page, detail.settingsSection ?? SETTINGS_SECTION_OVERVIEW);
      }
    };

    window.addEventListener(APP_NAVIGATE_EVENT, handleNavigate);
    return () => window.removeEventListener(APP_NAVIGATE_EVENT, handleNavigate);
  }, []);

  const handleOpenPatient = (patientId: string) => {
    const patient = getPatient(patientId);
    if (patient) {
      openTab(patientId, patient.name, patient.mrn);
      navigateToPage('workspace');
    }
  };

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading...</div>;
  }
  if (!isAuthenticated) return <LoginPage />;
  if (user?.role === 'platform_admin') {
    return (
      <AdminLayout>
        <AdminDashboard />
      </AdminLayout>
    );
  }
  if (!clinicSelected) return <ClinicSelection />;

  return (
    <>
      <AppLayout currentPage={currentPage} onNavigate={navigateToPage} onOpenPatient={handleOpenPatient}>
        {currentPage === 'dashboard' && <Dashboard onOpenPatient={handleOpenPatient} onNavigate={navigateToPage} />}
        {currentPage === 'queue' && <PatientQueue onOpenPatient={handleOpenPatient} />}
        {currentPage === 'workspace' && <PatientWorkspace />}
        {currentPage === 'appointments' && <Appointments />}
        {currentPage === 'records' && <MedicalRecords />}
        {currentPage === 'clinics' && <ClinicsPage />}
        {currentPage === 'profile' && <Profile />}
        {currentPage === 'settings' && <SettingsPage initialSection={settingsSection} />}
      </AppLayout>
      <DesktopPinSetupDialog open={runtime.isDesktop && isAuthenticated && !runtime.pinConfigured} />
    </>
  );
}

function DesktopAwareApp() {
  const { runtime } = useDesktop();

  if (runtime.isDesktop && runtime.pinConfigured && runtime.locked) {
    return <DesktopUnlockScreen />;
  }

  return (
    <AuthProvider>
      <DataProvider>
        <PatientTabsProvider>
          <AppContent />
        </PatientTabsProvider>
      </DataProvider>
    </AuthProvider>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <DesktopProvider>
        <DesktopAwareApp />
      </DesktopProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
