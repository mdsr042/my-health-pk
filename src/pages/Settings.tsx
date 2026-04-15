import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Bell,
  Copy,
  FlaskConical,
  Globe,
  LayoutTemplate,
  MessageSquareQuote,
  NotebookTabs,
  Palette,
  PencilLine,
  Plus,
  Settings2,
  Shield,
  Star,
  Trash2,
} from 'lucide-react';
import { readStorage, writeStorage } from '@/lib/storage';
import {
  mergeAppSettings,
  SETTINGS_SECTION_CLINICS,
  SETTINGS_SECTION_FAVORITES,
  SETTINGS_SECTION_GENERAL,
  SETTINGS_SECTION_LIBRARY,
  SETTINGS_SECTION_OVERVIEW,
  SETTINGS_SECTION_SECURITY,
  SETTINGS_SECTION_TEMPLATES,
  SETTINGS_STORAGE_KEY,
  SETTINGS_UPDATED_EVENT,
} from '@/lib/app-defaults';
import {
  changePassword,
  createAdviceTemplate,
  createConditionLibraryEntry,
  createDiagnosisSet,
  createInvestigationSet,
  createTreatmentTemplate,
  deleteAdviceTemplate,
  deleteConditionLibraryEntry,
  deleteDiagnosisSet,
  deleteInvestigationSet,
  deleteTreatmentTemplate,
  fetchAdviceTemplates,
  fetchConditionLibrary,
  fetchDiagnosisSets,
  fetchInvestigationSets,
  fetchMedicationLibraryFavorites,
  fetchSettings,
  fetchTreatmentTemplates,
  importStarterTreatmentTemplates,
  persistSettings,
  removeMedicationFavorite,
  updateAdviceTemplate,
  updateConditionLibraryEntry,
  updateDiagnosisSet,
  updateInvestigationSet,
  updateTreatmentTemplate,
} from '@/lib/api';
import type {
  AdviceTemplate,
  AdviceTemplatePayload,
  AppSettings,
  ConditionLibraryEntry,
  DiagnosisSet,
  DiagnosisSetPayload,
  InvestigationSet,
  InvestigationSetPayload,
  MedicationLibraryFavorite,
  TreatmentTemplate,
  TreatmentTemplatePayload,
} from '@/lib/app-types';
import TreatmentTemplateDialog from '@/components/settings/TreatmentTemplateDialog';
import ReusableContentDialog from '@/components/settings/ReusableContentDialog';
import ConditionLibraryDialog from '@/components/settings/ConditionLibraryDialog';
import MedicationModal from '@/components/consultation/MedicationModal';
import ClinicsPage from '@/pages/Clinics';

type SettingsSection =
  | typeof SETTINGS_SECTION_OVERVIEW
  | typeof SETTINGS_SECTION_GENERAL
  | typeof SETTINGS_SECTION_CLINICS
  | typeof SETTINGS_SECTION_TEMPLATES
  | typeof SETTINGS_SECTION_FAVORITES
  | typeof SETTINGS_SECTION_LIBRARY
  | typeof SETTINGS_SECTION_SECURITY;

interface SettingsPageProps {
  initialSection?: string;
}

const SETTINGS_SECTIONS: Array<{
  id: SettingsSection;
  title: string;
  description: string;
  icon: typeof Settings2;
}> = [
  {
    id: SETTINGS_SECTION_GENERAL,
    title: 'General',
    description: 'Notifications, consultation preferences, language, and appearance.',
    icon: Settings2,
  },
  {
    id: SETTINGS_SECTION_CLINICS,
    title: 'Clinic Management',
    description: 'Manage locations, active clinic details, and new practice branches.',
    icon: Globe,
  },
  {
    id: SETTINGS_SECTION_TEMPLATES,
    title: 'Treatment Templates',
    description: 'Doctor-managed OPD starter sets for common cases.',
    icon: LayoutTemplate,
  },
  {
    id: SETTINGS_SECTION_FAVORITES,
    title: 'Medication Favorites',
    description: 'Saved medicines with full prescribing setup ready to reuse.',
    icon: Star,
  },
  {
    id: SETTINGS_SECTION_LIBRARY,
    title: 'Clinical Library',
    description: 'Diagnosis sets, investigation sets, and reusable advice templates.',
    icon: NotebookTabs,
  },
  {
    id: SETTINGS_SECTION_SECURITY,
    title: 'Security',
    description: 'Password and account safety controls.',
    icon: Shield,
  },
];

const isSettingsSection = (value?: string): value is SettingsSection =>
  value === SETTINGS_SECTION_OVERVIEW ||
  value === SETTINGS_SECTION_GENERAL ||
  value === SETTINGS_SECTION_CLINICS ||
  value === SETTINGS_SECTION_TEMPLATES ||
  value === SETTINGS_SECTION_FAVORITES ||
  value === SETTINGS_SECTION_LIBRARY ||
  value === SETTINGS_SECTION_SECURITY;

function SectionShell({
  title,
  description,
  onBack,
  children,
  actions,
}: {
  title: string;
  description: string;
  onBack: () => void;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Button variant="ghost" className="h-8 px-2 text-muted-foreground" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Settings
          </Button>
          <div>
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

export default function SettingsPage({ initialSection = SETTINGS_SECTION_OVERVIEW }: SettingsPageProps) {
  const saved = mergeAppSettings(readStorage<Partial<AppSettings>>(SETTINGS_STORAGE_KEY, {}));

  const [notifications, setNotifications] = useState(saved.notifications);
  const [soundAlerts, setSoundAlerts] = useState(saved.soundAlerts);
  const [autoSave, setAutoSave] = useState(saved.autoSave);
  const [language, setLanguage] = useState(saved.language);
  const [theme, setTheme] = useState(saved.theme);
  const [compactMode, setCompactMode] = useState(saved.compactMode);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(saved.sidebarCollapsed);
  const [clinicOverrides] = useState(saved.clinicOverrides);
  const [managedClinics] = useState(saved.managedClinics);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [templates, setTemplates] = useState<TreatmentTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TreatmentTemplate | null>(null);
  const [diagnosisSets, setDiagnosisSets] = useState<DiagnosisSet[]>([]);
  const [investigationSets, setInvestigationSets] = useState<InvestigationSet[]>([]);
  const [adviceTemplates, setAdviceTemplates] = useState<AdviceTemplate[]>([]);
  const [conditionLibrary, setConditionLibrary] = useState<ConditionLibraryEntry[]>([]);
  const [medicationFavorites, setMedicationFavorites] = useState<MedicationLibraryFavorite[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryDialogOpen, setLibraryDialogOpen] = useState(false);
  const [libraryDialogMode, setLibraryDialogMode] = useState<'diagnosis' | 'investigation' | 'advice'>('diagnosis');
  const [editingLibraryItem, setEditingLibraryItem] = useState<DiagnosisSet | InvestigationSet | AdviceTemplate | null>(null);
  const [favoriteModalOpen, setFavoriteModalOpen] = useState(false);
  const [conditionDialogOpen, setConditionDialogOpen] = useState(false);
  const [editingCondition, setEditingCondition] = useState<ConditionLibraryEntry | null>(null);
  const [activeSection, setActiveSection] = useState<SettingsSection>(
    isSettingsSection(initialSection) ? initialSection : SETTINGS_SECTION_OVERVIEW,
  );

  useEffect(() => {
    if (isSettingsSection(initialSection)) {
      setActiveSection(initialSection);
    }
  }, [initialSection]);

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      try {
        const remoteSettings = await fetchSettings();
        if (!remoteSettings || cancelled) return;

        const mergedRemoteSettings = mergeAppSettings(remoteSettings);

        setNotifications(mergedRemoteSettings.notifications);
        setSoundAlerts(mergedRemoteSettings.soundAlerts);
        setAutoSave(mergedRemoteSettings.autoSave);
        setLanguage(mergedRemoteSettings.language);
        setTheme(mergedRemoteSettings.theme);
        setCompactMode(mergedRemoteSettings.compactMode);
        setSidebarCollapsed(mergedRemoteSettings.sidebarCollapsed);
        writeStorage(SETTINGS_STORAGE_KEY, mergedRemoteSettings);
      } catch {
        // Keep local settings when the API is unavailable.
      }
    };

    const hydrateLibrary = async () => {
      setTemplatesLoading(true);
      setLibraryLoading(true);
      try {
        const [remoteTemplates, remoteDiagnosisSets, remoteInvestigationSets, remoteAdviceTemplates, remoteConditionLibrary, remoteMedicationFavorites] = await Promise.all([
          fetchTreatmentTemplates(),
          fetchDiagnosisSets(),
          fetchInvestigationSets(),
          fetchAdviceTemplates(),
          fetchConditionLibrary(),
          fetchMedicationLibraryFavorites(),
        ]);
        if (!cancelled) {
          setTemplates(remoteTemplates);
          setDiagnosisSets(remoteDiagnosisSets);
          setInvestigationSets(remoteInvestigationSets);
          setAdviceTemplates(remoteAdviceTemplates);
          setConditionLibrary(remoteConditionLibrary);
          setMedicationFavorites(remoteMedicationFavorites);
        }
      } catch {
        if (!cancelled) {
          setTemplates([]);
          setDiagnosisSets([]);
          setInvestigationSets([]);
          setAdviceTemplates([]);
          setConditionLibrary([]);
          setMedicationFavorites([]);
        }
      } finally {
        if (!cancelled) {
          setTemplatesLoading(false);
          setLibraryLoading(false);
        }
      }
    };

    void hydrate();
    void hydrateLibrary();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    const nextSettings = mergeAppSettings({
      notifications,
      soundAlerts,
      autoSave,
      language,
      theme,
      compactMode,
      sidebarCollapsed,
      clinicOverrides,
      managedClinics,
    });

    writeStorage(SETTINGS_STORAGE_KEY, nextSettings);
    window.dispatchEvent(new Event(SETTINGS_UPDATED_EVENT));

    try {
      await persistSettings(nextSettings);
    } catch {
      // Save locally even when the API is offline.
    }

    toast.success('Settings saved successfully');
  };

  const handlePasswordSave = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error('Please fill all password fields');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('New password and confirmation do not match');
      return;
    }

    setIsSavingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password updated successfully');
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleTemplateSave = async (payload: TreatmentTemplatePayload) => {
    try {
      const savedTemplate = editingTemplate
        ? await updateTreatmentTemplate(editingTemplate.id, payload)
        : await createTreatmentTemplate(payload);

      setTemplates(current =>
        editingTemplate
          ? current.map(item => (item.id === savedTemplate.id ? savedTemplate : item))
          : [savedTemplate, ...current],
      );
      setEditingTemplate(null);
      toast.success(editingTemplate ? 'Treatment template updated' : 'Treatment template created');
    } catch {
      toast.error('Unable to save treatment template');
      throw new Error('TEMPLATE_SAVE_FAILED');
    }
  };

  const handleTemplateDuplicate = async (template: TreatmentTemplate) => {
    try {
      const duplicate = await createTreatmentTemplate({
        name: `${template.name} Copy`,
        conditionLabel: template.conditionLabel,
        chiefComplaint: template.chiefComplaint,
        instructions: template.instructions,
        followUp: template.followUp,
        diagnoses: template.diagnoses,
        medications: template.medications,
        labOrders: template.labOrders,
      });

      setTemplates(current => [duplicate, ...current]);
      toast.success('Treatment template duplicated');
    } catch {
      toast.error('Unable to duplicate treatment template');
    }
  };

  const handleTemplateDelete = async (template: TreatmentTemplate) => {
    try {
      await deleteTreatmentTemplate(template.id);
      setTemplates(current => current.filter(item => item.id !== template.id));
      if (editingTemplate?.id === template.id) {
        setEditingTemplate(null);
        setTemplateDialogOpen(false);
      }
      toast.success('Treatment template deleted');
    } catch {
      toast.error('Unable to delete treatment template');
    }
  };

  const handleImportStarterTemplates = async () => {
    try {
      const importedTemplates = await importStarterTreatmentTemplates();
      setTemplates(importedTemplates);
      toast.success('Starter treatment templates imported');
    } catch {
      toast.error('Unable to import starter treatment templates');
    }
  };

  const openLibraryDialog = (mode: 'diagnosis' | 'investigation' | 'advice', item: DiagnosisSet | InvestigationSet | AdviceTemplate | null = null) => {
    setLibraryDialogMode(mode);
    setEditingLibraryItem(item);
    setLibraryDialogOpen(true);
  };

  const handleLibrarySave = async (payload: DiagnosisSetPayload | InvestigationSetPayload | AdviceTemplatePayload) => {
    try {
      if (libraryDialogMode === 'diagnosis') {
        const savedItem = editingLibraryItem
          ? await updateDiagnosisSet(editingLibraryItem.id, payload as DiagnosisSetPayload)
          : await createDiagnosisSet(payload as DiagnosisSetPayload);
        setDiagnosisSets(current =>
          editingLibraryItem ? current.map(item => (item.id === savedItem.id ? savedItem : item)) : [savedItem, ...current],
        );
        toast.success(editingLibraryItem ? 'Diagnosis set updated' : 'Diagnosis set created');
        return;
      }

      if (libraryDialogMode === 'investigation') {
        const savedItem = editingLibraryItem
          ? await updateInvestigationSet(editingLibraryItem.id, payload as InvestigationSetPayload)
          : await createInvestigationSet(payload as InvestigationSetPayload);
        setInvestigationSets(current =>
          editingLibraryItem ? current.map(item => (item.id === savedItem.id ? savedItem : item)) : [savedItem, ...current],
        );
        toast.success(editingLibraryItem ? 'Investigation set updated' : 'Investigation set created');
        return;
      }

      const savedItem = editingLibraryItem
        ? await updateAdviceTemplate(editingLibraryItem.id, payload as AdviceTemplatePayload)
        : await createAdviceTemplate(payload as AdviceTemplatePayload);
      setAdviceTemplates(current =>
        editingLibraryItem ? current.map(item => (item.id === savedItem.id ? savedItem : item)) : [savedItem, ...current],
      );
      toast.success(editingLibraryItem ? 'Advice template updated' : 'Advice template created');
    } catch {
      toast.error('Unable to save reusable content');
      throw new Error('LIBRARY_SAVE_FAILED');
    }
  };

  const handleDeleteDiagnosisSet = async (item: DiagnosisSet) => {
    try {
      await deleteDiagnosisSet(item.id);
      setDiagnosisSets(current => current.filter(entry => entry.id !== item.id));
      toast.success('Diagnosis set deleted');
    } catch {
      toast.error('Unable to delete diagnosis set');
    }
  };

  const handleDeleteInvestigationSet = async (item: InvestigationSet) => {
    try {
      await deleteInvestigationSet(item.id);
      setInvestigationSets(current => current.filter(entry => entry.id !== item.id));
      toast.success('Investigation set deleted');
    } catch {
      toast.error('Unable to delete investigation set');
    }
  };

  const handleDeleteAdviceTemplate = async (item: AdviceTemplate) => {
    try {
      await deleteAdviceTemplate(item.id);
      setAdviceTemplates(current => current.filter(entry => entry.id !== item.id));
      toast.success('Advice template deleted');
    } catch {
      toast.error('Unable to delete advice template');
    }
  };

  const handleDuplicateDiagnosisSet = async (item: DiagnosisSet) => {
    try {
      const duplicate = await createDiagnosisSet({ name: `${item.name} Copy`, diagnoses: item.diagnoses });
      setDiagnosisSets(current => [duplicate, ...current]);
      toast.success('Diagnosis set duplicated');
    } catch {
      toast.error('Unable to duplicate diagnosis set');
    }
  };

  const handleDuplicateInvestigationSet = async (item: InvestigationSet) => {
    try {
      const duplicate = await createInvestigationSet({ name: `${item.name} Copy`, labOrders: item.labOrders });
      setInvestigationSets(current => [duplicate, ...current]);
      toast.success('Investigation set duplicated');
    } catch {
      toast.error('Unable to duplicate investigation set');
    }
  };

  const handleDuplicateAdviceTemplate = async (item: AdviceTemplate) => {
    try {
      const duplicate = await createAdviceTemplate({
        name: `${item.name} Copy`,
        languageMode: item.languageMode,
        instructions: item.instructions,
        followUp: item.followUp,
      });
      setAdviceTemplates(current => [duplicate, ...current]);
      toast.success('Advice template duplicated');
    } catch {
      toast.error('Unable to duplicate advice template');
    }
  };

  const handleRemoveMedicationFavorite = async (registrationNo: string) => {
    try {
      await removeMedicationFavorite(registrationNo);
      setMedicationFavorites(current => current.filter(item => item.favorite.registrationNo !== registrationNo));
      toast.success('Medication favorite removed');
    } catch {
      toast.error('Unable to remove medication favorite');
    }
  };

  const handleConditionSave = async (payload: { name: string; code: string; aliases: string[] }) => {
    try {
      const saved = editingCondition
        ? await updateConditionLibraryEntry(editingCondition.id, payload)
        : await createConditionLibraryEntry(payload);
      setConditionLibrary(current => editingCondition
        ? current.map(item => item.id === saved.id ? saved : item)
        : [saved, ...current]);
      setEditingCondition(null);
      toast.success(editingCondition ? 'Condition updated' : 'Condition created');
    } catch {
      toast.error('Unable to save condition');
      throw new Error('CONDITION_SAVE_FAILED');
    }
  };

  const handleDeleteCondition = async (item: ConditionLibraryEntry) => {
    try {
      await deleteConditionLibraryEntry(item.id);
      setConditionLibrary(current => current.filter(entry => entry.id !== item.id));
      toast.success('Condition deleted');
    } catch {
      toast.error('Unable to delete condition');
    }
  };

  const overviewCounts = useMemo(
    () => ({
      templates: templates.length,
      favorites: medicationFavorites.length,
      library: conditionLibrary.length + diagnosisSets.length + investigationSets.length + adviceTemplates.length,
    }),
    [adviceTemplates.length, conditionLibrary.length, diagnosisSets.length, investigationSets.length, medicationFavorites.length, templates.length],
  );

  const renderOverview = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Focused Settings</h2>
        <p className="text-sm text-muted-foreground">
          Open one section at a time so templates, favorites, and reusable content stay easy to manage.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {SETTINGS_SECTIONS.map(section => {
          const Icon = section.icon;
          const countText =
            section.id === SETTINGS_SECTION_TEMPLATES
              ? `${overviewCounts.templates} saved`
              : section.id === SETTINGS_SECTION_FAVORITES
                ? `${overviewCounts.favorites} saved`
                : section.id === SETTINGS_SECTION_LIBRARY
                  ? `${overviewCounts.library} saved`
                  : undefined;

          return (
            <Card
              key={section.id}
              className="border-border/70 transition-colors hover:border-primary/50 hover:bg-muted/20"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="rounded-md bg-primary/10 p-2 text-primary">
                        <Icon className="h-4 w-4" />
                      </div>
                      <CardTitle className="text-base">{section.title}</CardTitle>
                    </div>
                    <CardDescription>{section.description}</CardDescription>
                  </div>
                  {countText ? (
                    <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                      {countText}
                    </span>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="flex items-center justify-end pt-0">
                <Button variant="outline" onClick={() => setActiveSection(section.id)}>
                  Open
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );

  const renderGeneral = () => (
    <SectionShell
      title="General"
      description="Notifications, consultation defaults, language, and appearance settings."
      onBack={() => setActiveSection(SETTINGS_SECTION_OVERVIEW)}
      actions={<Button onClick={() => void handleSave()}>Save Settings</Button>}
    >
      <div className="grid gap-5">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Bell className="h-4 w-4 text-primary" /> Notifications
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label className="text-sm font-medium">Push Notifications</Label>
                  <p className="text-xs text-muted-foreground">Get notified for new patients and updates.</p>
                </div>
                <Switch checked={notifications} onCheckedChange={setNotifications} />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label className="text-sm font-medium">Sound Alerts</Label>
                  <p className="text-xs text-muted-foreground">Play a sound when a new patient arrives in queue.</p>
                </div>
                <Switch checked={soundAlerts} onCheckedChange={setSoundAlerts} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Settings2 className="h-4 w-4 text-primary" /> Consultation
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label className="text-sm font-medium">Auto-save Drafts</Label>
                  <p className="text-xs text-muted-foreground">Automatically save consultation drafts every 30 seconds.</p>
                </div>
                <Switch checked={autoSave} onCheckedChange={setAutoSave} />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label className="text-sm font-medium">Compact View</Label>
                  <p className="text-xs text-muted-foreground">Reduce spacing to fit more consultation content on screen.</p>
                </div>
                <Switch checked={compactMode} onCheckedChange={setCompactMode} />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label className="text-sm font-medium">Collapsed Sidebar by Default</Label>
                  <p className="text-xs text-muted-foreground">Start desktop view in icon-only sidebar mode.</p>
                </div>
                <Switch checked={sidebarCollapsed} onCheckedChange={setSidebarCollapsed} />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-5 space-y-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Globe className="h-4 w-4 text-primary" /> Language & Regional
              </h3>
              <div className="space-y-1.5">
                <Label className="text-sm">Interface Language</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="ur">اردو (Urdu)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-lg border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                Prescription language is selected while prescribing each medicine so the doctor can choose based on the patient’s understanding.
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="p-5 space-y-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Palette className="h-4 w-4 text-primary" /> Appearance
              </h3>
              <div className="space-y-1.5 max-w-xs">
                <Label className="text-sm">Theme</Label>
                <Select value={theme} onValueChange={setTheme}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </SectionShell>
  );

  const renderTemplates = () => (
    <SectionShell
      title="Treatment Templates"
      description="Manage doctor-owned OPD starter sets that power consultation quick apply."
      onBack={() => setActiveSection(SETTINGS_SECTION_OVERVIEW)}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-1.5" onClick={() => void handleImportStarterTemplates()}>
            <Copy className="h-4 w-4" /> Import Starter Templates
          </Button>
          <Button onClick={() => { setEditingTemplate(null); setTemplateDialogOpen(true); }} className="gap-1.5">
            <Plus className="h-4 w-4" /> Add Template
          </Button>
        </div>
      }
    >
      <Card className="border-0 shadow-sm">
        <CardContent className="p-5">
          {templatesLoading ? (
            <p className="text-sm text-muted-foreground">Loading treatment templates...</p>
          ) : templates.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No treatment templates saved yet. Create one here or import the starter OPD set.
            </div>
          ) : (
            <div className="space-y-3">
              {templates.map(template => (
                <div key={template.id} className="rounded-lg border border-border/70 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-foreground">{template.name}</p>
                        {template.conditionLabel ? (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                            {template.conditionLabel}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm text-muted-foreground">{template.chiefComplaint || 'No chief complaint saved'}</p>
                      <p className="text-xs text-muted-foreground">
                        {template.diagnoses.length} diagnoses • {template.medications.length} medicines • {template.labOrders.length} investigations
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setEditingTemplate(template); setTemplateDialogOpen(true); }}>
                        <PencilLine className="h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void handleTemplateDuplicate(template)}>
                        <Copy className="h-3.5 w-3.5" /> Duplicate
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => void handleTemplateDelete(template)}>
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </SectionShell>
  );

  const renderFavorites = () => (
    <SectionShell
      title="Medication Favorites"
      description="Saved favorites keep the full prescribing setup from your medication flow."
      onBack={() => setActiveSection(SETTINGS_SECTION_OVERVIEW)}
      actions={
        <Button onClick={() => setFavoriteModalOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Add Favorite Medicine
        </Button>
      }
    >
      <Card className="border-0 shadow-sm">
        <CardContent className="p-5">
          {libraryLoading ? (
            <p className="text-sm text-muted-foreground">Loading medication favorites...</p>
          ) : medicationFavorites.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No medication favorites saved yet. Save them while prescribing to build your quick list.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {medicationFavorites.map(item => (
                <div key={item.favorite.id} className="rounded-lg border border-border/70 bg-muted/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm text-foreground">{item.favorite.medicine.brandName}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.favorite.medicine.genericName || 'Generic not listed'} • {item.favorite.medicine.dosageForm || 'Form not listed'} • {item.favorite.medicine.strengthText || 'Strength not listed'}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {String(item.preference?.payload?.frequency ?? 'No saved frequency')} • {String(item.preference?.payload?.instructions ?? 'No saved instructions')}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs text-destructive hover:text-destructive"
                      onClick={() => void handleRemoveMedicationFavorite(item.favorite.registrationNo)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </SectionShell>
  );

  const renderClinics = () => (
    <SectionShell
      title="Clinic Management"
      description="Manage your active practice locations from the same focused Settings workspace."
      onBack={() => setActiveSection(SETTINGS_SECTION_OVERVIEW)}
    >
      <Card className="border-0 shadow-sm">
        <CardContent className="p-5">
          <ClinicsPage embedded />
        </CardContent>
      </Card>
    </SectionShell>
  );

  const renderLibraryColumn = (
    title: string,
    description: string,
    emptyText: string,
    loadingText: string,
    icon: React.ReactNode,
    onAdd: () => void,
    body: React.ReactNode,
  ) => (
    <div className="rounded-lg border border-border/70 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-medium text-foreground flex items-center gap-2">{icon} {title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </div>
      {libraryLoading ? <p className="text-sm text-muted-foreground">{loadingText}</p> : body || <p className="text-sm text-muted-foreground">{emptyText}</p>}
    </div>
  );

  const renderLibrary = () => (
    <SectionShell
      title="Clinical Library"
      description="Manage doctor-owned conditions, diagnosis sets, investigation sets, and reusable advice templates."
      onBack={() => setActiveSection(SETTINGS_SECTION_OVERVIEW)}
    >
      <Card className="border-0 shadow-sm">
        <CardContent className="p-5">
          <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-4">
            {renderLibraryColumn(
              'Condition Library',
              'Shared doctor-owned conditions for diagnosis and past medical history.',
              'No reusable conditions saved yet.',
              'Loading condition library...',
              <NotebookTabs className="h-4 w-4 text-primary" />,
              () => {
                setEditingCondition(null);
                setConditionDialogOpen(true);
              },
              conditionLibrary.length > 0 ? (
                <div className="space-y-3">
                  {conditionLibrary.map(item => (
                    <div key={item.id} className="rounded-lg bg-muted/30 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-sm text-foreground">{item.name}</p>
                        {item.code ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">{item.code}</span> : null}
                      </div>
                      <p className="text-xs text-muted-foreground">{item.aliases.join(', ') || 'No aliases saved'}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setEditingCondition(item); setConditionDialogOpen(true); }}>Edit</Button>
                        <Button variant="outline" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => void handleDeleteCondition(item)}>Delete</Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null,
            )}

            {renderLibraryColumn(
              'Diagnosis Sets',
              'Reusable diagnosis bundles for common visits.',
              'No diagnosis sets saved yet.',
              'Loading diagnosis sets...',
              <LayoutTemplate className="h-4 w-4 text-primary" />,
              () => openLibraryDialog('diagnosis'),
              diagnosisSets.length > 0 ? (
                <div className="space-y-3">
                  {diagnosisSets.map(item => (
                    <div key={item.id} className="rounded-lg bg-muted/30 p-3">
                      <p className="font-medium text-sm text-foreground">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.diagnoses.map(entry => entry.name).join(', ') || 'No diagnoses saved'}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => openLibraryDialog('diagnosis', item)}>Edit</Button>
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void handleDuplicateDiagnosisSet(item)}>Duplicate</Button>
                        <Button variant="outline" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => void handleDeleteDiagnosisSet(item)}>Delete</Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null,
            )}

            {renderLibraryColumn(
              'Investigation Sets',
              'Reusable workups for common OPD scenarios.',
              'No investigation sets saved yet.',
              'Loading investigation sets...',
              <FlaskConical className="h-4 w-4 text-warning" />,
              () => openLibraryDialog('investigation'),
              investigationSets.length > 0 ? (
                <div className="space-y-3">
                  {investigationSets.map(item => (
                    <div key={item.id} className="rounded-lg bg-muted/30 p-3">
                      <p className="font-medium text-sm text-foreground">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.labOrders.map(entry => entry.testName).join(', ') || 'No investigations saved'}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => openLibraryDialog('investigation', item)}>Edit</Button>
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void handleDuplicateInvestigationSet(item)}>Duplicate</Button>
                        <Button variant="outline" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => void handleDeleteInvestigationSet(item)}>Delete</Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null,
            )}

            {renderLibraryColumn(
              'Advice Templates',
              'Reusable patient advice and follow-up text.',
              'No advice templates saved yet.',
              'Loading advice templates...',
              <MessageSquareQuote className="h-4 w-4 text-sky-600" />,
              () => openLibraryDialog('advice'),
              adviceTemplates.length > 0 ? (
                <div className="space-y-3">
                  {adviceTemplates.map(item => (
                    <div key={item.id} className="rounded-lg bg-muted/30 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-sm text-foreground">{item.name}</p>
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                          {item.languageMode === 'en' ? 'English' : item.languageMode === 'ur' ? 'Urdu' : 'Bilingual'}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{item.instructions || 'No instructions saved'}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => openLibraryDialog('advice', item)}>Edit</Button>
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void handleDuplicateAdviceTemplate(item)}>Duplicate</Button>
                        <Button variant="outline" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => void handleDeleteAdviceTemplate(item)}>Delete</Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null,
            )}
          </div>
        </CardContent>
      </Card>
    </SectionShell>
  );

  const renderSecurity = () => (
    <SectionShell
      title="Security"
      description="Keep your account secure with the same backend auth flow used across the app."
      onBack={() => setActiveSection(SETTINGS_SECTION_OVERVIEW)}
    >
      <Card className="border-0 shadow-sm">
        <CardContent className="p-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-sm">Current Password</Label>
              <Input type="password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">New Password</Label>
              <Input type="password" value={newPassword} onChange={event => setNewPassword(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Confirm New Password</Label>
              <Input type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} />
            </div>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => void handlePasswordSave()} disabled={isSavingPassword}>
              Update Password
            </Button>
          </div>
        </CardContent>
      </Card>
    </SectionShell>
  );

  return (
    <div className="animate-fade-in p-4 lg:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage one area at a time for a cleaner, more focused workflow.</p>
        </div>

        {activeSection === SETTINGS_SECTION_OVERVIEW && renderOverview()}
        {activeSection === SETTINGS_SECTION_GENERAL && renderGeneral()}
        {activeSection === SETTINGS_SECTION_CLINICS && renderClinics()}
        {activeSection === SETTINGS_SECTION_TEMPLATES && renderTemplates()}
        {activeSection === SETTINGS_SECTION_FAVORITES && renderFavorites()}
        {activeSection === SETTINGS_SECTION_LIBRARY && renderLibrary()}
        {activeSection === SETTINGS_SECTION_SECURITY && renderSecurity()}
      </div>

      <TreatmentTemplateDialog
        open={templateDialogOpen}
        onOpenChange={open => {
          setTemplateDialogOpen(open);
          if (!open) {
            setEditingTemplate(null);
          }
        }}
        template={editingTemplate}
        onSave={handleTemplateSave}
      />
      <ReusableContentDialog
        open={libraryDialogOpen}
        onOpenChange={open => {
          setLibraryDialogOpen(open);
          if (!open) {
            setEditingLibraryItem(null);
          }
        }}
        mode={libraryDialogMode}
        item={editingLibraryItem}
        onSave={handleLibrarySave}
      />
      <ConditionLibraryDialog
        open={conditionDialogOpen}
        onOpenChange={open => {
          setConditionDialogOpen(open);
          if (!open) {
            setEditingCondition(null);
          }
        }}
        item={editingCondition}
        onSave={handleConditionSave}
      />
      <MedicationModal
        open={favoriteModalOpen}
        onOpenChange={setFavoriteModalOpen}
        prescribedMedications={[]}
        onAdd={() => {
          // Favorites mode saves directly through the modal.
        }}
        onRemove={() => {
          // No prescribed list in settings favorites mode.
        }}
        mode="favorites"
        onFavoriteSaved={() => {
          void fetchMedicationLibraryFavorites().then(setMedicationFavorites).catch(() => {
            // Keep the current list if refresh fails.
          });
        }}
      />
    </div>
  );
}
