import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useData } from '@/contexts/DataContext';
import { Search, FileText, Calendar, User, ChevronDown, ChevronUp } from 'lucide-react';

export default function MedicalRecords() {
  const { patients, getPatientNotes } = useData();
  const [search, setSearch] = useState('');
  const [expandedPatientId, setExpandedPatientId] = useState<string | null>(null);
  const [expandedVisitIds, setExpandedVisitIds] = useState<Record<string, string | null>>({});

  const patientsWithNotes = patients.filter(p => {
    const hasNotes = getPatientNotes(p.id).length > 0;
    if (!search) return hasNotes;
    return hasNotes && (
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.mrn.toLowerCase().includes(search.toLowerCase())
    );
  });

  return (
    <div className="p-4 lg:p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Medical Records</h1>
          <p className="text-sm text-muted-foreground">Search and browse patient clinical records</p>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search by patient name or MRN..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
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
            const isPatientExpanded = expandedPatientId === patient.id;
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
                    <div className="px-4 pb-4 border-t border-border/60">
                      <div className="pt-3 pb-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {patient.name} Visits
                        </p>
                      </div>
                      <div className="space-y-2">
                        {notes.map((note, index) => {
                          const isVisitExpanded = expandedVisitIds[patient.id] === note.id;
                          const visitLabel = index === 0 ? 'Latest Visit' : `Visit ${notes.length - index}`;

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
                                <Calendar className="w-4 h-4 text-primary shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-medium text-foreground">{visitLabel}</p>
                                    <Badge variant="outline" className="text-[10px]">
                                      {note.status}
                                    </Badge>
                                  </div>
                                  <p className="text-sm text-foreground">{note.chiefComplaint}</p>
                                  <p className="text-xs font-medium text-muted-foreground mt-0.5">
                                    {new Date(note.date).toLocaleDateString('en-PK', {
                                      weekday: 'short',
                                      year: 'numeric',
                                      month: 'long',
                                      day: 'numeric',
                                    })}
                                  </p>
                                </div>
                                {isVisitExpanded ? (
                                  <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                                )}
                              </button>

                              {isVisitExpanded && (
                                <div className="px-3 pb-3 pt-0 border-t border-border bg-background/80 space-y-3">
                                  <div className="grid md:grid-cols-2 gap-4 mt-3">
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

                                  <div>
                                    <p className="text-xs font-medium text-muted-foreground mb-1">Vitals</p>
                                    <div className="flex flex-wrap gap-2">
                                      <Badge variant="outline" className="text-[10px]">BP: {note.vitals.bp}</Badge>
                                      <Badge variant="outline" className="text-[10px]">Pulse: {note.vitals.pulse}</Badge>
                                      <Badge variant="outline" className="text-[10px]">Temp: {note.vitals.temp}°F</Badge>
                                      <Badge variant="outline" className="text-[10px]">SpO₂: {note.vitals.spo2}%</Badge>
                                    </div>
                                  </div>

                                  {note.diagnoses.length > 0 && (
                                    <div>
                                      <p className="text-xs font-medium text-muted-foreground mb-1">Diagnoses</p>
                                      <div className="flex flex-wrap gap-1.5">
                                        {note.diagnoses.map(dx => (
                                          <Badge key={dx.id} variant={dx.isPrimary ? 'default' : 'outline'} className="text-[10px]">
                                            {dx.name} ({dx.code})
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {note.medications.length > 0 && (
                                    <div>
                                      <p className="text-xs font-medium text-muted-foreground mb-1">Medications</p>
                                      <div className="space-y-1">
                                        {note.medications.map(med => (
                                          <div key={med.id}>
                                            <p className="text-sm text-foreground">
                                              {med.name} — {med.frequency} × {med.duration}
                                            </p>
                                            {med.frequencyUrdu && <p className="text-xs text-muted-foreground text-right" dir="rtl">{med.frequencyUrdu}</p>}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {note.labOrders.length > 0 && (
                                    <div>
                                      <p className="text-xs font-medium text-muted-foreground mb-1">Lab / Diagnostic Orders</p>
                                      <div className="space-y-1">
                                        {note.labOrders.map(lab => (
                                          <div key={lab.id} className="flex items-center gap-2 text-sm">
                                            <span className="text-foreground">{lab.testName}</span>
                                            <Badge variant="outline" className="text-[10px]">{lab.priority}</Badge>
                                            {lab.result && <span className="text-xs text-muted-foreground">→ {lab.result}</span>}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
