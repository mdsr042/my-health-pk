import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import AppointmentBookingDialog from '@/components/appointments/AppointmentBookingDialog';
import PatientDetailsDialog from '@/components/patients/PatientDetailsDialog';
import { Search, FileText, Calendar, User, ChevronDown, ChevronUp, CalendarPlus, PencilLine } from 'lucide-react';
import type { Patient } from '@/data/mockData';
import { getLocalDateKey } from '@/lib/date';
import { toast } from 'sonner';

function getTomorrowDateKey() {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  return getLocalDateKey(next);
}

function formatVisitDate(date: string) {
  return new Date(date).toLocaleDateString('en-PK', {
    weekday: 'short',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function MedicalRecords() {
  const { patients, getPatientNotes, upsertAppointment, updatePatient, searchPatients } = useData();
  const { activeClinic, doctorClinics, user } = useAuth();
  const [search, setSearch] = useState('');
  const [keyword, setKeyword] = useState('');
  const [clinicFilter, setClinicFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [expandedPatientId, setExpandedPatientId] = useState<string | null>(null);
  const [expandedVisitIds, setExpandedVisitIds] = useState<Record<string, string | null>>({});
  const [bookingPatient, setBookingPatient] = useState<Patient | null>(null);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);

  const handleBookNextAppointment = async (form: {
    id: string;
    patientId: string;
    clinicId: string;
    date: string;
    time: string;
    type: 'new' | 'follow-up';
    status: 'scheduled' | 'waiting' | 'in-consultation' | 'completed' | 'cancelled' | 'no-show';
    chiefComplaint: string;
    tokenNumber: number;
  }) => {
    if (!form.patientId || !form.clinicId || !form.date || !form.time) {
      toast.error('Please complete clinic, date, and time');
      return;
    }

    await upsertAppointment({
      id: '',
      patientId: form.patientId,
      clinicId: form.clinicId,
      doctorId: user?.id || 'doctor',
      date: form.date,
      time: form.time,
      status: form.status,
      type: form.type,
      chiefComplaint: form.chiefComplaint.trim(),
      tokenNumber: 0,
    });

    toast.success('Next appointment booked');
    setBookingPatient(null);
  };

  const patientsWithNotes = useMemo(() => {
    const query = search.trim().toLowerCase();
    const keywordQuery = keyword.trim().toLowerCase();
    const now = new Date();
    const rangeStart = dateFilter === '30d'
      ? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      : dateFilter === '90d'
        ? new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
        : dateFilter === '1y'
          ? new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
          : null;

    return patients.filter(patient => {
      const notes = getPatientNotes(patient.id);
      if (notes.length === 0) return false;

      const patientMatches = !query || [
        patient.name,
        patient.mrn,
        patient.phone,
        patient.cnic,
      ].some(value => value.toLowerCase().includes(query));

      const filteredNotes = notes.filter(note => {
        const clinicMatches = clinicFilter === 'all' || note.clinicId === clinicFilter;
        const dateMatches = !rangeStart || new Date(note.date) >= rangeStart;
        const noteSearchBlob = [
          note.chiefComplaint,
          note.assessment,
          note.plan,
          note.followUp,
          ...note.diagnoses.map(dx => dx.name),
          ...note.medications.map(med => med.name),
          ...note.careActions.map(action => action.title),
        ].join(' ').toLowerCase();
        const keywordMatches = !keywordQuery || noteSearchBlob.includes(keywordQuery);
        return clinicMatches && dateMatches && keywordMatches;
      });

      return patientMatches && filteredNotes.length > 0;
    });
  }, [clinicFilter, dateFilter, getPatientNotes, keyword, patients, search]);

  const handleSavePatient = async (patient: Patient) => {
    await updatePatient(patient);
    toast.success('Patient details updated');
    setEditingPatient(null);
  };

  const handleOpenLatestVisit = (patientId: string, noteId: string | null) => {
    if (!noteId) return;
    setExpandedPatientId(patientId);
    setExpandedVisitIds(prev => ({ ...prev, [patientId]: noteId }));
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Medical Records</h1>
          <p className="text-sm text-muted-foreground">Search and browse patient clinical records</p>
        </div>
      </div>

      <div className="grid items-end gap-3 lg:grid-cols-[minmax(0,1.2fr)_220px_180px_minmax(0,1fr)]">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Patient Search</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, MRN, phone, or CNIC..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Clinic</Label>
          <Select value={clinicFilter} onValueChange={setClinicFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clinics</SelectItem>
              {doctorClinics.map(clinic => (
                <SelectItem key={clinic.id} value={clinic.id}>{clinic.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Date Range</Label>
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All time</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="1y">Last 1 year</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Diagnosis / Medication Keyword</Label>
          <Input
            placeholder="e.g. diabetes, amlodipine"
            value={keyword}
            onChange={event => setKeyword(event.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4">
        {patientsWithNotes.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-12 text-center">
              <FileText className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No records found</p>
            </CardContent>
          </Card>
        ) : (
          patientsWithNotes.map(patient => {
            const notes = getPatientNotes(patient.id);
            const filteredNotes = notes.filter(note => {
              const clinicMatches = clinicFilter === 'all' || note.clinicId === clinicFilter;
              const noteSearchBlob = [
                note.chiefComplaint,
                note.assessment,
                note.plan,
                note.followUp,
                ...note.diagnoses.map(dx => dx.name),
                ...note.medications.map(med => med.name),
                ...note.careActions.map(action => action.title),
              ].join(' ').toLowerCase();
              const keywordMatches = !keyword.trim() || noteSearchBlob.includes(keyword.trim().toLowerCase());
              const now = new Date();
              const rangeStart = dateFilter === '30d'
                ? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
                : dateFilter === '90d'
                  ? new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
                  : dateFilter === '1y'
                    ? new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
                    : null;
              const dateMatches = !rangeStart || new Date(note.date) >= rangeStart;
              return clinicMatches && keywordMatches && dateMatches;
            });
            const isPatientExpanded = expandedPatientId === patient.id;
            const latestNote = filteredNotes[0] ?? notes[0] ?? null;
            const olderNotes = latestNote ? filteredNotes.filter(note => note.id !== latestNote.id) : filteredNotes;
            const latestVisitExpanded = latestNote ? expandedVisitIds[patient.id] === latestNote.id : false;
            return (
              <Card key={patient.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-0">
                  <button
                    type="button"
                    className="w-full p-4 text-left"
                    onClick={() => setExpandedPatientId(prev => prev === patient.id ? null : patient.id)}
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <User className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-3 mb-1">
                          <h3 className="font-semibold text-foreground">{patient.name}</h3>
                          <Badge variant="outline" className="text-[10px]">{patient.mrn}</Badge>
                          <span className="text-xs text-muted-foreground">{patient.age}y / {patient.gender}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {notes.length} visit{notes.length !== 1 ? 's' : ''} on record
                        </p>
                      </div>
                      {isPatientExpanded ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                      )}
                    </div>
                  </button>

                  {isPatientExpanded && (
                    <div className="border-t border-border/60 px-4 pb-4 pt-4">
                      <div className="space-y-4">
                        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_320px]">
                          <div className="rounded-xl border border-border bg-background/90 p-4 space-y-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Patient Summary</p>
                                <p className="text-sm text-muted-foreground mt-0.5">Profile details and continuity actions</p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setEditingPatient(patient)}>
                                  <PencilLine className="w-3.5 h-3.5" /> Edit Patient
                                </Button>
                                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setBookingPatient(patient)}>
                                  <CalendarPlus className="w-3.5 h-3.5" /> Book Next Appointment
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 gap-1.5 text-xs"
                                  onClick={() => handleOpenLatestVisit(patient.id, latestNote?.id ?? null)}
                                  disabled={!latestNote}
                                >
                                  <FileText className="w-3.5 h-3.5" /> Open Latest Visit
                                </Button>
                              </div>
                            </div>

                            <div className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3 md:grid-cols-2 lg:grid-cols-4">
                              {[
                                { label: 'MRN', value: patient.mrn || '-' },
                                { label: 'Age / Gender', value: `${patient.age}y / ${patient.gender}` },
                                { label: 'Phone', value: patient.phone || '-' },
                                { label: 'CNIC', value: patient.cnic || '-' },
                                { label: 'Blood Group', value: patient.bloodGroup || '-' },
                                { label: 'Emergency Contact', value: patient.emergencyContact || '-' },
                                { label: 'Address', value: patient.address || '-', span: 'lg:col-span-2' },
                              ].map(field => (
                                <div key={field.label} className={field.span || ''}>
                                  <p className="text-[11px] font-medium text-muted-foreground">{field.label}</p>
                                  <p className="text-sm text-foreground">{field.value}</p>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="rounded-xl border border-border bg-muted/20 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Record Snapshot</p>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                              <div className="rounded-lg border border-border/60 bg-background/80 p-3">
                                <p className="text-[11px] font-medium text-muted-foreground">Visits On Record</p>
                                <p className="text-xl font-semibold text-foreground">{notes.length}</p>
                                <p className="text-xs text-muted-foreground">{filteredNotes.length} matching current filters</p>
                              </div>
                              <div className="rounded-lg border border-border/60 bg-background/80 p-3">
                                <p className="text-[11px] font-medium text-muted-foreground">Latest Visit</p>
                                <p className="text-sm font-medium text-foreground">{latestNote ? formatVisitDate(latestNote.date) : '-'}</p>
                                <p className="text-xs text-muted-foreground">{latestNote?.status || 'No visit status'}</p>
                              </div>
                              <div className="rounded-lg border border-border/60 bg-background/80 p-3">
                                <p className="text-[11px] font-medium text-muted-foreground">Primary Diagnosis</p>
                                <p className="text-sm text-foreground">
                                  {latestNote?.diagnoses.find(dx => dx.isPrimary)?.name || latestNote?.diagnoses[0]?.name || '-'}
                                </p>
                              </div>
                              <div className="rounded-lg border border-border/60 bg-background/80 p-3">
                                <p className="text-[11px] font-medium text-muted-foreground">Last Medication</p>
                                <p className="text-sm text-foreground">{latestNote?.medications[0]?.name || '-'}</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {latestNote && (
                          <div className="rounded-xl border border-border bg-background/90 p-4 space-y-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Latest Visit</p>
                                <p className="text-base font-semibold text-foreground">{formatVisitDate(latestNote.date)}</p>
                                <p className="text-sm text-muted-foreground">{latestNote.chiefComplaint || 'No chief complaint recorded'}</p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className="text-[10px]">{latestNote.status}</Badge>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs"
                                  onClick={() => setExpandedVisitIds(prev => ({
                                    ...prev,
                                    [patient.id]: prev[patient.id] === latestNote.id ? null : latestNote.id,
                                  }))}
                                >
                                  {latestVisitExpanded ? 'Hide Details' : 'View Details'}
                                </Button>
                              </div>
                            </div>

                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                              <div className="rounded-lg bg-muted/40 p-3">
                                <p className="text-[11px] font-medium text-muted-foreground">Primary Diagnosis</p>
                                <p className="text-sm text-foreground">
                                  {latestNote.diagnoses.find(dx => dx.isPrimary)?.name || latestNote.diagnoses[0]?.name || '-'}
                                </p>
                              </div>
                              <div className="rounded-lg bg-muted/40 p-3">
                                <p className="text-[11px] font-medium text-muted-foreground">Medications</p>
                                <p className="text-sm text-foreground">
                                  {latestNote.medications.slice(0, 2).map(med => med.name).join(', ') || '-'}
                                </p>
                              </div>
                              <div className="rounded-lg bg-muted/40 p-3">
                                <p className="text-[11px] font-medium text-muted-foreground">Investigations</p>
                                <p className="text-sm text-foreground">
                                  {latestNote.labOrders.slice(0, 2).map(lab => lab.testName).join(', ') || '-'}
                                </p>
                              </div>
                              <div className="rounded-lg bg-muted/40 p-3">
                                <p className="text-[11px] font-medium text-muted-foreground">Follow-up Advice</p>
                                <p className="text-sm text-foreground">{latestNote.followUp || '-'}</p>
                              </div>
                            </div>

                            {latestVisitExpanded && (
                              <div className="grid gap-3 border-t border-border/70 pt-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                                <div className="space-y-3">
                                  <div className="rounded-lg border border-border/60 p-3 space-y-3">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Overview</p>
                                    {[
                                      { label: 'HPI', value: latestNote.hpi },
                                      { label: 'Past History', value: latestNote.pastHistory },
                                      { label: 'Allergies', value: latestNote.allergies },
                                      { label: 'Examination', value: latestNote.examination },
                                      { label: 'Assessment', value: latestNote.assessment },
                                      { label: 'Plan', value: latestNote.plan },
                                      { label: 'Instructions', value: latestNote.instructions },
                                      { label: 'Follow-up', value: latestNote.followUp },
                                    ].map(field => (
                                      <div key={field.label}>
                                        <p className="text-xs font-medium text-muted-foreground">{field.label}</p>
                                        <p className="text-sm text-foreground">{field.value || '-'}</p>
                                      </div>
                                    ))}
                                  </div>

                                  <div className="rounded-lg border border-border/60 p-3">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Vitals</p>
                                    <div className="flex flex-wrap gap-2">
                                      <Badge variant="outline" className="text-[10px]">BP: {latestNote.vitals.bp || '-'}</Badge>
                                      <Badge variant="outline" className="text-[10px]">Pulse: {latestNote.vitals.pulse || '-'}</Badge>
                                      <Badge variant="outline" className="text-[10px]">Temp: {latestNote.vitals.temp || '-'}°F</Badge>
                                      <Badge variant="outline" className="text-[10px]">SpO₂: {latestNote.vitals.spo2 || '-'}%</Badge>
                                      <Badge variant="outline" className="text-[10px]">Weight: {latestNote.vitals.weight || '-'} kg</Badge>
                                      <Badge variant="outline" className="text-[10px]">Height: {latestNote.vitals.height || '-'} cm</Badge>
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-3">
                                  <div className="rounded-lg border border-border/60 p-3">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Diagnoses</p>
                                    {latestNote.diagnoses.length > 0 ? (
                                      <div className="flex flex-wrap gap-1.5">
                                        {latestNote.diagnoses.map(dx => (
                                          <Badge key={dx.id} variant={dx.isPrimary ? 'default' : 'outline'} className="text-[10px]">
                                            {dx.name} ({dx.code})
                                          </Badge>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-sm text-muted-foreground">No diagnoses recorded.</p>
                                    )}
                                  </div>

                                  <div className="rounded-lg border border-border/60 p-3">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Medications</p>
                                    {latestNote.medications.length > 0 ? (
                                      <div className="space-y-2">
                                        {latestNote.medications.map(med => (
                                          <div key={med.id} className="rounded-md bg-muted/30 p-2">
                                            <p className="text-sm font-medium text-foreground">{med.name}</p>
                                            <p className="text-xs text-muted-foreground">
                                              {[med.strength, med.form, med.route].filter(Boolean).join(' • ') || 'Details not set'}
                                            </p>
                                            <p className="text-sm text-foreground">
                                              {med.frequency || med.frequencyUrdu || 'Frequency not set'}
                                              {med.duration ? ` • ${med.duration}` : ''}
                                            </p>
                                            {med.instructions && <p className="text-xs text-muted-foreground">{med.instructions}</p>}
                                            {med.frequencyUrdu && <p className="text-xs text-muted-foreground text-right" dir="rtl">{med.frequencyUrdu}</p>}
                                            {med.instructionsUrdu && <p className="text-xs text-muted-foreground text-right" dir="rtl">{med.instructionsUrdu}</p>}
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-sm text-muted-foreground">No medications recorded.</p>
                                    )}
                                  </div>

                                  <div className="rounded-lg border border-border/60 p-3">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Investigations</p>
                                    {latestNote.labOrders.length > 0 ? (
                                      <div className="space-y-2">
                                        {latestNote.labOrders.map(lab => (
                                          <div key={lab.id} className="flex flex-wrap items-center gap-2 rounded-md bg-muted/30 p-2 text-sm">
                                            <span className="font-medium text-foreground">{lab.testName}</span>
                                            <Badge variant="outline" className="text-[10px]">{lab.category}</Badge>
                                            <Badge variant="outline" className="text-[10px]">{lab.priority}</Badge>
                                            {lab.result && <span className="text-xs text-muted-foreground">→ {lab.result}</span>}
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-sm text-muted-foreground">No investigations recorded.</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-3 pt-1">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Older Visit History</p>
                          <p className="text-xs text-muted-foreground">
                            {olderNotes.length} older visit{olderNotes.length !== 1 ? 's' : ''}
                          </p>
                        </div>

                        <div className="space-y-2">
                          {olderNotes.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-border bg-muted/10 px-4 py-6 text-sm text-muted-foreground">
                              No older visits match the current filters.
                            </div>
                          ) : (
                            olderNotes.map((note, index) => {
                              const isVisitExpanded = expandedVisitIds[patient.id] === note.id;
                              const visitLabel = `Visit ${olderNotes.length - index}`;
                              const primaryDiagnosis = note.diagnoses.find(dx => dx.isPrimary)?.name || note.diagnoses[0]?.name || 'No diagnosis';
                              const medicationSummary = note.medications.slice(0, 2).map(med => med.name).join(', ') || 'No medicines';

                              return (
                                <div key={note.id} className="rounded-lg border border-border bg-muted/20 overflow-hidden">
                                  <button
                                    type="button"
                                    className="w-full flex items-center gap-3 p-3 text-left"
                                    onClick={() => setExpandedVisitIds(prev => ({
                                      ...prev,
                                      [patient.id]: prev[patient.id] === note.id ? null : note.id,
                                    }))}
                                  >
                                    <Calendar className="w-4 h-4 shrink-0 text-primary" />
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-sm font-medium text-foreground">{visitLabel}</p>
                                        <Badge variant="outline" className="text-[10px]">{note.status}</Badge>
                                      </div>
                                      <p className="text-sm text-foreground">{note.chiefComplaint || 'No chief complaint recorded'}</p>
                                      <p className="mt-0.5 text-xs text-muted-foreground">{primaryDiagnosis} • {medicationSummary}</p>
                                      <p className="mt-0.5 text-xs font-medium text-muted-foreground">{formatVisitDate(note.date)}</p>
                                    </div>
                                    {isVisitExpanded ? (
                                      <ChevronUp className="w-4 h-4 shrink-0 text-muted-foreground" />
                                    ) : (
                                      <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
                                    )}
                                  </button>

                                  {isVisitExpanded && (
                                    <div className="border-t border-border bg-background/80 p-3">
                                      <div className="grid gap-3 lg:grid-cols-2">
                                        <div className="rounded-lg border border-border/60 p-3 space-y-3">
                                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Overview</p>
                                          {[
                                            { label: 'HPI', value: note.hpi },
                                            { label: 'Past History', value: note.pastHistory },
                                            { label: 'Allergies', value: note.allergies },
                                            { label: 'Examination', value: note.examination },
                                            { label: 'Assessment', value: note.assessment },
                                            { label: 'Plan', value: note.plan },
                                            { label: 'Instructions', value: note.instructions },
                                            { label: 'Follow-up', value: note.followUp },
                                          ].map(field => (
                                            <div key={field.label}>
                                              <p className="text-xs font-medium text-muted-foreground">{field.label}</p>
                                              <p className="text-sm text-foreground">{field.value || '-'}</p>
                                            </div>
                                          ))}
                                        </div>

                                        <div className="space-y-3">
                                          <div className="rounded-lg border border-border/60 p-3">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Diagnoses</p>
                                            {note.diagnoses.length > 0 ? (
                                              <div className="flex flex-wrap gap-1.5">
                                                {note.diagnoses.map(dx => (
                                                  <Badge key={dx.id} variant={dx.isPrimary ? 'default' : 'outline'} className="text-[10px]">
                                                    {dx.name} ({dx.code})
                                                  </Badge>
                                                ))}
                                              </div>
                                            ) : (
                                              <p className="text-sm text-muted-foreground">No diagnoses recorded.</p>
                                            )}
                                          </div>

                                          <div className="rounded-lg border border-border/60 p-3">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Medications</p>
                                            {note.medications.length > 0 ? (
                                              <div className="space-y-2">
                                                {note.medications.map(med => (
                                                  <div key={med.id} className="rounded-md bg-muted/30 p-2">
                                                    <p className="text-sm font-medium text-foreground">{med.name}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                      {[med.strength, med.form, med.route].filter(Boolean).join(' • ') || 'Details not set'}
                                                    </p>
                                                    <p className="text-sm text-foreground">
                                                      {med.frequency || med.frequencyUrdu || 'Frequency not set'}
                                                      {med.duration ? ` • ${med.duration}` : ''}
                                                    </p>
                                                  </div>
                                                ))}
                                              </div>
                                            ) : (
                                              <p className="text-sm text-muted-foreground">No medications recorded.</p>
                                            )}
                                          </div>

                                          <div className="rounded-lg border border-border/60 p-3">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Investigations</p>
                                            {note.labOrders.length > 0 ? (
                                              <div className="space-y-2">
                                                {note.labOrders.map(lab => (
                                                  <div key={lab.id} className="flex flex-wrap items-center gap-2 rounded-md bg-muted/30 p-2 text-sm">
                                                    <span className="font-medium text-foreground">{lab.testName}</span>
                                                    <Badge variant="outline" className="text-[10px]">{lab.category}</Badge>
                                                    <Badge variant="outline" className="text-[10px]">{lab.priority}</Badge>
                                                    {lab.result && <span className="text-xs text-muted-foreground">→ {lab.result}</span>}
                                                  </div>
                                                ))}
                                              </div>
                                            ) : (
                                              <p className="text-sm text-muted-foreground">No investigations recorded.</p>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <AppointmentBookingDialog
        open={Boolean(bookingPatient)}
        onOpenChange={open => !open && setBookingPatient(null)}
        title="Book Next Appointment"
        mode="next"
        patient={bookingPatient}
        patients={patients}
        searchPatients={searchPatients}
        clinics={doctorClinics}
        defaultClinicId={activeClinic?.id}
        defaultDate={getTomorrowDateKey()}
        defaultType="follow-up"
        onSubmit={handleBookNextAppointment}
      />
      <PatientDetailsDialog
        open={Boolean(editingPatient)}
        patient={editingPatient}
        onOpenChange={open => !open && setEditingPatient(null)}
        onSave={handleSavePatient}
      />
    </div>
  );
}
