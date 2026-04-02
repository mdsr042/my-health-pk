import { type Patient, type Diagnosis, type Medication, doctor } from '@/data/mockData';
import { useAuth } from '@/contexts/AuthContext';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';

interface PrescriptionPreviewProps {
  patient: Patient;
  diagnoses: Diagnosis[];
  medications: Medication[];
  chiefComplaint: string;
  followUp: string;
  instructions: string;
}

export default function PrescriptionPreview({ patient, diagnoses, medications, chiefComplaint, followUp, instructions }: PrescriptionPreviewProps) {
  const { activeClinic } = useAuth();
  const today = new Date().toLocaleDateString('en-PK', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="p-4 lg:p-6">
      <div className="flex justify-end mb-4 no-print">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
          <Printer className="w-4 h-4" /> Print Prescription
        </Button>
      </div>

      {/* A4 preview */}
      <div className="bg-card mx-auto max-w-[210mm] shadow-lg rounded-lg overflow-hidden border border-border flex flex-col" style={{ minHeight: '297mm' }}>
        {/* Letterhead */}
        <div className="bg-primary px-8 py-4 text-primary-foreground">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-lg font-bold">{activeClinic?.logo} {activeClinic?.name}</h1>
              <p className="text-xs text-primary-foreground/80">{activeClinic?.location}, {activeClinic?.city}</p>
              <p className="text-xs text-primary-foreground/80">Phone: {activeClinic?.phone}</p>
            </div>
            <div className="text-right">
              <p className="text-base font-bold">{doctor.name}</p>
              <p className="text-xs text-primary-foreground/80">{doctor.qualifications}</p>
              <p className="text-xs text-primary-foreground/80">{doctor.specialization}</p>
              <p className="text-[11px] text-primary-foreground/60">PMC Reg: {doctor.pmcNumber}</p>
            </div>
          </div>
        </div>

        <div className="px-8 py-5 flex-1 flex flex-col">
          {/* Patient info */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Patient Name</p>
              <p className="font-medium text-foreground">{patient.name}</p>
            </div>
            <div className="text-right">
              <p className="text-muted-foreground text-xs">Date</p>
              <p className="font-medium text-foreground">{today}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">MRN</p>
              <p className="font-medium text-foreground">{patient.mrn}</p>
            </div>
            <div className="text-right">
              <p className="text-muted-foreground text-xs">Age / Gender</p>
              <p className="font-medium text-foreground">{patient.age} years / {patient.gender}</p>
            </div>
          </div>

          <Separator className="my-3" />

          {/* Chief Complaint */}
          {chiefComplaint && (
            <div className="mb-3">
              <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Chief Complaint</h3>
              <p className="text-sm leading-5 text-foreground">{chiefComplaint}</p>
            </div>
          )}

          {/* Diagnoses */}
          {diagnoses.length > 0 && (
            <div className="mb-3">
              <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Diagnosis</h3>
              <ol className="list-decimal list-inside space-y-0.5">
                {diagnoses.map(dx => (
                  <li key={dx.id} className="text-sm leading-5 text-foreground">
                    {dx.name} <span className="text-muted-foreground">({dx.code})</span>
                    {dx.isPrimary && <span className="ml-2 text-xs text-primary font-medium">— Primary</span>}
                  </li>
                ))}
              </ol>
            </div>
          )}

          <Separator className="my-3" />

          {/* Prescription symbol */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl font-serif font-bold text-primary">℞</span>
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Prescription</h3>
          </div>

          {medications.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No medications prescribed</p>
          ) : (
            <div className="space-y-2.5">
              {medications.map((med, i) => (
                <div key={med.id} className="border-b border-border/40 pb-2 last:border-0">
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-semibold text-muted-foreground pt-0.5">{i + 1}.</span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold leading-5 text-foreground">{med.name}</p>
                      <p className="text-xs leading-4 text-muted-foreground">
                        {med.generic} • {med.strength} • {med.form} • {med.route}
                      </p>
                      <p className="text-sm leading-5 text-foreground">
                        <span className="text-muted-foreground">Freq:</span> {med.frequency}
                        <span className="text-muted-foreground"> • Dur:</span> {med.duration}
                      </p>
                      {med.instructions && (
                        <p className="text-xs leading-4 text-foreground">{med.instructions}</p>
                      )}
                      {med.instructionsUrdu && (
                        <p className="text-xs leading-5 text-foreground" dir="rtl" style={{ fontFamily: 'Noto Nastaliq Urdu, Jameel Noori Nastaleeq, serif' }}>
                          {med.instructionsUrdu}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <Separator className="my-3" />

          {/* Instructions */}
          {instructions && (
            <div className="mb-3">
              <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Instructions</h3>
              <p className="text-sm leading-5 text-foreground">{instructions}</p>
            </div>
          )}

          {/* Follow-up */}
          {followUp && (
            <div className="mb-3">
              <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Follow-up</h3>
              <p className="text-sm leading-5 text-foreground">{followUp}</p>
            </div>
          )}

          <div className="mt-auto pt-8">
            <div className="flex items-end justify-between">
              <div className="text-center">
                <div className="w-16 h-16 border border-dashed border-border rounded-lg flex items-center justify-center text-[10px] text-muted-foreground">
                  QR Code
                </div>
              </div>
              <div className="text-center">
                <div className="w-44 border-t border-foreground pt-2">
                  <p className="text-sm font-medium text-foreground">{doctor.name}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-2.5 bg-muted/50 text-center border-t border-border">
          <p className="text-xs text-muted-foreground">
            This prescription is computer-generated. • {activeClinic?.name} • {activeClinic?.phone}
          </p>
        </div>
      </div>
    </div>
  );
}
