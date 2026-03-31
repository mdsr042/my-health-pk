import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface PatientTab {
  patientId: string;
  patientName: string;
  mrn: string;
  hasUnsavedChanges: boolean;
  activeSection: string;
}

interface TabsContextType {
  tabs: PatientTab[];
  activeTabId: string | null;
  openTab: (patientId: string, patientName: string, mrn: string) => void;
  closeTab: (patientId: string) => void;
  setActiveTab: (patientId: string) => void;
  markUnsaved: (patientId: string, unsaved: boolean) => void;
  setTabSection: (patientId: string, section: string) => void;
}

const PatientTabsContext = createContext<TabsContextType | null>(null);

export function PatientTabsProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<PatientTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const openTab = useCallback((patientId: string, patientName: string, mrn: string) => {
    setTabs(prev => {
      if (prev.find(t => t.patientId === patientId)) return prev;
      return [...prev, { patientId, patientName, mrn, hasUnsavedChanges: false, activeSection: 'consultation' }];
    });
    setActiveTabId(patientId);
  }, []);

  const closeTab = useCallback((patientId: string) => {
    setTabs(prev => {
      const newTabs = prev.filter(t => t.patientId !== patientId);
      return newTabs;
    });
    setActiveTabId(prev => {
      if (prev === patientId) {
        const remaining = tabs.filter(t => t.patientId !== patientId);
        return remaining.length > 0 ? remaining[remaining.length - 1].patientId : null;
      }
      return prev;
    });
  }, [tabs]);

  const setActiveTab = useCallback((patientId: string) => {
    setActiveTabId(patientId);
  }, []);

  const markUnsaved = useCallback((patientId: string, unsaved: boolean) => {
    setTabs(prev => prev.map(t => t.patientId === patientId ? { ...t, hasUnsavedChanges: unsaved } : t));
  }, []);

  const setTabSection = useCallback((patientId: string, section: string) => {
    setTabs(prev => prev.map(t => t.patientId === patientId ? { ...t, activeSection: section } : t));
  }, []);

  return (
    <PatientTabsContext.Provider value={{ tabs, activeTabId, openTab, closeTab, setActiveTab, markUnsaved, setTabSection }}>
      {children}
    </PatientTabsContext.Provider>
  );
}

export function usePatientTabs() {
  const ctx = useContext(PatientTabsContext);
  if (!ctx) throw new Error('usePatientTabs must be used within PatientTabsProvider');
  return ctx;
}
