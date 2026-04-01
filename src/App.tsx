import { useState } from 'react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { PatientTabsProvider, usePatientTabs } from '@/contexts/PatientTabsContext';
import { getPatient } from '@/data/mockData';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import LoginPage from '@/pages/Login';
import ClinicSelection from '@/pages/ClinicSelection';
import AppLayout from '@/components/layout/AppLayout';
import Dashboard from '@/pages/Dashboard';
import PatientQueue from '@/pages/PatientQueue';
import PatientWorkspace from '@/pages/PatientWorkspace';
import Appointments from '@/pages/Appointments';
import MedicalRecords from '@/pages/MedicalRecords';
import Profile from '@/pages/Profile';
import SettingsPage from '@/pages/Settings';

const queryClient = new QueryClient();

function AppContent() {
  const { isAuthenticated, clinicSelected } = useAuth();
  const { openTab } = usePatientTabs();
  const [currentPage, setCurrentPage] = useState('dashboard');

  const handleOpenPatient = (patientId: string) => {
    const patient = getPatient(patientId);
    if (patient) {
      openTab(patientId, patient.name, patient.mrn);
      setCurrentPage('workspace');
    }
  };

  if (!isAuthenticated) return <LoginPage />;
  if (!clinicSelected) return <ClinicSelection />;

  return (
    <AppLayout currentPage={currentPage} onNavigate={setCurrentPage}>
      {currentPage === 'dashboard' && <Dashboard onOpenPatient={handleOpenPatient} onNavigate={setCurrentPage} />}
      {currentPage === 'queue' && <PatientQueue onOpenPatient={handleOpenPatient} />}
      {currentPage === 'workspace' && <PatientWorkspace />}
      {currentPage === 'appointments' && <Appointments />}
      {currentPage === 'records' && <MedicalRecords />}
    </AppLayout>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <PatientTabsProvider>
          <AppContent />
        </PatientTabsProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
