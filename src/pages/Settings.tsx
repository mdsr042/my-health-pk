import { useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Settings2, Bell, Globe, Shield, Palette, Plus, PencilLine, Copy, Trash2, LayoutTemplate } from 'lucide-react';
import { readStorage, writeStorage } from '@/lib/storage';
import { mergeAppSettings, SETTINGS_STORAGE_KEY, SETTINGS_TREATMENT_TEMPLATES_HASH, SETTINGS_UPDATED_EVENT } from '@/lib/app-defaults';
import { changePassword, createTreatmentTemplate, deleteTreatmentTemplate, fetchSettings, fetchTreatmentTemplates, importStarterTreatmentTemplates, persistSettings, updateTreatmentTemplate } from '@/lib/api';
import type { AppSettings, TreatmentTemplate, TreatmentTemplatePayload } from '@/lib/app-types';
import TreatmentTemplateDialog from '@/components/settings/TreatmentTemplateDialog';

export default function SettingsPage() {
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
  const templateSectionRef = useRef<HTMLDivElement | null>(null);

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

    const hydrateTemplates = async () => {
      setTemplatesLoading(true);
      try {
        const remoteTemplates = await fetchTreatmentTemplates();
        if (!cancelled) {
          setTemplates(remoteTemplates);
        }
      } catch {
        if (!cancelled) {
          setTemplates([]);
        }
      } finally {
        if (!cancelled) {
          setTemplatesLoading(false);
        }
      }
    };

    void hydrate();
    void hydrateTemplates();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (window.location.hash !== SETTINGS_TREATMENT_TEMPLATES_HASH) return;
    const timer = window.setTimeout(() => {
      templateSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
    return () => window.clearTimeout(timer);
  }, [templatesLoading]);

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

  const sections = [
    {
      title: 'Notifications',
      icon: Bell,
      items: [
        { label: 'Push Notifications', description: 'Get notified for new patients and updates', toggle: true, value: notifications, onChange: setNotifications },
        { label: 'Sound Alerts', description: 'Play sound when new patient arrives in queue', toggle: true, value: soundAlerts, onChange: setSoundAlerts },
      ],
    },
    {
      title: 'Consultation',
      icon: Settings2,
      items: [
        { label: 'Auto-save Drafts', description: 'Automatically save consultation drafts every 30 seconds', toggle: true, value: autoSave, onChange: setAutoSave },
        { label: 'Compact View', description: 'Reduce spacing in consultation form for more content on screen', toggle: true, value: compactMode, onChange: setCompactMode },
        { label: 'Collapsed Sidebar by Default', description: 'Start desktop view in icon-only sidebar mode', toggle: true, value: sidebarCollapsed, onChange: setSidebarCollapsed },
      ],
    },
  ];

  const handleTemplateSave = async (payload: TreatmentTemplatePayload) => {
    try {
      const savedTemplate = editingTemplate
        ? await updateTreatmentTemplate(editingTemplate.id, payload)
        : await createTreatmentTemplate(payload);

      setTemplates(current => editingTemplate
        ? current.map(item => item.id === savedTemplate.id ? savedTemplate : item)
        : [savedTemplate, ...current]
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

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-6 animate-fade-in">
      <h1 className="text-xl font-bold text-foreground">Settings</h1>

      {sections.map(section => {
        const Icon = section.icon;
        return (
          <Card key={section.title} className="border-0 shadow-sm">
            <CardContent className="p-5">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
                <Icon className="w-4 h-4 text-primary" /> {section.title}
              </h2>
              <div className="space-y-4">
                {section.items.map(item => (
                  <div key={item.label} className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">{item.label}</Label>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                    {item.toggle && <Switch checked={item.value} onCheckedChange={item.onChange} />}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Language & Regional */}
      <Card className="border-0 shadow-sm" id="treatment-templates" ref={templateSectionRef}>
        <CardContent className="p-5 space-y-4">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-2">
            <Globe className="w-4 h-4 text-primary" /> Language & Regional
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              Prescription language is now selected while prescribing each medicine, so doctors can choose based on the patient’s understanding and education level.
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-5 space-y-4">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-2">
            <Palette className="w-4 h-4 text-primary" /> Appearance
          </h2>
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

      <Card className="border-0 shadow-sm">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-1">
                <LayoutTemplate className="w-4 h-4 text-primary" /> Treatment Templates
              </h2>
              <p className="text-sm text-muted-foreground">
                Manage your own reusable OPD treatment starter sets. These templates now drive the consultation page instead of hardcoded dummy data.
              </p>
            </div>
            <Button onClick={() => { setEditingTemplate(null); setTemplateDialogOpen(true); }} className="gap-1.5">
              <Plus className="w-4 h-4" /> Add Template
            </Button>
          </div>

          {templatesLoading ? (
            <p className="text-sm text-muted-foreground">Loading treatment templates...</p>
          ) : templates.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground space-y-3">
              <p>No treatment templates saved yet. Create one here or import the starter OPD set.</p>
              <div className="flex justify-center">
                <Button variant="outline" className="gap-1.5" onClick={() => void handleImportStarterTemplates()}>
                  <Copy className="w-4 h-4" /> Import Starter Templates
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {templates.map(template => (
                <div key={template.id} className="rounded-lg border border-border/70 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-foreground">{template.name}</p>
                        {template.conditionLabel && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                            {template.conditionLabel}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{template.chiefComplaint || 'No chief complaint saved'}</p>
                      <p className="text-xs text-muted-foreground">
                        {template.diagnoses.length} diagnoses • {template.medications.length} medicines • {template.labOrders.length} investigations
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setEditingTemplate(template); setTemplateDialogOpen(true); }}>
                        <PencilLine className="w-3.5 h-3.5" /> Edit
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void handleTemplateDuplicate(template)}>
                        <Copy className="w-3.5 h-3.5" /> Duplicate
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => void handleTemplateDelete(template)}>
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-5 space-y-4">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-primary" /> Security
          </h2>
          <p className="text-sm text-muted-foreground">
            Keep your account secure by updating your password here. Session controls now use the same backend auth flow as the rest of the app.
          </p>
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
      <div className="flex justify-end">
        <Button onClick={handleSave}>Save Settings</Button>
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
    </div>
  );
}
