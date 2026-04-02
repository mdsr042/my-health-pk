import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import {
  patients as initialPatients,
  appointments as initialAppointments,
  type Patient,
  type Appointment,
} from '@/data/mockData';

interface DataContextType {
  patients: Patient[];
  appointments: Appointment[];
  getPatient: (id: string) => Patient | undefined;
  getAppointmentsForClinic: (clinicId: string) => Appointment[];
  addPatient: (patient: Patient) => void;
  addAppointment: (appointment: Appointment) => void;
  updateAppointmentStatus: (appointmentId: string, status: Appointment['status']) => void;
  addWalkIn: (data: {
    name: string; phone: string; age: string; gender: string;
    cnic: string; address: string; bloodGroup: string;
    emergencyContact: string; chiefComplaint: string;
  }, clinicId: string) => string;
}

const DataContext = createContext<DataContextType | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [patients, setPatients] = useState<Patient[]>([...initialPatients]);
  const [appointments, setAppointments] = useState<Appointment[]>([...initialAppointments]);

  const getPatient = useCallback((id: string) => patients.find(p => p.id === id), [patients]);

  const getAppointmentsForClinic = useCallback(
    (clinicId: string) => appointments.filter(a => a.clinicId === clinicId),
    [appointments]
  );

  const addPatient = useCallback((patient: Patient) => {
    setPatients(prev => [...prev, patient]);
  }, []);

  const addAppointment = useCallback((appointment: Appointment) => {
    setAppointments(prev => [...prev, appointment]);
  }, []);

  const updateAppointmentStatus = useCallback((appointmentId: string, status: Appointment['status']) => {
    setAppointments(prev =>
      prev.map(a => a.id === appointmentId ? { ...a, status } : a)
    );
  }, []);

  const addWalkIn = useCallback((data: {
    name: string; phone: string; age: string; gender: string;
    cnic: string; address: string; bloodGroup: string;
    emergencyContact: string; chiefComplaint: string;
  }, clinicId: string): string => {
    const patientId = `p-walkin-${Date.now()}`;
    const mrn = `MRN-${Date.now().toString().slice(-8)}`;
    const today = new Date().toISOString().split('T')[0];

    const newPatient: Patient = {
      id: patientId,
      mrn,
      name: data.name,
      phone: data.phone,
      age: parseInt(data.age) || 0,
      gender: data.gender as 'Male' | 'Female',
      cnic: data.cnic || '',
      address: data.address || '',
      bloodGroup: data.bloodGroup || '',
      emergencyContact: data.emergencyContact || '',
    };

    setPatients(prev => {
      const clinicApts = appointments.filter(a => a.clinicId === clinicId);
      return [...prev, newPatient];
    });

    setAppointments(prev => {
      const clinicApts = prev.filter(a => a.clinicId === clinicId);
      const nextToken = clinicApts.length > 0 ? Math.max(...clinicApts.map(a => a.tokenNumber)) + 1 : 1;
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

      const newAppointment: Appointment = {
        id: `apt-walkin-${Date.now()}`,
        patientId,
        clinicId,
        doctorId: 'doc-1',
        date: today,
        time: timeStr,
        status: 'waiting',
        type: 'new',
        chiefComplaint: data.chiefComplaint || 'Walk-in',
        tokenNumber: nextToken,
      };
      return [...prev, newAppointment];
    });

    return patientId;
  }, [appointments]);

  return (
    <DataContext.Provider value={{
      patients, appointments, getPatient, getAppointmentsForClinic,
      addPatient, addAppointment, updateAppointmentStatus, addWalkIn,
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
