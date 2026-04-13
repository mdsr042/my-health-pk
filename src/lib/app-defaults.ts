import type { AppSettings } from '@/lib/app-types';

export const SETTINGS_STORAGE_KEY = 'my-health/settings';
export const SETTINGS_UPDATED_EVENT = 'my-health:settings-updated';
export const APP_NAVIGATE_EVENT = 'my-health:navigate';
export const SETTINGS_SECTION_OVERVIEW = 'overview';
export const SETTINGS_SECTION_GENERAL = 'general';
export const SETTINGS_SECTION_TEMPLATES = 'templates';
export const SETTINGS_SECTION_FAVORITES = 'favorites';
export const SETTINGS_SECTION_LIBRARY = 'library';
export const SETTINGS_SECTION_SECURITY = 'security';

export const defaultSettings: AppSettings = {
  notifications: true,
  soundAlerts: true,
  autoSave: true,
  language: 'en',
  prescriptionLang: 'bilingual',
  theme: 'light',
  compactMode: false,
  sidebarCollapsed: true,
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
