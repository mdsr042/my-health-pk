import type { AppSettings } from '@/lib/app-types';

export const SETTINGS_STORAGE_KEY = 'my-health/settings';
export const SETTINGS_UPDATED_EVENT = 'my-health:settings-updated';

export const defaultSettings: AppSettings = {
  notifications: true,
  soundAlerts: true,
  autoSave: true,
  language: 'en',
  prescriptionLang: 'bilingual',
  theme: 'light',
  compactMode: false,
  clinicOverrides: {},
  managedClinics: [],
};

export function mergeAppSettings(settings?: Partial<AppSettings> | null): AppSettings {
  return {
    ...defaultSettings,
    ...(settings ?? {}),
    clinicOverrides: {
      ...defaultSettings.clinicOverrides,
      ...(settings?.clinicOverrides ?? {}),
    },
    managedClinics: settings?.managedClinics ?? defaultSettings.managedClinics,
  };
}
