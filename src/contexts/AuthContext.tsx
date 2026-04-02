import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { doctor, clinics, type Clinic } from '@/data/mockData';
import { readStorage, writeStorage } from '@/lib/storage';

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

export function AuthProvider({ children }: { children: ReactNode }) {
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
      activeClinic: stored.activeClinic ? clinics.find(c => c.id === stored.activeClinic?.id) ?? null : null,
      clinicSelected: Boolean(stored.activeClinic),
    };
  });

  const doctorClinics = state.doctor
    ? clinics.filter(c => state.doctor!.clinicIds.includes(c.id))
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
    const clinic = clinics.find(c => c.id === clinicId);
    if (clinic) {
      setState(prev => ({ ...prev, activeClinic: clinic, clinicSelected: true }));
    }
  }, []);

  const switchClinic = useCallback((clinicId: string) => {
    const clinic = clinics.find(c => c.id === clinicId);
    if (clinic) {
      setState(prev => ({ ...prev, activeClinic: clinic }));
    }
  }, []);

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
