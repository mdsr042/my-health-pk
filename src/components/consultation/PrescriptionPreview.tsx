import { type Patient, type Diagnosis, type Medication, type Vitals, doctor } from '@/data/mockData';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';

function compactPrintableFrequency(frequency: string) {
  if (!frequency) return '';

  const normalized = frequency.replaceAll(' in the ', ' in ');
  const segments = normalized.split(/, | and /).map(item => item.trim()).filter(Boolean);
  if (segments.length < 2) {
    return normalized;
  }

  const parsed = segments.map(segment => {
    const match = segment.match(/^(.+?) in (morning|noon|evening)$/i);
    if (!match) return null;
    return {
      dose: match[1].trim(),
      timing: match[2].toLowerCase(),
    };
  });

  if (parsed.some(item => !item) || !parsed[0]) {
    return normalized;
  }

  const firstDose = parsed[0].dose;
  const first = `${firstDose} in ${parsed[0].timing}`;
  const rest = parsed.slice(1).map(item => {
    const doseWords = item!.dose.split(' ');
    return `${doseWords[0]} in ${item!.timing}`;
  });

  if (rest.length === 1) return `${first} and ${rest[0]}`;
  return `${first}, ${rest.slice(0, -1).join(', ')}, and ${rest.at(-1)}`;
}

function buildCompactUrduLine(med: Medication) {
  return [med.frequencyUrdu, med.instructionsUrdu].filter(Boolean).join(' • ');
}

interface PrescriptionPreviewProps {
  patient: Patient;
  diagnoses: Diagnosis[];
  medications: Medication[];
  chiefComplaint: string;
  pastHistory: string;
  allergies: string;
  vitals: Vitals;
  followUp: string;
  instructions: string;
}

export default function PrescriptionPreview({
  patient,
  diagnoses,
  medications,
  chiefComplaint,
  pastHistory,
  allergies,
  vitals,
  followUp,
  instructions,
}: PrescriptionPreviewProps) {
  const { activeClinic } = useAuth();
  const now = new Date();
  const today = now.toLocaleDateString('en-PK', { year: 'numeric', month: 'long', day: 'numeric' });
  const printedAt = now.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' });
  const vitalsList = [
    { label: 'BP', value: vitals.bp },
    { label: 'Pulse', value: vitals.pulse ? `${vitals.pulse} bpm` : '' },
    { label: 'Temp', value: vitals.temp ? `${vitals.temp} °F` : '' },
    { label: 'SpO2', value: vitals.spo2 ? `${vitals.spo2}%` : '' },
    { label: 'Weight', value: vitals.weight ? `${vitals.weight} kg` : '' },
    { label: 'Height', value: vitals.height ? `${vitals.height} cm` : '' },
    { label: 'BMI', value: vitals.bmi },
    { label: 'RR', value: vitals.respiratoryRate ? `${vitals.respiratoryRate}/min` : '' },
  ].filter(item => item.value);

  return (
    <div className="p-4 lg:p-6">
      <div className="flex justify-end mb-4 no-print">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
          <Printer className="w-4 h-4" /> Print Prescription
        </Button>
      </div>

      <div
        className="bg-card mx-auto max-w-[210mm] shadow-lg rounded-lg overflow-hidden border border-border flex flex-col"
        style={{ minHeight: '297mm' }}
      >
        <div className="bg-primary px-8 py-4 text-primary-foreground">
          <div className="flex items-center justify-between text-[11px] text-primary-foreground/80 mb-3">
            <p>{printedAt}</p>
            <p className="font-medium">Prescription</p>
          </div>
          <div className="flex items-start justify-between gap-6">
            <div>
              <h1 className="text-lg font-bold">{activeClinic?.logo} {activeClinic?.name}</h1>
              <p className="text-xs text-primary-foreground/80">{activeClinic?.location}, {activeClinic?.city}</p>
              <p className="text-xs text-primary-foreground/80">Phone: {activeClinic?.phone}</p>
            </div>
            <div className="text-right">
              <p className="text-base font-bold">{doctor.name}</p>
              <p className="text-xs text-primary-foreground/80">{doctor.specialization}</p>
              <p className="text-xs text-primary-foreground/80">{doctor.qualifications}</p>
              <p className="text-[11px] text-primary-foreground/60">PMC Reg: {doctor.pmcNumber}</p>
            </div>
          </div>
        </div>

        <div className="px-8 py-5 flex-1 flex flex-col">
          <div className="grid grid-cols-3 gap-x-4 gap-y-2 text-sm border-b border-border pb-3">
            <div>
              <p className="text-muted-foreground text-xs">Patient</p>
              <p className="font-medium text-foreground">{patient.name}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">MRN</p>
              <p className="font-medium text-foreground">{patient.mrn}</p>
            </div>
            <div className="text-right">
              <p className="text-muted-foreground text-xs">Date</p>
              <p className="font-medium text-foreground">{today}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Age / Gender</p>
              <p className="font-medium text-foreground">{patient.age}y / {patient.gender}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Phone</p>
              <p className="font-medium text-foreground">{patient.phone}</p>
            </div>
            <div className="text-right">
              <p className="text-muted-foreground text-xs">Blood Group</p>
              <p className="font-medium text-foreground">{patient.bloodGroup || '-'}</p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-[240px_1fr] flex-1 border border-border">
            <div className="border-r border-border px-4 py-4 space-y-4">
              {chiefComplaint && (
                <section>
                  <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Chief Complaint</h3>
                  <p className="text-sm leading-5 text-foreground whitespace-pre-line">{chiefComplaint}</p>
                </section>
              )}

              {pastHistory && (
                <section>
                  <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Past Medical History</h3>
                  <p className="text-sm leading-5 text-foreground whitespace-pre-line">{pastHistory}</p>
                </section>
              )}

              {vitalsList.length > 0 && (
                <section>
                  <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Vitals</h3>
                  <div className="space-y-1">
                    {vitalsList.map(item => (
                      <div key={item.label} className="flex items-start justify-between gap-3 text-sm">
                        <span className="text-muted-foreground">{item.label}</span>
                        <span className="text-right text-foreground">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {allergies && (
                <section>
                  <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Allergies</h3>
                  <p className="text-sm leading-5 text-foreground whitespace-pre-line">{allergies}</p>
                </section>
              )}

              {diagnoses.length > 0 && (
                <section>
                  <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Diagnosis</h3>
                  <div className="space-y-1.5">
                    {diagnoses.map(dx => (
                      <p key={dx.id} className="text-sm leading-5 text-foreground">
                        {dx.name}
                        {dx.code && <span className="text-muted-foreground"> ({dx.code})</span>}
                        {dx.isPrimary && <span className="text-xs text-primary font-medium"> Primary</span>}
                      </p>
                    ))}
                  </div>
                </section>
              )}
            </div>

            <div className="px-5 py-4 flex flex-col">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl font-serif font-bold text-primary">℞</span>
                <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Prescription</h3>
              </div>

              {medications.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No medications prescribed</p>
              ) : (
                <div className="space-y-2">
                  {medications.map((med, index) => (
                    <div key={med.id} className="pb-2 border-b border-dashed border-border/80 last:border-b-0">
                      <p className="text-sm font-semibold leading-5 text-foreground">
                        {index + 1}. {med.name}
                        {med.strength && <span className="font-medium"> - {med.strength}</span>}
                        {med.form && <span className="font-medium"> {med.form}</span>}
                      </p>
                      <p className="text-xs leading-4 text-muted-foreground">
                        {med.generic}
                        {med.route && ` • ${med.route}`}
                        {med.duration && ` • ${med.duration}`}
                      </p>
                      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                        <p className="flex-1 min-w-[260px] text-sm leading-5 text-foreground">
                          {compactPrintableFrequency(med.frequency)}
                          {med.instructions && <span className="text-muted-foreground"> • {med.instructions}</span>}
                        </p>
                        {buildCompactUrduLine(med) && (
                          <p
                            className="max-w-full text-xs leading-5 text-foreground text-right sm:max-w-[45%]"
                            dir="rtl"
                            style={{ fontFamily: 'Noto Nastaliq Urdu, Jameel Noori Nastaleeq, serif' }}
                          >
                            {buildCompactUrduLine(med)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {(instructions || followUp) && (
                <div className="mt-4 space-y-2">
                  {instructions && (
                    <section>
                      <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Instructions</h3>
                      <p className="text-sm leading-5 text-foreground whitespace-pre-line">{instructions}</p>
                    </section>
                  )}
                  {followUp && (
                    <section>
                      <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Follow-up</h3>
                      <p className="text-sm leading-5 text-foreground whitespace-pre-line">{followUp}</p>
                    </section>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="mt-auto pt-8">
            <div className="flex items-end justify-end">
              <div className="text-center">
                <div className="w-44 border-t border-foreground pt-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Signature</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-8 py-3 bg-muted/50 border-t border-border">
          <div className="grid grid-cols-2 gap-6 text-xs">
            <div>
              <p className="font-semibold text-foreground">{doctor.name}</p>
              <p className="text-muted-foreground">{doctor.qualifications}</p>
              <p className="text-muted-foreground">{doctor.specialization}</p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-foreground">{activeClinic?.name}</p>
              <p className="text-muted-foreground">{activeClinic?.location}, {activeClinic?.city}</p>
              <p className="text-muted-foreground">Phone: {activeClinic?.phone}</p>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-center text-muted-foreground">
            This prescription is computer-generated.
          </p>
        </div>
      </div>
    </div>
  );
}
