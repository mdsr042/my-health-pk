import { useState, useCallback, useEffect } from 'react';
import { usePatientTabs } from '@/contexts/PatientTabsContext';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { sampleVitals, type CareAction, type Diagnosis, type Medication, type LabOrder } from '@/data/mockData';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  Stethoscope, Pill, FlaskConical, Scan, FileText, Plus,
  Save, Pause, CheckCircle2, Printer, Heart, Thermometer,
  Activity, Wind, Scale, Ruler, ArrowRightLeft,
  Building2, CalendarPlus, ChevronRight, LayoutTemplate, NotebookTabs, MessageSquareQuote
} from 'lucide-react';
import DiagnosisModal from '@/components/consultation/DiagnosisModal';
import MedicationModal from '@/components/consultation/MedicationModal';
import LabOrderModal from '@/components/consultation/LabOrderModal';
import ReferralModal from '@/components/consultation/ReferralModal';
import AppointmentBookingDialog from '@/components/appointments/AppointmentBookingDialog';
import PrescriptionPreview from '@/components/consultation/PrescriptionPreview';
import NotesTimeline from '@/components/consultation/NotesTimeline';
import OrdersPanel from '@/components/consultation/OrdersPanel';
import TreatmentTemplateDialog from '@/components/settings/TreatmentTemplateDialog';
import {
  createTreatmentTemplate,
  fetchAdviceTemplates,
  fetchDiagnosisSets,
  fetchInvestigationSets,
  fetchTreatmentTemplates,
} from '@/lib/api';
import { readStorage } from '@/lib/storage';
import { getLocalDateKey } from '@/lib/date';
import type {
  AdviceTemplate,
  DiagnosisSet,
  InvestigationSet,
  TreatmentTemplate,
  TreatmentTemplatePayload,
} from '@/lib/app-types';
import { APP_NAVIGATE_EVENT, SETTINGS_SECTION_TEMPLATES } from '@/lib/app-defaults';

function getTomorrowDateKey() {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  return getLocalDateKey(next);
}

interface ConsultationPageProps {
  patientId: string;
}

type TabView = 'consultation' | 'notes' | 'orders' | 'documents' | 'prescription';
const SETTINGS_STORAGE_KEY = 'my-health/settings';

function normalizeMedicationIdentity(value: string) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}%+./ -]+/gu, '')
    .trim();
}

function getMedicationIdentityKey(medication: Medication) {
  if (medication.id.startsWith('cat-')) {
    return medication.id;
  }

  return [
    normalizeMedicationIdentity(medication.name),
    normalizeMedicationIdentity(medication.strength),
    normalizeMedicationIdentity(medication.form),
    normalizeMedicationIdentity(medication.route),
  ].join('|');
}

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
  const { activeClinic, doctorClinics, user } = useAuth();
  const {
    getPatient,
    appointments,
    getPatientNotes,
    getConsultationDraft,
    saveConsultationDraft,
    completeConsultation,
    upsertAppointment,
  } = useData();
  const patient = getPatient(patientId);
  const patientNotes = getPatientNotes(patientId);
  const latestPreviousNote = patientNotes[0] ?? null;
  const activeAppointment = [...appointments]
    .filter(a => a.patientId === patientId && a.status !== 'completed' && a.status !== 'cancelled' && a.status !== 'no-show')
    .sort((a, b) => {
      const priority = (status: typeof a.status) => (status === 'in-consultation' ? 0 : status === 'waiting' ? 1 : 2);
      const clinicBoost = activeClinic?.id ? Number(a.clinicId !== activeClinic.id) - Number(b.clinicId !== activeClinic.id) : 0;
      if (clinicBoost !== 0) return clinicBoost;
      const priorityDiff = priority(a.status) - priority(b.status);
      if (priorityDiff !== 0) return priorityDiff;
      return `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`);
    })[0];
  const draft = getConsultationDraft(activeAppointment?.id, patientId);

  const [activeView, setActiveView] = useState<TabView>('consultation');
  const [diagnosisOpen, setDiagnosisOpen] = useState(false);
  const [medicationOpen, setMedicationOpen] = useState(false);
  const [labOrderOpen, setLabOrderOpen] = useState(false);
  const [labOrderType, setLabOrderType] = useState<'lab' | 'radiology'>('lab');
  const [referralOpen, setReferralOpen] = useState(false);
  const [referralType, setReferralType] = useState<'referral' | 'admission' | 'followup'>('referral');
  const [bookingOpen, setBookingOpen] = useState(false);
  const [templates, setTemplates] = useState<TreatmentTemplate[]>([]);
  const [diagnosisSets, setDiagnosisSets] = useState<DiagnosisSet[]>([]);
  const [investigationSets, setInvestigationSets] = useState<InvestigationSet[]>([]);
  const [adviceTemplates, setAdviceTemplates] = useState<AdviceTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [lastVisitExpanded, setLastVisitExpanded] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);

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
  const [careActions, setCareActions] = useState<CareAction[]>(draft?.careActions || []);

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
      const targetKey = getMedicationIdentityKey(med);
      const existingMedication = prev.find(item => getMedicationIdentityKey(item) === targetKey);
      return existingMedication
        ? prev.map(item => item.id === existingMedication.id ? { ...med, id: existingMedication.id } : item)
        : [...prev, med];
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
  const openFollowUpBooking = () => setBookingOpen(true);
  const applyConsultationTemplate = useCallback((templateId: string) => {
    const template = templates.find(item => item.id === templateId);
    if (!template) return;

    setChiefComplaint(prev => prev || template.chiefComplaint);
    setInstructions(prev => prev || template.instructions);
    setFollowUp(prev => prev || template.followUp);
    setDiagnoses(prev => {
      const existing = new Set(prev.map(item => `${item.code}:${item.name}`));
      const additions = template.diagnoses
        .filter(item => !existing.has(`${item.code}:${item.name}`))
        .map(item => ({
          ...item,
          id: `dx-template-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        }));
      return [...prev, ...additions];
    });
    setMedications(prev => {
      const existing = new Set(prev.map(item => `${item.name}:${item.strength}:${item.frequency}`));
      const additions = template.medications
        .filter(item => !existing.has(`${item.name}:${item.strength}:${item.frequency}`))
        .map(item => ({
          ...item,
          id: `med-template-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        }));
      return [...prev, ...additions];
    });
    setLabOrders(prev => {
      const existing = new Set(prev.map(item => `${item.testName}:${item.category}`));
      const additions = template.labOrders
        .filter(item => !existing.has(`${item.testName}:${item.category}`))
        .map(item => ({
          ...item,
          id: `lab-template-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          status: 'ordered',
          date: getLocalDateKey(),
        }));
      return [...prev, ...additions];
    });
    markUnsaved(patientId, true);
    toast.success(`${template.name} template applied`);
  }, [markUnsaved, patientId, templates]);

  const reusePreviousDiagnoses = useCallback(() => {
    if (!latestPreviousNote?.diagnoses.length) {
      toast.info('No previous diagnoses available to reuse');
      return;
    }

    setDiagnoses(prev => {
      const existing = new Set(prev.map(item => `${item.code}:${item.name}`));
      const additions = latestPreviousNote.diagnoses
        .filter(item => !existing.has(`${item.code}:${item.name}`))
        .map(item => ({
          ...item,
          id: `dx-reuse-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        }));
      return [...prev, ...additions];
    });
    markUnsaved(patientId, true);
    toast.success('Previous diagnoses added');
  }, [latestPreviousNote, markUnsaved, patientId]);

  const reusePreviousMedications = useCallback(() => {
    if (!latestPreviousNote?.medications.length) {
      toast.info('No previous medications available to reuse');
      return;
    }

    setMedications(prev => {
      const existing = new Set(prev.map(item => `${item.name}:${item.strength}:${item.frequency}`));
      const additions = latestPreviousNote.medications
        .filter(item => !existing.has(`${item.name}:${item.strength}:${item.frequency}`))
        .map(item => ({
          ...item,
          id: `med-reuse-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        }));
      return [...prev, ...additions];
    });
    markUnsaved(patientId, true);
    toast.success('Previous medications added');
  }, [latestPreviousNote, markUnsaved, patientId]);

  const reusePreviousInvestigations = useCallback(() => {
    if (!latestPreviousNote?.labOrders.length) {
      toast.info('No previous investigations available to reuse');
      return;
    }

    setLabOrders(prev => {
      const existing = new Set(prev.map(item => `${item.testName}:${item.category}`));
      const additions = latestPreviousNote.labOrders
        .filter(item => !existing.has(`${item.testName}:${item.category}`))
        .map(item => ({
          ...item,
          id: `lab-reuse-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          status: 'ordered',
          date: getLocalDateKey(),
        }));
      return [...prev, ...additions];
    });
    markUnsaved(patientId, true);
    toast.success('Previous investigations added');
  }, [latestPreviousNote, markUnsaved, patientId]);

  const reusePreviousAdvice = useCallback(() => {
    if (!latestPreviousNote?.instructions && !latestPreviousNote?.followUp) {
      toast.info('No previous advice available to reuse');
      return;
    }

    setInstructions(prev => prev || latestPreviousNote?.instructions || '');
    setFollowUp(prev => prev || latestPreviousNote?.followUp || '');
    markUnsaved(patientId, true);
    toast.success('Previous advice added');
  }, [latestPreviousNote, markUnsaved, patientId]);

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
      careActions,
    }),
    appointmentId: activeAppointment?.id || draft?.appointmentId || '',
    patientId,
    clinicId: activeClinic?.id || activeAppointment?.clinicId || 'clinic-1',
    vitals,
  }), [
    activeAppointment?.id,
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
    careActions,
    medications,
    pastHistory,
    patientId,
    plan,
    vitals,
  ]);

  const addCareAction = useCallback((action: Omit<CareAction, 'id' | 'doctorId' | 'appointmentId' | 'patientId' | 'clinicId'>) => {
    const nextAction: CareAction = {
      ...action,
      id: `care-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      appointmentId: activeAppointment?.id || draft?.appointmentId || '',
      patientId,
      clinicId: activeClinic?.id || activeAppointment?.clinicId || 'clinic-1',
      doctorId: user?.id || 'doctor',
    };
    setCareActions(prev => [nextAction, ...prev]);
    markUnsaved(patientId, true);
  }, [activeAppointment?.clinicId, activeAppointment?.id, activeClinic?.id, draft?.appointmentId, markUnsaved, patientId, user?.id]);

    const handleSaveDraft = async () => {
    if (!activeAppointment?.id) {
      toast.error('No active appointment found for this consultation');
      return;
    }
    await saveConsultationDraft(buildConsultationPayload());
    markUnsaved(patientId, false);
    toast.success('Draft saved', { description: `${patient?.name} consultation saved as draft` });
  };

  const handleHold = async () => {
    if (!activeAppointment?.id) {
      toast.error('No active appointment found for this consultation');
      return;
    }
    await saveConsultationDraft(buildConsultationPayload());
    markUnsaved(patientId, false);
    toast.info('Consultation on hold', { description: `${patient?.name} — will appear in your pending list` });
  };

  const handleComplete = async () => {
    if (!activeAppointment?.id) {
      toast.error('No active appointment found for this consultation');
      return;
    }
    await completeConsultation(buildConsultationPayload());
    markUnsaved(patientId, false);
    toast.success('Visit completed', { description: `${patient?.name} consultation finalized`, icon: <CheckCircle2 className="w-4 h-4 text-success" /> });
  };

  const handleBookNextAppointment = async (form: {
    id: string;
    patientId: string;
    clinicId: string;
    date: string;
    time: string;
    type: 'new' | 'follow-up';
    status: 'scheduled' | 'waiting' | 'in-consultation' | 'completed' | 'cancelled' | 'no-show';
    chiefComplaint: string;
    tokenNumber: number;
  }) => {
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

    toast.success('Next appointment booked', { description: `${patient.name} follow-up scheduled` });
    setBookingOpen(false);
  };

  const handleCreateTemplate = async (payload: TreatmentTemplatePayload) => {
    const createdTemplate = await createTreatmentTemplate(payload);
    setTemplates(current => [createdTemplate, ...current]);
    toast.success('Treatment template created');
  };

  const handleManageTemplates = () => {
    window.dispatchEvent(new CustomEvent(APP_NAVIGATE_EVENT, {
      detail: { page: 'settings', settingsSection: SETTINGS_SECTION_TEMPLATES },
    }));
  };

  useEffect(() => {
    let cancelled = false;
    const hydrateTemplates = async () => {
      setTemplatesLoading(true);
      try {
        const [remoteTemplates, remoteDiagnosisSets, remoteInvestigationSets, remoteAdviceTemplates] = await Promise.all([
          fetchTreatmentTemplates(),
          fetchDiagnosisSets(),
          fetchInvestigationSets(),
          fetchAdviceTemplates(),
        ]);
        if (!cancelled) {
          setTemplates(remoteTemplates);
          setDiagnosisSets(remoteDiagnosisSets);
          setInvestigationSets(remoteInvestigationSets);
          setAdviceTemplates(remoteAdviceTemplates);
        }
      } catch {
        if (!cancelled) {
          setTemplates([]);
          setDiagnosisSets([]);
          setInvestigationSets([]);
          setAdviceTemplates([]);
        }
      } finally {
        if (!cancelled) {
          setTemplatesLoading(false);
        }
      }
    };

    void hydrateTemplates();
    return () => {
      cancelled = true;
    };
  }, []);

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
    { label: 'Follow-up', icon: CalendarPlus, color: 'text-accent', action: openFollowUpBooking },
  ];
  const previousDiagnosesAvailable = Boolean(latestPreviousNote?.diagnoses.length);
  const previousMedicationsAvailable = Boolean(latestPreviousNote?.medications.length);
  const previousInvestigationsAvailable = Boolean(latestPreviousNote?.labOrders.length);
  const previousAdviceAvailable = Boolean(latestPreviousNote?.instructions || latestPreviousNote?.followUp);
  const clinicalFieldGroups = [
    {
      title: 'Symptoms & History',
      fields: clinicalFieldConfigs.filter(field => ['chiefComplaint', 'hpi', 'pastHistory', 'allergies'].includes(field.key)),
    },
    {
      title: 'Assessment & Plan',
      fields: clinicalFieldConfigs.filter(field => ['examination', 'assessment', 'plan', 'instructions', 'followUp'].includes(field.key)),
    },
  ] as const;

  const applyDiagnosisSet = (setId: string) => {
    const set = diagnosisSets.find(item => item.id === setId);
    if (!set) return;
    setDiagnoses(prev => {
      const existing = new Set(prev.map(item => `${item.code}:${item.name}`));
      const additions = set.diagnoses
        .filter(item => !existing.has(`${item.code}:${item.name}`))
        .map(item => ({ ...item, id: `dx-set-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }));
      return [...prev, ...additions];
    });
    markUnsaved(patientId, true);
    toast.success(`${set.name} diagnosis set applied`);
  };

  const applyInvestigationSet = (setId: string) => {
    const set = investigationSets.find(item => item.id === setId);
    if (!set) return;
    setLabOrders(prev => {
      const existing = new Set(prev.map(item => `${item.testName}:${item.category}`));
      const additions = set.labOrders
        .filter(item => !existing.has(`${item.testName}:${item.category}`))
        .map(item => ({
          ...item,
          id: `lab-set-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          status: 'ordered',
          date: getLocalDateKey(),
        }));
      return [...prev, ...additions];
    });
    markUnsaved(patientId, true);
    toast.success(`${set.name} investigation set applied`);
  };

  const applyAdviceTemplate = (templateId: string) => {
    const template = adviceTemplates.find(item => item.id === templateId);
    if (!template) return;
    setInstructions(prev => prev || template.instructions);
    setFollowUp(prev => prev || template.followUp);
    markUnsaved(patientId, true);
    toast.success(`${template.name} advice applied`);
  };

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

      {latestPreviousNote && (
        <div className="bg-card border-b border-border px-4 lg:px-6 py-3">
          <div className="rounded-xl border border-border bg-muted/20 p-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Last Visit</p>
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm font-medium text-foreground">
                    {new Date(latestPreviousNote.date).toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </p>
                  <span className="text-xs text-muted-foreground">{latestPreviousNote.chiefComplaint || 'No chief complaint recorded'}</span>
                  <span className="text-xs text-muted-foreground">{latestPreviousNote.diagnoses.length} diagnoses</span>
                  <span className="text-xs text-muted-foreground">{latestPreviousNote.medications.length} medicines</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="h-8" onClick={reusePreviousDiagnoses} disabled={!previousDiagnosesAvailable}>
                  Reuse Diagnoses
                </Button>
                <Button variant="outline" size="sm" className="h-8" onClick={reusePreviousMedications} disabled={!previousMedicationsAvailable}>
                  Reuse Medications
                </Button>
                <Button variant="outline" size="sm" className="h-8" onClick={reusePreviousInvestigations} disabled={!previousInvestigationsAvailable}>
                  Reuse Investigations
                </Button>
                <Button variant="outline" size="sm" className="h-8" onClick={reusePreviousAdvice} disabled={!previousAdviceAvailable}>
                  Reuse Advice
                </Button>
                <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setLastVisitExpanded(current => !current)}>
                  <ChevronRight className={`w-4 h-4 transition-transform ${lastVisitExpanded ? 'rotate-90' : ''}`} />
                  {lastVisitExpanded ? 'Hide Details' : 'View Details'}
                </Button>
              </div>
            </div>
            {lastVisitExpanded && (
              <div className="mt-3 grid gap-3 border-t border-border/70 pt-3 lg:grid-cols-[1fr_1fr_1fr_1fr]">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Previous Diagnoses</p>
                  <p className="text-sm text-foreground">{latestPreviousNote.diagnoses.slice(0, 3).map(dx => dx.name).join(', ') || '-'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Previous Medications</p>
                  <p className="text-sm text-foreground">{latestPreviousNote.medications.slice(0, 3).map(med => med.name).join(', ') || '-'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Previous Investigations</p>
                  <p className="text-sm text-foreground">{latestPreviousNote.labOrders.slice(0, 3).map(order => order.testName).join(', ') || '-'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Previous Follow-up</p>
                  <p className="text-sm text-foreground">{latestPreviousNote.followUp || 'No follow-up advice saved'}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
              <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-4 space-y-4">
                    <h3 className="font-semibold text-foreground">Symptoms & History</h3>
                    {clinicalFieldGroups[0].fields.map(field => {
                      const fieldState = {
                        chiefComplaint: { value: chiefComplaint, setter: setChiefComplaint },
                        hpi: { value: hpi, setter: setHpi },
                        pastHistory: { value: pastHistory, setter: setPastHistory },
                        allergies: { value: allergies, setter: setAllergies },
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
                      );
                    })}
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-4">
                      <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-primary" /> Vitals
                      </h3>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: 'BP', value: vitals.bp, unit: 'mmHg' },
                          { label: 'Pulse', value: vitals.pulse, unit: 'bpm' },
                          { label: 'Temp', value: vitals.temp, unit: '°F' },
                          { label: 'SpO₂', value: vitals.spo2, unit: '%' },
                          { label: 'Weight', value: vitals.weight, unit: 'kg' },
                          { label: 'Height', value: vitals.height, unit: 'cm' },
                          { label: 'BMI', value: vitals.bmi, unit: '' },
                          { label: 'RR', value: vitals.respiratoryRate, unit: '/min' },
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

                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-4 space-y-4">
                      <h3 className="font-semibold text-foreground">Assessment & Plan</h3>
                      {clinicalFieldGroups[1].fields.map(field => {
                        const fieldState = {
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
                        );
                      })}
                    </CardContent>
                  </Card>
                </div>
              </div>

              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
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
                </CardContent>
              </Card>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-foreground flex items-center gap-2">
                          <Pill className="w-4 h-4 text-success" /> Medications
                        </h3>
                        <p className="text-xs text-muted-foreground">Prescribe without scrolling to the bottom of the note.</p>
                      </div>
                      <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setMedicationOpen(true)}>
                        <Plus className="w-3.5 h-3.5" /> Add
                      </Button>
                    </div>
                    {medications.length === 0 ? (
                      <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-4 text-center">No medications prescribed yet</p>
                    ) : (
                      <div className="space-y-2">
                        {medications.map(med => (
                          <div key={med.id} className="bg-muted/50 rounded-lg p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-foreground text-sm">{med.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {med.form} • {med.route} • {med.frequency || med.frequencyUrdu || 'Frequency not set'} • {med.duration}
                                </p>
                                {med.frequencyUrdu && <p className="text-xs text-muted-foreground" dir="rtl">{med.frequencyUrdu}</p>}
                                {med.instructions && <p className="text-xs text-muted-foreground mt-1">{med.instructions}</p>}
                                {med.instructionsUrdu && <p className="text-xs text-muted-foreground" dir="rtl">{med.instructionsUrdu}</p>}
                              </div>
                              <button onClick={() => removeMedication(med.id)} className="text-xs text-destructive hover:underline">Remove</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-foreground flex items-center gap-2">
                          <FlaskConical className="w-4 h-4 text-warning" /> Investigations
                        </h3>
                        <p className="text-xs text-muted-foreground">Order labs and radiology from the first screen area.</p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => openLabModal('lab')}>
                          <Plus className="w-3.5 h-3.5" /> Lab
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => openLabModal('radiology')}>
                          <Plus className="w-3.5 h-3.5" /> Radiology
                        </Button>
                      </div>
                    </div>
                    {labOrders.length === 0 ? (
                      <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-4 text-center">No investigations ordered yet</p>
                    ) : (
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
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card className="border-0 shadow-sm">
                <CardContent className="p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-foreground flex items-center gap-2">
                        <LayoutTemplate className="w-4 h-4 text-primary" /> Treatment Templates
                      </h3>
                      <p className="text-xs text-muted-foreground">Use your saved editable starter sets after you finish the main history and assessment.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setTemplateDialogOpen(true)}>
                        <Plus className="w-3.5 h-3.5" /> Add Template
                      </Button>
                      <Button variant="outline" size="sm" className="h-8" onClick={handleManageTemplates}>
                        Manage Templates
                      </Button>
                    </div>
                  </div>
                  {templatesLoading ? (
                    <p className="text-sm text-muted-foreground">Loading treatment templates...</p>
                  ) : templates.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No templates saved yet. Create them in Settings and they will appear here.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {templates.map(template => (
                        <Button
                          key={template.id}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                          onClick={() => applyConsultationTemplate(template.id)}
                        >
                          {template.name}
                        </Button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="grid gap-4 xl:grid-cols-3">
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-4 space-y-3">
                    <div>
                      <h3 className="font-semibold text-foreground flex items-center gap-2">
                        <NotebookTabs className="w-4 h-4 text-primary" /> Diagnosis Sets
                      </h3>
                      <p className="text-xs text-muted-foreground">Apply saved diagnosis bundles in one click.</p>
                    </div>
                    {templatesLoading ? (
                      <p className="text-sm text-muted-foreground">Loading diagnosis sets...</p>
                    ) : diagnosisSets.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No diagnosis sets saved yet. Create them in Settings.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {diagnosisSets.map(item => (
                          <Button key={item.id} type="button" variant="outline" size="sm" className="h-8" onClick={() => applyDiagnosisSet(item.id)}>
                            {item.name}
                          </Button>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm">
                  <CardContent className="p-4 space-y-3">
                    <div>
                      <h3 className="font-semibold text-foreground flex items-center gap-2">
                        <FlaskConical className="w-4 h-4 text-warning" /> Investigation Sets
                      </h3>
                      <p className="text-xs text-muted-foreground">Apply saved workups without re-adding tests manually.</p>
                    </div>
                    {templatesLoading ? (
                      <p className="text-sm text-muted-foreground">Loading investigation sets...</p>
                    ) : investigationSets.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No investigation sets saved yet. Create them in Settings.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {investigationSets.map(item => (
                          <Button key={item.id} type="button" variant="outline" size="sm" className="h-8" onClick={() => applyInvestigationSet(item.id)}>
                            {item.name}
                          </Button>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm">
                  <CardContent className="p-4 space-y-3">
                    <div>
                      <h3 className="font-semibold text-foreground flex items-center gap-2">
                        <MessageSquareQuote className="w-4 h-4 text-info" /> Advice Templates
                      </h3>
                      <p className="text-xs text-muted-foreground">Fill instructions and follow-up text faster for repeat scenarios.</p>
                    </div>
                    {templatesLoading ? (
                      <p className="text-sm text-muted-foreground">Loading advice templates...</p>
                    ) : adviceTemplates.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No advice templates saved yet. Create them in Settings.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {adviceTemplates.map(item => (
                          <Button key={item.id} type="button" variant="outline" size="sm" className="h-8" onClick={() => applyAdviceTemplate(item.id)}>
                            {item.name}
                          </Button>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              </div>
            )}

            {activeView === 'notes' && <NotesTimeline notes={patientNotes} />}
            {activeView === 'orders' && <OrdersPanel activeOrders={labOrders} activeCareActions={careActions} previousNotes={patientNotes} />}
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
      <LabOrderModal open={labOrderOpen} onOpenChange={setLabOrderOpen} onAdd={addLabOrder} type={labOrderType} activeOrders={labOrders} />
      <ReferralModal
        open={referralOpen}
        onOpenChange={setReferralOpen}
        type={referralType}
        patientName={patient.name}
        onSave={addCareAction}
      />
      <AppointmentBookingDialog
        open={bookingOpen}
        onOpenChange={setBookingOpen}
        title="Book Next Appointment"
        mode="next"
        appointment={activeAppointment}
        patient={patient}
        patients={[patient]}
        clinics={doctorClinics}
        defaultClinicId={activeClinic?.id || activeAppointment?.clinicId}
        defaultDate={getTomorrowDateKey()}
        defaultType="follow-up"
        onSubmit={handleBookNextAppointment}
      />
      <TreatmentTemplateDialog
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
        template={null}
        onSave={handleCreateTemplate}
      />
    </div>
  );
}
