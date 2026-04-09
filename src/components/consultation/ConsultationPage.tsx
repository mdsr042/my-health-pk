import { useState, useCallback, useEffect } from 'react';
import { usePatientTabs } from '@/contexts/PatientTabsContext';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { sampleVitals, type Diagnosis, type Medication, type LabOrder } from '@/data/mockData';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  Stethoscope, Pill, FlaskConical, Scan, FileText, Plus,
  Save, Pause, CheckCircle2, Printer, Heart, Thermometer,
  Activity, Wind, Scale, Ruler, Clock, ArrowRightLeft, UserPlus,
  Building2, CalendarPlus
} from 'lucide-react';
import DiagnosisModal from '@/components/consultation/DiagnosisModal';
import MedicationModal from '@/components/consultation/MedicationModal';
import LabOrderModal from '@/components/consultation/LabOrderModal';
import ReferralModal from '@/components/consultation/ReferralModal';
import PrescriptionPreview from '@/components/consultation/PrescriptionPreview';
import NotesTimeline from '@/components/consultation/NotesTimeline';
import OrdersPanel from '@/components/consultation/OrdersPanel';
import { readStorage } from '@/lib/storage';

interface ConsultationPageProps {
  patientId: string;
}

type TabView = 'consultation' | 'notes' | 'orders' | 'documents' | 'prescription';
const SETTINGS_STORAGE_KEY = 'my-health/settings';

const clinicalFieldConfigs = [
  { label: 'Chief Complaint', key: 'chiefComplaint', rows: 2, suggestions: ['Fever for 3 days', 'Follow-up visit', 'General weakness'] },
  { label: 'History of Present Illness', key: 'hpi', rows: 3, suggestions: ['Symptoms started gradually', 'No shortness of breath', 'No vomiting or diarrhea'] },
  { label: 'Past Medical History', key: 'pastHistory', rows: 2, suggestions: ['Known case of hypertension', 'Known case of diabetes mellitus', 'No significant surgical history'] },
  { label: 'Allergies', key: 'allergies', rows: 1, suggestions: ['NKDA', 'Allergic to penicillin', 'Food allergy reported'] },
  { label: 'Examination', key: 'examination', rows: 3, suggestions: ['Patient is conscious and oriented', 'Chest clear bilaterally', 'Abdomen soft and non-tender'] },
  { label: 'Assessment', key: 'assessment', rows: 2, suggestions: ['Likely viral illness', 'Condition clinically stable', 'Symptoms improving since last visit'] },
  { label: 'Treatment Plan', key: 'plan', rows: 2, suggestions: ['Symptomatic treatment advised', 'Continue current medications', 'Relevant labs ordered'] },
  { label: 'Instructions', key: 'instructions', rows: 2, suggestions: ['Increase oral fluids', 'Return if symptoms worsen', 'Medication compliance explained'] },
  { label: 'Follow-up', key: 'followUp', rows: 1, suggestions: ['Follow up in 3 days', 'Follow up in 1 week', 'PRN review'] },
] as const;

function buildPayloadShape(payload: {
  chiefComplaint: string;
  hpi: string;
  pastHistory: string;
  allergies: string;
  examination: string;
  assessment: string;
  plan: string;
  instructions: string;
  followUp: string;
  diagnoses: Diagnosis[];
  medications: Medication[];
  labOrders: LabOrder[];
}) {
  return {
    ...payload,
    chiefComplaint: payload.chiefComplaint.trim(),
    hpi: payload.hpi.trim(),
    pastHistory: payload.pastHistory.trim(),
    allergies: payload.allergies.trim(),
    examination: payload.examination.trim(),
    assessment: payload.assessment.trim(),
    plan: payload.plan.trim(),
    instructions: payload.instructions.trim(),
    followUp: payload.followUp.trim(),
  };
}

export default function ConsultationPage({ patientId }: ConsultationPageProps) {
  const { markUnsaved } = usePatientTabs();
  const { activeClinic } = useAuth();
  const {
    getPatient,
    appointments,
    updateAppointmentStatus,
    getPatientNotes,
    getConsultationDraft,
    saveConsultationDraft,
    completeConsultation,
  } = useData();
  const patient = getPatient(patientId);
  const patientNotes = getPatientNotes(patientId);
  const draft = getConsultationDraft(patientId);
  const activeAppointment = appointments.find(a => a.patientId === patientId && a.status !== 'completed' && a.status !== 'cancelled');

  const [activeView, setActiveView] = useState<TabView>('consultation');
  const [diagnosisOpen, setDiagnosisOpen] = useState(false);
  const [medicationOpen, setMedicationOpen] = useState(false);
  const [labOrderOpen, setLabOrderOpen] = useState(false);
  const [labOrderType, setLabOrderType] = useState<'lab' | 'radiology'>('lab');
  const [referralOpen, setReferralOpen] = useState(false);
  const [referralType, setReferralType] = useState<'referral' | 'admission' | 'followup'>('referral');

  // Consultation form state
  const [chiefComplaint, setChiefComplaint] = useState(draft?.chiefComplaint || activeAppointment?.chiefComplaint || '');
  const [hpi, setHpi] = useState(draft?.hpi || '');
  const [pastHistory, setPastHistory] = useState(draft?.pastHistory || '');
  const [allergies, setAllergies] = useState(draft?.allergies || '');
  const [examination, setExamination] = useState(draft?.examination || '');
  const [assessment, setAssessment] = useState(draft?.assessment || '');
  const [plan, setPlan] = useState(draft?.plan || '');
  const [instructions, setInstructions] = useState(draft?.instructions || '');
  const [followUp, setFollowUp] = useState(draft?.followUp || '');
  const [vitals, setVitals] = useState(draft?.vitals || sampleVitals);
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>(draft?.diagnoses || []);
  const [medications, setMedications] = useState<Medication[]>(draft?.medications || []);
  const [labOrders, setLabOrders] = useState<LabOrder[]>(draft?.labOrders || []);

  const handleFieldChange = useCallback((setter: Function) => (value: string) => {
    setter(value);
    markUnsaved(patientId, true);
  }, [patientId, markUnsaved]);

  const appendSnippet = useCallback((setter: Function, currentValue: string, snippet: string) => {
    const nextValue = currentValue.trim() ? `${currentValue.trim()}\n${snippet}` : snippet;
    setter(nextValue);
    markUnsaved(patientId, true);
  }, [patientId, markUnsaved]);

  const addDiagnosis = (dx: Diagnosis) => {
    setDiagnoses(prev => {
      const exists = prev.some(item => item.id === dx.id);
      return exists ? prev.map(item => item.id === dx.id ? dx : item) : [...prev, dx];
    });
    markUnsaved(patientId, true);
  };
  const removeDiagnosis = (id: string) => { setDiagnoses(prev => prev.filter(d => d.id !== id)); markUnsaved(patientId, true); };
  const addMedication = (med: Medication) => {
    setMedications(prev => {
      const exists = prev.some(item => item.id === med.id);
      return exists ? prev.map(item => item.id === med.id ? med : item) : [...prev, med];
    });
    markUnsaved(patientId, true);
  };
  const removeMedication = (id: string) => { setMedications(prev => prev.filter(m => m.id !== id)); markUnsaved(patientId, true); };
  const addLabOrder = (order: LabOrder) => {
    setLabOrders(prev => [...prev, order]);
    markUnsaved(patientId, true);
    toast.success(`${order.testName} ordered`, { description: `Priority: ${order.priority}` });
  };

  const openLabModal = (type: 'lab' | 'radiology') => { setLabOrderType(type); setLabOrderOpen(true); };
  const openReferralModal = (type: 'referral' | 'admission' | 'followup') => { setReferralType(type); setReferralOpen(true); };

  const buildConsultationPayload = useCallback(() => ({
    ...buildPayloadShape({
      chiefComplaint,
      hpi,
      pastHistory,
      allergies,
      examination,
      assessment,
      plan,
      instructions,
      followUp,
      diagnoses,
      medications,
      labOrders,
    }),
    patientId,
    clinicId: activeClinic?.id || activeAppointment?.clinicId || 'clinic-1',
    vitals,
  }), [
    activeAppointment?.clinicId,
    activeClinic?.id,
    allergies,
    assessment,
    chiefComplaint,
    diagnoses,
    examination,
    followUp,
    hpi,
    instructions,
    labOrders,
    medications,
    pastHistory,
    patientId,
    plan,
    vitals,
  ]);

  const handleSaveDraft = async () => {
    await saveConsultationDraft(buildConsultationPayload());
    markUnsaved(patientId, false);
    toast.success('Draft saved', { description: `${patient?.name} consultation saved as draft` });
  };

  const handleHold = async () => {
    await saveConsultationDraft(buildConsultationPayload());
    markUnsaved(patientId, false);
    toast.info('Consultation on hold', { description: `${patient?.name} — will appear in your pending list` });
  };

  const handleComplete = async () => {
    await completeConsultation(buildConsultationPayload());
    markUnsaved(patientId, false);
    toast.success('Visit completed', { description: `${patient?.name} consultation finalized`, icon: <CheckCircle2 className="w-4 h-4 text-success" /> });
  };

  useEffect(() => {
    const settings = readStorage(SETTINGS_STORAGE_KEY, { autoSave: true });
    if (!settings.autoSave) return;

    const hasDraftableContent = Boolean(
      chiefComplaint ||
      hpi ||
      pastHistory ||
      allergies ||
      examination ||
      assessment ||
      plan ||
      instructions ||
      followUp ||
      diagnoses.length ||
      medications.length ||
      labOrders.length
    );

    if (!hasDraftableContent) return;

    const timer = window.setTimeout(() => {
      void saveConsultationDraft(buildConsultationPayload());
      markUnsaved(patientId, false);
    }, 30000);

    return () => window.clearTimeout(timer);
  }, [
    allergies,
    assessment,
    buildConsultationPayload,
    chiefComplaint,
    diagnoses.length,
    examination,
    followUp,
    hpi,
    instructions,
    labOrders.length,
    markUnsaved,
    medications.length,
    pastHistory,
    patientId,
    plan,
    saveConsultationDraft,
  ]);

  if (!patient) return <div className="p-6 text-muted-foreground">Patient not found</div>;

  const views: { id: TabView; label: string; icon: React.ElementType }[] = [
    { id: 'consultation', label: 'Consultation', icon: Stethoscope },
    { id: 'notes', label: `Previous Visits (${patientNotes.length})`, icon: FileText },
    { id: 'orders', label: 'Orders', icon: FlaskConical },
    { id: 'documents', label: 'Documents', icon: FileText },
    { id: 'prescription', label: 'Prescription', icon: Printer },
  ];

  const quickActions = [
    { label: 'Diagnosis', icon: Plus, color: 'text-primary', action: () => setDiagnosisOpen(true) },
    { label: 'Medication', icon: Pill, color: 'text-success', action: () => setMedicationOpen(true) },
    { label: 'Lab Order', icon: FlaskConical, color: 'text-warning', action: () => openLabModal('lab') },
    { label: 'Radiology', icon: Scan, color: 'text-info', action: () => openLabModal('radiology') },
    { label: 'Referral', icon: ArrowRightLeft, color: 'text-destructive', action: () => openReferralModal('referral') },
    { label: 'Admission', icon: Building2, color: 'text-muted-foreground', action: () => openReferralModal('admission') },
    { label: 'Follow-up', icon: CalendarPlus, color: 'text-accent', action: () => openReferralModal('followup') },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Patient header */}
      <div className="bg-card border-b border-border px-4 lg:px-6 py-3 flex flex-wrap items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
          {patient.name.split(' ').slice(0, 2).map(n => n[0]).join('')}
        </div>
        <div>
          <h2 className="font-semibold text-foreground">{patient.name}</h2>
          <div className="flex gap-3 text-xs text-muted-foreground">
            <span>{patient.mrn}</span>
            <span>{patient.age}y / {patient.gender}</span>
            <span>{patient.bloodGroup}</span>
            <span>{patient.phone}</span>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {patientNotes.length > 0 && (
            <Badge variant="outline" className="text-xs">
              {patientNotes.length} previous visit{patientNotes.length > 1 ? 's' : ''}
            </Badge>
          )}
          {labOrders.length > 0 && (
            <Badge variant="outline" className="text-xs bg-warning/10 text-warning border-warning/20">
              {labOrders.length} order{labOrders.length > 1 ? 's' : ''}
            </Badge>
          )}
        </div>
      </div>

      {/* View tabs */}
      <div className="bg-card border-b border-border px-4 lg:px-6 flex gap-0.5 overflow-x-auto scrollbar-thin">
        {views.map(v => {
          const Icon = v.icon;
          return (
            <button
              key={v.id}
              onClick={() => setActiveView(v.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 whitespace-nowrap transition-colors ${
                activeView === v.id
                  ? 'border-primary text-primary font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-4 h-4" />
              {v.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="flex min-h-full">
          <div className="flex-1">
            {activeView === 'consultation' && (
              <div className="p-4 lg:p-6 space-y-5">
              {/* Vitals */}
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" /> Vitals
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: 'BP', value: vitals.bp, icon: Heart, unit: 'mmHg' },
                      { label: 'Pulse', value: vitals.pulse, icon: Activity, unit: 'bpm' },
                      { label: 'Temp', value: vitals.temp, icon: Thermometer, unit: '°F' },
                      { label: 'SpO₂', value: vitals.spo2, icon: Wind, unit: '%' },
                      { label: 'Weight', value: vitals.weight, icon: Scale, unit: 'kg' },
                      { label: 'Height', value: vitals.height, icon: Ruler, unit: 'cm' },
                      { label: 'BMI', value: vitals.bmi, icon: Scale, unit: '' },
                      { label: 'RR', value: vitals.respiratoryRate, icon: Wind, unit: '/min' },
                    ].map(v => (
                      <div key={v.label} className="bg-muted/50 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground mb-1">{v.label}</p>
                        <div className="flex items-baseline gap-1">
                          <Input
                            value={v.value}
                            onChange={e => {
                              const keyMap = {
                                BP: 'bp',
                                Pulse: 'pulse',
                                Temp: 'temp',
                                'SpO₂': 'spo2',
                                Weight: 'weight',
                                Height: 'height',
                                BMI: 'bmi',
                                RR: 'respiratoryRate',
                              } as const;

                              setVitals(prev => ({ ...prev, [keyMap[v.label as keyof typeof keyMap]]: e.target.value }));
                              markUnsaved(patientId, true);
                            }}
                            className="h-7 bg-transparent border-0 p-0 text-lg font-semibold text-foreground focus-visible:ring-0 w-16"
                          />
                          <span className="text-xs text-muted-foreground">{v.unit}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Clinical form */}
              {clinicalFieldConfigs.map(field => {
                const fieldState = {
                  chiefComplaint: { value: chiefComplaint, setter: setChiefComplaint },
                  hpi: { value: hpi, setter: setHpi },
                  pastHistory: { value: pastHistory, setter: setPastHistory },
                  allergies: { value: allergies, setter: setAllergies },
                  examination: { value: examination, setter: setExamination },
                  assessment: { value: assessment, setter: setAssessment },
                  plan: { value: plan, setter: setPlan },
                  instructions: { value: instructions, setter: setInstructions },
                  followUp: { value: followUp, setter: setFollowUp },
                }[field.key];

                return (
                <div key={field.label} className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-sm font-medium text-foreground">{field.label}</label>
                    <span className="text-[11px] text-muted-foreground">Tap a quick note to insert</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {field.suggestions.map(suggestion => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => appendSnippet(fieldState.setter, fieldState.value, suggestion)}
                        className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                  <Textarea
                    value={fieldState.value}
                    onChange={e => handleFieldChange(fieldState.setter)(e.target.value)}
                    onInput={e => {
                      const target = e.currentTarget;
                      target.style.height = 'auto';
                      target.style.height = `${Math.max(target.scrollHeight, 56)}px`;
                    }}
                    placeholder={`Enter ${field.label.toLowerCase()}...`}
                    rows={field.rows}
                    className="min-h-[56px] resize-none"
                  />
                </div>
              )})}

              {/* Diagnoses */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-foreground">Diagnoses</h3>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setDiagnosisOpen(true)}>
                    <Plus className="w-3 h-3" /> Add
                  </Button>
                </div>
                {diagnoses.length === 0 ? (
                  <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-4 text-center">No diagnoses added yet</p>
                ) : (
                  <div className="space-y-2">
                    {diagnoses.map(dx => (
                      <div key={dx.id} className="flex items-center gap-3 bg-muted/50 rounded-lg p-3">
                        <div className="flex-1">
                          <span className="font-medium text-foreground text-sm">{dx.name}</span>
                          <span className="ml-2 text-xs text-muted-foreground">{dx.code}</span>
                        </div>
                        {dx.isPrimary && <Badge className="bg-primary/10 text-primary text-[10px]">Primary</Badge>}
                        <button onClick={() => removeDiagnosis(dx.id)} className="text-xs text-destructive hover:underline">Remove</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Medications */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-foreground">Medications</h3>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setMedicationOpen(true)}>
                    <Plus className="w-3 h-3" /> Add
                  </Button>
                </div>
                {medications.length === 0 ? (
                  <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-4 text-center">No medications prescribed yet</p>
                ) : (
                  <div className="space-y-2">
                    {medications.map(med => (
                      <div key={med.id} className="bg-muted/50 rounded-lg p-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium text-foreground text-sm">{med.name}</p>
                            <p className="text-xs text-muted-foreground">{med.form} • {med.route} • {med.frequency} • {med.duration}</p>
                            {med.frequencyUrdu && <p className="text-xs text-muted-foreground" dir="rtl">🕒 {med.frequencyUrdu}</p>}
                            {med.instructions && <p className="text-xs text-muted-foreground mt-1">📋 {med.instructions}</p>}
                            {med.instructionsUrdu && <p className="text-xs text-muted-foreground" dir="rtl">📋 {med.instructionsUrdu}</p>}
                          </div>
                          <button onClick={() => removeMedication(med.id)} className="text-xs text-destructive hover:underline">Remove</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Lab Orders */}
              {labOrders.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-foreground mb-2">Lab & Radiology Orders</h3>
                  <div className="space-y-2">
                    {labOrders.map(order => (
                      <div key={order.id} className="flex items-center gap-3 bg-muted/50 rounded-lg p-3">
                        <div className={`w-7 h-7 rounded-md flex items-center justify-center ${order.category.includes('Radiology') || order.category.includes('Ultrasound') || order.category.includes('CT') || order.category.includes('MRI') ? 'bg-info/10' : 'bg-warning/10'}`}>
                          {order.category.includes('Radiology') || order.category.includes('Ultrasound') || order.category.includes('CT') || order.category.includes('MRI')
                            ? <Scan className="w-3.5 h-3.5 text-info" />
                            : <FlaskConical className="w-3.5 h-3.5 text-warning" />}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">{order.testName}</p>
                          <p className="text-xs text-muted-foreground">{order.category}</p>
                        </div>
                        <Badge variant="outline" className={`text-[10px] ${order.priority === 'stat' ? 'border-destructive/30 text-destructive' : order.priority === 'urgent' ? 'border-warning/30 text-warning' : ''}`}>
                          {order.priority}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              </div>
            )}

            {activeView === 'notes' && <NotesTimeline notes={patientNotes} />}
            {activeView === 'orders' && <OrdersPanel activeOrders={labOrders} previousNotes={patientNotes} />}
            {activeView === 'documents' && (
              <div className="p-6 text-center text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
                <p className="font-medium">Documents</p>
                <p className="text-sm">Upload and manage patient documents (PDF, JPG, PNG)</p>
                <Button variant="outline" className="mt-4 gap-2">
                  <Plus className="w-4 h-4" /> Upload Document
                </Button>
              </div>
            )}
            {activeView === 'prescription' && (
              <PrescriptionPreview
                patient={patient}
                diagnoses={diagnoses}
                medications={medications}
                chiefComplaint={chiefComplaint}
                pastHistory={pastHistory}
                allergies={allergies}
                vitals={vitals}
                followUp={followUp}
                instructions={instructions}
              />
            )}
          </div>

          <div className="hidden lg:flex flex-col gap-1 p-3 border-l border-border bg-card w-[172px] shrink-0 sticky top-0 self-start max-h-[calc(100vh-12rem)]">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">Quick Actions</p>
            {quickActions.map(action => {
              const Icon = action.icon;
              return (
                <button
                  key={action.label}
                  onClick={action.action}
                  className="flex items-center gap-2.5 px-2.5 py-2.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors text-left"
                >
                  <Icon className={`w-3.5 h-3.5 ${action.color}`} />
                  {action.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom action bar */}
      <div className="bg-card border-t border-border px-4 lg:px-6 py-3 flex items-center gap-3 no-print">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void handleSaveDraft()}>
          <Save className="w-4 h-4" /> Save Draft
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void handleHold()}>
          <Pause className="w-4 h-4" /> Hold
        </Button>
        <div className="flex-1" />
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setActiveView('prescription')}>
          <Printer className="w-4 h-4" /> Print Rx
        </Button>
        <Button size="sm" className="gap-1.5 bg-success hover:bg-success/90 text-success-foreground" onClick={() => void handleComplete()}>
          <CheckCircle2 className="w-4 h-4" /> Complete Visit
        </Button>
      </div>

      {/* Modals */}
      <DiagnosisModal
        open={diagnosisOpen}
        onOpenChange={setDiagnosisOpen}
        onAdd={addDiagnosis}
        onRemove={removeDiagnosis}
        diagnoses={diagnoses}
      />
      <MedicationModal
        open={medicationOpen}
        onOpenChange={setMedicationOpen}
        onAdd={addMedication}
        onRemove={removeMedication}
        prescribedMedications={medications}
      />
      <LabOrderModal open={labOrderOpen} onOpenChange={setLabOrderOpen} onAdd={addLabOrder} type={labOrderType} />
      <ReferralModal open={referralOpen} onOpenChange={setReferralOpen} type={referralType} patientName={patient.name} />
    </div>
  );
}
