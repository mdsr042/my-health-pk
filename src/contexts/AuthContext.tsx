import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { doctor, clinics, type Clinic } from '@/data/mockData';

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    doctor: null,
    activeClinic: null,
    clinicSelected: false,
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
