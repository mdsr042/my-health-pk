import { usePatientTabs } from '@/contexts/PatientTabsContext';
import ConsultationPage from '@/components/consultation/ConsultationPage';

export default function PatientWorkspace() {
  const { tabs, activeTabId } = usePatientTabs();

  if (tabs.length === 0) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-muted-foreground">
        <div className="text-center">
          <p className="text-lg font-medium">No patients open</p>
          <p className="text-sm">Open a patient from the queue to start consultation</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-7.5rem)]">
      {tabs.map(tab => (
        <div
          key={tab.patientId}
          className={`h-full ${tab.patientId === activeTabId ? 'block' : 'hidden'}`}
        >
          <ConsultationPage patientId={tab.patientId} />
        </div>
      ))}
    </div>
  );
}
