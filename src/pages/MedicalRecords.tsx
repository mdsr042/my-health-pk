import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useData } from '@/contexts/DataContext';
import { Search, FileText, Calendar, User, ChevronRight } from 'lucide-react';

export default function MedicalRecords() {
  const { patients, getPatientNotes } = useData();
  const [search, setSearch] = useState('');

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
            return (
              <Card key={patient.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-semibold text-foreground">{patient.name}</h3>
                        <Badge variant="outline" className="text-[10px]">{patient.mrn}</Badge>
                        <span className="text-xs text-muted-foreground">{patient.age}y / {patient.gender}</span>
                      </div>
                      <div className="space-y-2 mt-3">
                        {notes.map(note => (
                          <div key={note.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/50 hover:bg-muted/80 transition-colors cursor-pointer group">
                            <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-foreground">{note.chiefComplaint}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(note.date).toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' })}
                                {' • '}{note.diagnoses.length} diagnosis{note.diagnoses.length !== 1 ? 'es' : ''}
                                {' • '}{note.medications.length} medication{note.medications.length !== 1 ? 's' : ''}
                              </p>
                            </div>
                            <Badge variant="outline" className={`text-[10px] ${note.status === 'completed' ? 'bg-success/10 text-success border-success/20' : 'bg-warning/10 text-warning border-warning/20'}`}>
                              {note.status}
                            </Badge>
                            <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
