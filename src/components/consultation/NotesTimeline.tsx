import { type ClinicalNote } from '@/data/mockData';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

interface NotesTimelineProps {
  notes: ClinicalNote[];
}

export default function NotesTimeline({ notes }: NotesTimelineProps) {
  const [expanded, setExpanded] = useState<string | null>(notes[0]?.id || null);

  if (notes.length === 0) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <FileText className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
        <p className="font-medium">No Previous Visits</p>
        <p className="text-sm">This patient has no previous consultation records</p>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-3">
      <h3 className="font-semibold text-foreground">Previous Visits ({notes.length})</h3>
      {notes.map(note => {
        const isExpanded = expanded === note.id;
        return (
          <Card key={note.id} className="border-0 shadow-sm">
            <button
              className="w-full px-4 py-3 flex items-center gap-3 text-left"
              onClick={() => setExpanded(isExpanded ? null : note.id)}
            >
              <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground text-sm">{note.chiefComplaint}</p>
                <p className="text-xs text-muted-foreground">{new Date(note.date).toLocaleDateString('en-PK', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
              </div>
              <Badge variant="outline" className="text-[10px]">{note.status}</Badge>
              {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
            {isExpanded && (
              <CardContent className="px-4 pb-4 pt-0 space-y-3 border-t border-border mt-1">
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
                  ].map(f => (
                    <div key={f.label}>
                      <p className="text-xs font-medium text-muted-foreground">{f.label}</p>
                      <p className="text-sm text-foreground">{f.value || '-'}</p>
                    </div>
                  ))}
                </div>

                {/* Vitals */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Vitals</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="text-[10px]">BP: {note.vitals.bp}</Badge>
                    <Badge variant="outline" className="text-[10px]">Pulse: {note.vitals.pulse}</Badge>
                    <Badge variant="outline" className="text-[10px]">Temp: {note.vitals.temp}°F</Badge>
                    <Badge variant="outline" className="text-[10px]">SpO₂: {note.vitals.spo2}%</Badge>
                  </div>
                </div>

                {/* Diagnoses */}
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

                {/* Medications */}
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

                {/* Lab Orders */}
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

                {note.procedures.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Procedures</p>
                    <div className="space-y-1">
                      {note.procedures.map(procedure => (
                        <div key={procedure.id} className="flex items-center gap-2 text-sm">
                          <span className="text-foreground">{procedure.name}</span>
                          <Badge variant="outline" className="text-[10px]">{procedure.category}</Badge>
                          {procedure.notes && <span className="text-xs text-muted-foreground">• {procedure.notes}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {note.careActions.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Care Actions</p>
                    <div className="space-y-1">
                      {note.careActions.map(action => (
                        <div key={action.id} className="flex items-center gap-2 text-sm">
                          <span className="text-foreground">{action.title}</span>
                          <Badge variant="outline" className="text-[10px]">{action.type}</Badge>
                          {action.notes && <span className="text-xs text-muted-foreground">• {action.notes}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
