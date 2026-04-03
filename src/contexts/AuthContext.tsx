import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { doctor, clinics, type Clinic } from '@/data/mockData';
import { readStorage, writeStorage } from '@/lib/storage';
import { defaultSettings, mergeAppSettings, SETTINGS_STORAGE_KEY, SETTINGS_UPDATED_EVENT } from '@/lib/app-defaults';
import type { AppSettings } from '@/lib/app-types';

interface AuthState {
  isAuthenticated: boolean;
  doctor: typeof doctor | null;
  activeClinic: Clinic | null;
  clinicSelected: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => boolean;
  logout: () => void;
  selectClinic: (clinicId: string) => void;
  switchClinic: (clinicId: string) => void;
  doctorClinics: Clinic[];
}

const AuthContext = createContext<AuthContextType | null>(null);
const AUTH_STORAGE_KEY = 'my-health/auth-state';

function resolveClinics(settings: AppSettings) {
  const baseClinics = clinics.map(clinic => {
    const override = settings.clinicOverrides?.[clinic.id];
    if (!override) return clinic;

    return {
      ...clinic,
      name: override.name || clinic.name,
      location: override.location || clinic.location,
      city: override.city || clinic.city,
      phone: override.phone || clinic.phone,
      timings: override.timings || clinic.timings,
      specialties: override.specialties?.length ? override.specialties : clinic.specialties,
      logo: override.logo || clinic.logo,
    };
  });

  return [...baseClinics, ...(settings.managedClinics ?? [])];
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() =>
    mergeAppSettings(readStorage<Partial<AppSettings>>(SETTINGS_STORAGE_KEY, defaultSettings))
  );
  const resolvedClinics = resolveClinics(settings);
  const [state, setState] = useState<AuthState>(() => {
    const stored = readStorage<AuthState>(AUTH_STORAGE_KEY, {
      isAuthenticated: false,
      doctor: null,
      activeClinic: null,
      clinicSelected: false,
    });

    if (!stored.isAuthenticated) {
      return {
        isAuthenticated: false,
        doctor: null,
        activeClinic: null,
        clinicSelected: false,
      };
    }

    return {
      isAuthenticated: true,
      doctor,
      activeClinic: stored.activeClinic
        ? resolveClinics(mergeAppSettings(readStorage<Partial<AppSettings>>(SETTINGS_STORAGE_KEY, defaultSettings)))
            .find(c => c.id === stored.activeClinic?.id) ?? null
        : null,
      clinicSelected: Boolean(stored.activeClinic),
    };
  });

  const doctorClinics = state.doctor
    ? resolvedClinics.filter(c =>
        state.doctor!.clinicIds.includes(c.id) ||
        settings.managedClinics.some(managedClinic => managedClinic.id === c.id)
      )
    : [];

  const login = useCallback((email: string, _password: string) => {
    if (email === doctor.email || email === 'demo') {
      setState(prev => ({ ...prev, isAuthenticated: true, doctor }));
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    setState({ isAuthenticated: false, doctor: null, activeClinic: null, clinicSelected: false });
  }, []);

  const selectClinic = useCallback((clinicId: string) => {
    const clinic = resolvedClinics.find(c => c.id === clinicId);
    if (clinic) {
      setState(prev => ({ ...prev, activeClinic: clinic, clinicSelected: true }));
    }
  }, [resolvedClinics]);

  const switchClinic = useCallback((clinicId: string) => {
    const clinic = resolvedClinics.find(c => c.id === clinicId);
    if (clinic) {
      setState(prev => ({ ...prev, activeClinic: clinic }));
    }
  }, [resolvedClinics]);

  useEffect(() => {
    const syncSettings = () => {
      setSettings(mergeAppSettings(readStorage<Partial<AppSettings>>(SETTINGS_STORAGE_KEY, defaultSettings)));
    };

    window.addEventListener(SETTINGS_UPDATED_EVENT, syncSettings);
    window.addEventListener('storage', syncSettings);

    return () => {
      window.removeEventListener(SETTINGS_UPDATED_EVENT, syncSettings);
      window.removeEventListener('storage', syncSettings);
    };
  }, []);

  useEffect(() => {
    if (!state.activeClinic) return;

    const updatedActiveClinic = resolvedClinics.find(clinic => clinic.id === state.activeClinic?.id) ?? null;
    if (!updatedActiveClinic) return;

    setState(prev => {
      if (!prev.activeClinic) return prev;

      const didChange =
        prev.activeClinic.name !== updatedActiveClinic.name ||
        prev.activeClinic.location !== updatedActiveClinic.location ||
        prev.activeClinic.city !== updatedActiveClinic.city ||
        prev.activeClinic.phone !== updatedActiveClinic.phone ||
        prev.activeClinic.timings !== updatedActiveClinic.timings ||
        prev.activeClinic.logo !== updatedActiveClinic.logo ||
        prev.activeClinic.specialties.join('|') !== updatedActiveClinic.specialties.join('|');

      return didChange ? { ...prev, activeClinic: updatedActiveClinic } : prev;
    });
  }, [resolvedClinics, state.activeClinic]);

  useEffect(() => {
    writeStorage(AUTH_STORAGE_KEY, state);
  }, [state]);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, selectClinic, switchClinic, doctorClinics }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
