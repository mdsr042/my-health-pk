import { useState } from 'react';
import { type Patient, type Diagnosis, type Medication, type Vitals, type LabOrder, type Procedure } from '@/data/mockData';
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

function inferMedicationLanguageMode(med: Medication) {
  if (med.languageMode) return med.languageMode;
  const hasEnglish = Boolean(med.frequency || med.instructions);
  const hasUrdu = Boolean(med.frequencyUrdu || med.instructionsUrdu);
  if (hasEnglish && hasUrdu) return 'bilingual';
  if (hasUrdu) return 'ur';
  return 'en';
}

interface PrescriptionPreviewProps {
  patient: Patient;
  diagnoses: Diagnosis[];
  medications: Medication[];
  chiefComplaint: string;
  pastHistory: string;
  allergies: string;
  vitals: Vitals;
  labOrders: LabOrder[];
  procedures: Procedure[];
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
  labOrders,
  procedures,
  followUp,
  instructions,
}: PrescriptionPreviewProps) {
  const { activeClinic, doctor } = useAuth();
  const [printMode, setPrintMode] = useState<'branded' | 'minimal'>('branded');
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
  const doctorName = doctor?.name?.trim() || 'Doctor';
  const doctorSpecialization = doctor?.specialization?.trim() || 'Specialization not added';
  const doctorQualifications = doctor?.qualifications?.trim() || 'Qualifications not added';
  const doctorPmcNumber = doctor?.pmcNumber?.trim() || 'Not added';
  const compactVitals = vitalsList.slice(0, 4);

  return (
    <div className="p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-end gap-2 mb-4 no-print">
        <div className="flex items-center gap-1 rounded-md border border-border bg-card p-1">
          <Button variant={printMode === 'branded' ? 'default' : 'ghost'} size="sm" className="h-8" onClick={() => setPrintMode('branded')}>
            Branded
          </Button>
          <Button variant={printMode === 'minimal' ? 'default' : 'ghost'} size="sm" className="h-8" onClick={() => setPrintMode('minimal')}>
            Minimal
          </Button>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
          <Printer className="w-4 h-4" /> Print Prescription
        </Button>
      </div>

      <div
        className="bg-card mx-auto max-w-[210mm] shadow-lg rounded-lg overflow-hidden border border-border flex flex-col"
        style={{ minHeight: '297mm' }}
      >
        {printMode === 'branded' ? (
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
                <p className="text-base font-bold">{doctorName}</p>
                <p className="text-xs text-primary-foreground/80">{doctorSpecialization}</p>
                <p className="text-xs text-primary-foreground/80">{doctorQualifications}</p>
                <p className="text-[11px] text-primary-foreground/60">PMC Reg: {doctorPmcNumber}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="border-b border-border px-8 py-4">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Prescription</p>
                <p className="text-lg font-semibold text-foreground">{doctorName}</p>
                <p className="text-sm text-muted-foreground">{doctorSpecialization}</p>
              </div>
              <div className="text-right text-sm text-muted-foreground">
                <p>{today}</p>
                <p>{printedAt}</p>
                <p>PMC: {doctorPmcNumber}</p>
              </div>
            </div>
          </div>
        )}

        <div className="px-8 py-5 flex-1 flex flex-col">
          <div className="grid grid-cols-3 gap-x-4 gap-y-2 text-sm border-b border-border pb-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/80">Patient</p>
              <p className="text-sm text-foreground">{patient.name}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/80">MRN</p>
              <p className="text-sm text-foreground">{patient.mrn}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/80">Date</p>
              <p className="text-sm text-foreground">{today}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/80">Age / Gender</p>
              <p className="text-sm text-foreground">{patient.age}y / {patient.gender}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/80">Phone</p>
              <p className="text-sm text-foreground">{patient.phone}</p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-[240px_1fr] flex-1 border border-border">
            <div className="border-r border-border px-4 py-4 space-y-4">
              {diagnoses.length > 0 && (
                <section>
                  <h3 className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wider mb-1.5">Diagnosis</h3>
                  <div className="space-y-1.5">
                    {diagnoses.map(dx => (
                      <p key={dx.id} className="text-sm leading-5 font-normal text-foreground">
                        {dx.name}
                        {dx.code && <span className="text-muted-foreground"> ({dx.code})</span>}
                        {dx.isPrimary && <span className="text-xs text-primary font-medium"> Primary</span>}
                      </p>
                    ))}
                  </div>
                </section>
              )}

              {chiefComplaint && (
                <section>
                  <h3 className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wider mb-1.5">Chief Complaint</h3>
                  <p className="text-sm leading-5 font-normal text-foreground whitespace-pre-line">{chiefComplaint}</p>
                </section>
              )}

              {pastHistory && (
                <section>
                  <h3 className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wider mb-1.5">Past Medical History</h3>
                  <p className="text-sm leading-5 font-normal text-foreground whitespace-pre-line">{pastHistory}</p>
                </section>
              )}

              {allergies && (
                <section>
                  <h3 className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wider mb-1.5">Allergies</h3>
                  <p className="text-sm leading-5 font-normal text-foreground whitespace-pre-line">{allergies}</p>
                </section>
              )}

              {compactVitals.length > 0 && (
                <section>
                  <h3 className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wider mb-1.5">Vitals</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {compactVitals.map(item => (
                      <span key={item.label} className="rounded-full border border-border bg-muted/40 px-2 py-1 text-[11px] text-foreground">
                        {item.label}: {item.value}
                      </span>
                    ))}
                  </div>
                </section>
              )}
            </div>

            <div className="px-5 py-4 flex flex-col">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl font-serif font-bold text-primary">℞</span>
                <h3 className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wider">Prescription</h3>
              </div>

              {medications.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No medications prescribed</p>
              ) : (
                <div className="space-y-2">
                  {medications.map((med, index) => (
                    <div key={med.id} className="pb-2 border-b border-dashed border-border/80 last:border-b-0">
                      {(() => {
                        const languageMode = inferMedicationLanguageMode(med);
                        const englishLine = [compactPrintableFrequency(med.frequency), med.instructions].filter(Boolean).join(' • ');
                        const urduLine = buildCompactUrduLine(med);

                        return (
                          <>
                      <p className="text-sm font-medium leading-5 text-foreground">
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
                        {languageMode !== 'ur' && englishLine && (
                          <p className="flex-1 min-w-[260px] text-sm leading-5 text-foreground">
                            {englishLine}
                          </p>
                        )}
                        {languageMode !== 'en' && urduLine && (
                          <p
                            className="max-w-full text-xs leading-5 text-foreground text-right sm:max-w-[45%]"
                            dir="rtl"
                            style={{ fontFamily: 'Noto Nastaliq Urdu, Jameel Noori Nastaleeq, serif' }}
                          >
                            {urduLine}
                          </p>
                        )}
                      </div>
                          </>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              )}

              {(instructions || followUp) && (
                <div className="mt-4 space-y-2">
                  {instructions && (
                    <section>
                      <h3 className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wider mb-1.5">Instructions</h3>
                      <p className="text-sm leading-5 font-normal text-foreground whitespace-pre-line">{instructions}</p>
                    </section>
                  )}
                  {followUp && (
                    <section>
                      <h3 className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wider mb-1.5">Follow-up</h3>
                      <p className="text-sm leading-5 font-normal text-foreground whitespace-pre-line">{followUp}</p>
                    </section>
                  )}
                </div>
              )}

              {(procedures.length > 0 || labOrders.length > 0) && (
                <div className="mt-5 space-y-3 border-t border-border pt-4">
                  {procedures.length > 0 && (
                    <section>
                      <h3 className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wider mb-1.5">Procedures</h3>
                      <div className="space-y-1.5">
                        {procedures.map((procedure, index) => (
                          <div key={procedure.id} className="text-sm leading-5 text-foreground">
                            <p>{index + 1}. {procedure.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {[procedure.category, procedure.notes].filter(Boolean).join(' • ') || 'Procedure added during consultation'}
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {labOrders.length > 0 && (
                    <section>
                      <h3 className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wider mb-1.5">
                        Investigations / Radiology
                      </h3>
                      <div className="space-y-1.5">
                        {labOrders.map((order, index) => (
                          <div key={order.id} className="text-sm leading-5 text-foreground">
                            <p>{index + 1}. {order.testName}</p>
                            <p className="text-xs text-muted-foreground">
                              {[order.category, order.priority?.toUpperCase()].filter(Boolean).join(' • ')}
                            </p>
                          </div>
                        ))}
                      </div>
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
          <div className={`grid gap-6 text-xs ${printMode === 'branded' ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <div>
              <p className="font-semibold text-foreground">{doctorName}</p>
              <p className="text-muted-foreground">{doctorQualifications}</p>
              <p className="text-muted-foreground">{doctorSpecialization}</p>
            </div>
            {printMode === 'branded' && (
              <div className="text-right">
                <p className="font-semibold text-foreground">{activeClinic?.name}</p>
                <p className="text-muted-foreground">{activeClinic?.location}, {activeClinic?.city}</p>
                <p className="text-muted-foreground">Phone: {activeClinic?.phone}</p>
              </div>
            )}
          </div>
          <p className="mt-2 text-[11px] text-center text-muted-foreground">
            This prescription is computer-generated.
          </p>
        </div>
      </div>
    </div>
  );
}
