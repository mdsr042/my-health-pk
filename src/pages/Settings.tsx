import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Settings2, Bell, Globe, Shield, Palette } from 'lucide-react';
import { readStorage, writeStorage } from '@/lib/storage';
import { mergeAppSettings, SETTINGS_STORAGE_KEY, SETTINGS_UPDATED_EVENT } from '@/lib/app-defaults';
import { fetchSettings, persistSettings } from '@/lib/api';
import type { AppSettings } from '@/lib/app-types';

export default function SettingsPage() {
  const saved = mergeAppSettings(readStorage<Partial<AppSettings>>(SETTINGS_STORAGE_KEY, {}));

  const [notifications, setNotifications] = useState(saved.notifications);
  const [soundAlerts, setSoundAlerts] = useState(saved.soundAlerts);
  const [autoSave, setAutoSave] = useState(saved.autoSave);
  const [language, setLanguage] = useState(saved.language);
  const [prescriptionLang, setPrescriptionLang] = useState(saved.prescriptionLang);
  const [theme, setTheme] = useState(saved.theme);
  const [compactMode, setCompactMode] = useState(saved.compactMode);
  const [clinicOverrides] = useState(saved.clinicOverrides);
  const [managedClinics] = useState(saved.managedClinics);

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
        setPrescriptionLang(mergedRemoteSettings.prescriptionLang);
        setTheme(mergedRemoteSettings.theme);
        setCompactMode(mergedRemoteSettings.compactMode);
        writeStorage(SETTINGS_STORAGE_KEY, mergedRemoteSettings);
      } catch {
        // Keep local settings when the API is unavailable.
      }
    };

    void hydrate();

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
      prescriptionLang,
      theme,
      compactMode,
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
      ],
    },
  ];

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
      <Card className="border-0 shadow-sm">
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
            <div className="space-y-1.5">
              <Label className="text-sm">Prescription Language</Label>
              <Select value={prescriptionLang} onValueChange={setPrescriptionLang}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English Only</SelectItem>
                  <SelectItem value="ur">Urdu Only</SelectItem>
                  <SelectItem value="bilingual">Bilingual (English + Urdu)</SelectItem>
                </SelectContent>
              </Select>
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

      {/* Security placeholder */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-5">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-primary" /> Security
          </h2>
          <p className="text-sm text-muted-foreground">Password change, two-factor authentication, and session management will be available after backend integration.</p>
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button onClick={handleSave}>Save Settings</Button>
      </div>
    </div>
  );
}
