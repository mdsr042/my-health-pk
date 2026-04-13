import { useState } from 'react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { PatientTabsProvider, usePatientTabs } from '@/contexts/PatientTabsContext';
import { DataProvider, useData } from '@/contexts/DataContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { APP_NAVIGATE_EVENT } from '@/lib/app-defaults';
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

const queryClient = new QueryClient();

function AppContent() {
  const { isAuthenticated, isLoading, clinicSelected, user } = useAuth();
  const { openTab } = usePatientTabs();
  const { getPatient } = useData();
  const [currentPage, setCurrentPage] = useState('dashboard');

  useEffect(() => {
    const handleNavigate = (event: Event) => {
      const detail = (event as CustomEvent<{ page?: string }>).detail;
      if (detail?.page) {
        setCurrentPage(detail.page);
      }
    };

    window.addEventListener(APP_NAVIGATE_EVENT, handleNavigate);
    return () => window.removeEventListener(APP_NAVIGATE_EVENT, handleNavigate);
  }, []);

  const handleOpenPatient = (patientId: string) => {
    const patient = getPatient(patientId);
    if (patient) {
      openTab(patientId, patient.name, patient.mrn);
      setCurrentPage('workspace');
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
    <AppLayout currentPage={currentPage} onNavigate={setCurrentPage} onOpenPatient={handleOpenPatient}>
      {currentPage === 'dashboard' && <Dashboard onOpenPatient={handleOpenPatient} onNavigate={setCurrentPage} />}
      {currentPage === 'queue' && <PatientQueue onOpenPatient={handleOpenPatient} />}
      {currentPage === 'workspace' && <PatientWorkspace />}
      {currentPage === 'appointments' && <Appointments />}
      {currentPage === 'records' && <MedicalRecords />}
      {currentPage === 'clinics' && <ClinicsPage />}
      {currentPage === 'profile' && <Profile />}
      {currentPage === 'settings' && <SettingsPage />}
    </AppLayout>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <DataProvider>
          <PatientTabsProvider>
            <AppContent />
          </PatientTabsProvider>
        </DataProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
