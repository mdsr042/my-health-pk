import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Clinic } from '@/data/mockData';
import {
  clearStoredAuthToken,
  createDemoSession,
  fetchCurrentSession,
  loginWithPassword,
  logoutSession,
  setStoredAuthToken,
  signupDoctor,
} from '@/lib/api';
import type { SessionPayload, SignupPayload } from '@/lib/app-types';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: SessionPayload['user'] | null;
  doctor: SessionPayload['doctor'] | null;
  workspace: SessionPayload['workspace'] | null;
  activeClinic: Clinic | null;
  clinicSelected: boolean;
  doctorClinics: Clinic[];
  login: (email: string, password: string) => Promise<void>;
  openDemo: () => Promise<void>;
  signup: (payload: SignupPayload) => Promise<string>;
  logout: () => Promise<void>;
  selectClinic: (clinicId: string) => void;
  switchClinic: (clinicId: string) => void;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);
const ACTIVE_CLINIC_STORAGE_KEY = 'my-health/active-clinic-id';

function readStoredClinicId() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(ACTIVE_CLINIC_STORAGE_KEY) ?? '';
}

function writeStoredClinicId(clinicId: string) {
  if (typeof window === 'undefined') return;
  if (clinicId) {
    window.localStorage.setItem(ACTIVE_CLINIC_STORAGE_KEY, clinicId);
  } else {
    window.localStorage.removeItem(ACTIVE_CLINIC_STORAGE_KEY);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [activeClinicId, setActiveClinicId] = useState(readStoredClinicId);

  const refreshSession = useCallback(async () => {
    const nextSession = await fetchCurrentSession();
    setSession(nextSession);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      try {
        const nextSession = await fetchCurrentSession();
        if (cancelled) return;
        setSession(nextSession);
      } catch {
        clearStoredAuthToken();
        if (!cancelled) {
          setSession(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, []);

  const doctorClinics = session?.clinics ?? [];

  const activeClinic = useMemo(() => {
    if (!doctorClinics.length) return null;

    const selected = doctorClinics.find(clinic => clinic.id === activeClinicId);
    return selected ?? doctorClinics[0] ?? null;
  }, [activeClinicId, doctorClinics]);

  useEffect(() => {
    if (!activeClinic?.id) {
      writeStoredClinicId('');
      return;
    }

    writeStoredClinicId(activeClinic.id);
  }, [activeClinic]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await loginWithPassword(email, password);
    setStoredAuthToken(result.token);
    setSession(result.session);
    setActiveClinicId(result.session.clinics[0]?.id ?? '');
  }, []);

  const openDemo = useCallback(async () => {
    const result = await createDemoSession();
    setStoredAuthToken(result.token, 'session');
    setSession(result.session);
    setActiveClinicId(result.session.clinics[0]?.id ?? '');
  }, []);

  const signup = useCallback(async (payload: SignupPayload) => {
    const result = await signupDoctor(payload);
    return result.message;
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutSession();
    } catch {
      // Clear local session even if the backend is unavailable.
    }

    clearStoredAuthToken();
    setSession(null);
    setActiveClinicId('');
  }, []);

  const selectClinic = useCallback((clinicId: string) => {
    setActiveClinicId(clinicId);
  }, []);

  const switchClinic = useCallback((clinicId: string) => {
    setActiveClinicId(clinicId);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: Boolean(session?.user),
        isLoading,
        user: session?.user ?? null,
        doctor: session?.doctor ?? null,
        workspace: session?.workspace ?? null,
        activeClinic,
        clinicSelected: Boolean(activeClinic),
        doctorClinics,
        login,
        openDemo,
        signup,
        logout,
        selectClinic,
        switchClinic,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
