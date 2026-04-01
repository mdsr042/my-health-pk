import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Settings2, Bell, Printer, Globe, Shield, Palette } from 'lucide-react';

export default function SettingsPage() {
  const [notifications, setNotifications] = useState(true);
  const [soundAlerts, setSoundAlerts] = useState(true);
  const [autoSave, setAutoSave] = useState(true);
  const [language, setLanguage] = useState('en');
  const [prescriptionLang, setPrescriptionLang] = useState('bilingual');
  const [theme, setTheme] = useState('light');
  const [compactMode, setCompactMode] = useState(false);

  const handleSave = () => toast.success('Settings saved successfully');

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
