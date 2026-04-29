import { useState } from 'react';
import { type Patient, type Diagnosis, type Medication, type Vitals, type LabOrder, type Procedure } from '@/data/mockData';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';

function translateDurationToUrdu(duration: string) {
  const trimmed = duration.trim();
  if (!trimmed) return '';

  const normalized = trimmed.toLowerCase();
  if (normalized === 'continue') return 'جاری رکھیں';

  const match = normalized.match(/^(\d+)\s*(day|days|d|week|weeks|w|month|months|m)$/i);
  if (!match) return trimmed;

  const [, count, unit] = match;
  if (['day', 'days', 'd'].includes(unit)) return `${count} دن`;
  if (['week', 'weeks', 'w'].includes(unit)) return `${count} ہفتے`;
  if (['month', 'months', 'm'].includes(unit)) return `${count} ماہ`;
  return trimmed;
}

function normalizeDisplayValue(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function stripDurationSuffix(value: string) {
  return value.split(' - ')[0]?.trim() || value.trim();
}

function buildMedicationTitle(med: Medication) {
  const normalizedName = normalizeDisplayValue(med.name);
  const normalizedStrength = normalizeDisplayValue(med.strength);
  const normalizedForm = normalizeDisplayValue(med.form);

  const includesStrength = normalizedStrength && normalizedName.includes(normalizedStrength);
  const includesForm = normalizedForm && normalizedName.includes(normalizedForm);

  const extras = [
    includesStrength ? '' : med.strength,
    includesForm ? '' : med.form,
  ].filter(Boolean);

  return extras.length > 0 ? `${med.name} - ${extras.join(' ')}` : med.name;
}

function buildCompactUrduLine(med: Medication) {
  const urduBase = med.prescriptionLineUrdu || med.frequencyUrdu || '';
  const fallbackWithDuration =
    !urduBase && med.prescriptionLine
      ? `${stripDurationSuffix(med.prescriptionLine)}${med.duration ? ` - ${translateDurationToUrdu(med.duration)}` : ''}`
      : '';
  const lineWithDuration = urduBase
    ? `${stripDurationSuffix(urduBase)}${med.duration ? ` - ${translateDurationToUrdu(med.duration)}` : ''}`
    : fallbackWithDuration;
  return lineWithDuration.trim();
}

function inferMedicationLanguageMode(med: Medication) {
  if (med.languageMode) return med.languageMode;
  const hasEnglish = Boolean(med.frequency || med.instructions);
  const hasUrdu = Boolean(med.frequencyUrdu || med.instructionsUrdu);
  if (hasEnglish && hasUrdu) return 'bilingual';
  if (hasUrdu) return 'ur';
  return 'en';
}

function isRadiologyOrder(order: LabOrder) {
  const category = order.category.toLowerCase();
  return order.type === 'radiology' || ['radiology', 'ultrasound', 'ct', 'mri', 'x-ray', 'xray'].some(keyword => category.includes(keyword));
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
  const vitalsList = [
    { label: 'BP', value: vitals.bp || 'N/A' },
    { label: 'Pulse', value: vitals.pulse ? `${vitals.pulse} bpm` : 'N/A' },
    { label: 'Temp', value: vitals.temp ? `${vitals.temp} °F` : 'N/A' },
    { label: 'SpO2', value: vitals.spo2 ? `${vitals.spo2}%` : 'N/A' },
    { label: 'Weight', value: vitals.weight ? `${vitals.weight} kg` : 'N/A' },
    { label: 'Height', value: vitals.height ? `${vitals.height} cm` : 'N/A' },
    { label: 'BMI', value: vitals.bmi || 'N/A' },
    { label: 'RR', value: vitals.respiratoryRate ? `${vitals.respiratoryRate}/min` : 'N/A' },
  ];
  const doctorName = doctor?.name?.trim() || 'Doctor';
  const doctorSpecialization = doctor?.specialization?.trim() || 'Specialization not added';
  const doctorQualifications = doctor?.qualifications?.trim() || 'Qualifications not added';
  const doctorPmcNumber = doctor?.pmcNumber?.trim() || 'Not added';
  const displayedVitals = vitalsList;
  const labOnlyOrders = labOrders.filter(order => !isRadiologyOrder(order));
  const radiologyOrders = labOrders.filter(order => isRadiologyOrder(order));

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
          <div className="border-b border-border px-6 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-lg font-semibold tracking-[0.14em] text-foreground">{activeClinic?.logo} {activeClinic?.name}</h1>
                <p className="text-[11px] text-muted-foreground">{activeClinic?.location}, {activeClinic?.city}</p>
                <p className="text-[11px] text-muted-foreground">Phone: {activeClinic?.phone}</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-semibold text-foreground">{doctorName}</p>
                <p className="text-[11px] text-muted-foreground">{doctorSpecialization}</p>
                <p className="text-[11px] text-muted-foreground">{doctorQualifications}</p>
                <p className="text-[11px] text-muted-foreground">PMC Reg: {doctorPmcNumber}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="border-b border-border px-6 py-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-base font-semibold text-foreground">{doctorName}</p>
                <p className="text-xs text-muted-foreground">{doctorSpecialization}</p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p>{today}</p>
                <p>PMC: {doctorPmcNumber}</p>
              </div>
            </div>
          </div>
        )}

        <div className="px-6 py-4 flex-1 flex flex-col">
          <div className="rounded-md border border-border px-3 py-2.5">
            <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 text-sm">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/80">Patient</p>
              <p className="text-[13px] text-foreground">{patient.name}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/80">MRN</p>
              <p className="text-[13px] text-foreground">{patient.mrn}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/80">Date</p>
              <p className="text-[13px] text-foreground">{today}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/80">Age / Gender</p>
              <p className="text-[13px] text-foreground">{patient.age}y / {patient.gender}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/80">Phone</p>
              <p className="text-[13px] text-foreground">{patient.phone}</p>
            </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-[220px_1fr] flex-1 border border-border">
            <div className="border-r border-border px-3 py-3 space-y-3">
              {diagnoses.length > 0 && (
                <section>
                  <h3 className="mb-1.5 text-[12px] font-bold text-foreground uppercase tracking-wide">Diagnosis</h3>
                  <div className="space-y-1">
                    {diagnoses.map(dx => (
                      <p key={dx.id} className="text-[11px] leading-4.5 font-normal text-foreground/90">
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
                  <h3 className="mb-1.5 text-[12px] font-bold text-foreground uppercase tracking-wide">Chief Complaint</h3>
                  <p className="text-[11px] leading-4.5 font-normal text-foreground/90 whitespace-pre-line">{chiefComplaint}</p>
                </section>
              )}

              {pastHistory && (
                <section>
                  <h3 className="mb-1.5 text-[12px] font-bold text-foreground uppercase tracking-wide">Past Medical History</h3>
                  <p className="text-[11px] leading-4.5 font-normal text-foreground/90 whitespace-pre-line">{pastHistory}</p>
                </section>
              )}

              {allergies && (
                <section>
                  <h3 className="mb-1.5 text-[12px] font-bold text-foreground uppercase tracking-wide">Allergies</h3>
                  <p className="text-[11px] leading-4.5 font-normal text-foreground/90 whitespace-pre-line">{allergies}</p>
                </section>
              )}

              {displayedVitals.length > 0 && (
                <section>
                  <h3 className="mb-1.5 text-[12px] font-bold text-foreground uppercase tracking-wide">Vitals</h3>
                  <div className="flex flex-wrap gap-1">
                    {displayedVitals.map(item => (
                      <span key={item.label} className="rounded-full border border-border bg-muted/30 px-1.5 py-0.5 text-[10px] font-normal text-foreground/90">
                        {item.label}: {item.value}
                      </span>
                    ))}
                  </div>
                </section>
              )}
            </div>

            <div className="px-4 py-3 flex flex-col">
              <div className="mb-3 border-b border-border pb-1.5">
                <span className="text-[26px] font-serif font-semibold text-foreground">℞</span>
              </div>

              {medications.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No medications prescribed</p>
              ) : (
                <div className="space-y-2.5">
                  {medications.map((med, index) => (
                    <div key={med.id} className="pb-2 border-b border-dashed border-border/80 last:border-b-0">
                      {(() => {
                        const languageMode = inferMedicationLanguageMode(med);
                        const englishLine = med.prescriptionLine || med.frequency;
                        const urduLine = buildCompactUrduLine(med);

                        return (
                          <>
                      <p className="text-[13px] font-semibold leading-4.5 text-foreground">
                        {index + 1}. {buildMedicationTitle(med)}
                      </p>
                      <p className="text-[11px] leading-4 text-muted-foreground">
                        {med.generic}
                        {med.route && ` • ${med.route}`}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-start justify-between gap-x-3 gap-y-0.5">
                        {languageMode !== 'ur' && englishLine && (
                          <p className="flex-1 min-w-[220px] text-[13px] leading-4.5 text-foreground">
                            {englishLine}
                          </p>
                        )}
                        {languageMode !== 'en' && urduLine && (
                          <p
                            className="ml-auto w-full text-[13px] leading-6 text-foreground text-right sm:w-auto sm:min-w-[250px] sm:max-w-[46%]"
                            dir="rtl"
                            style={{ fontFamily: 'Noto Nastaliq Urdu, Jameel Noori Nastaleeq, serif' }}
                          >
                            {urduLine}
                          </p>
                        )}
                      </div>
                      {(med.instructions || med.instructionsUrdu) && (
                        <div className="mt-1 space-y-0.5">
                          {languageMode !== 'ur' && med.instructions && (
                            <p className="text-[11px] leading-4 text-muted-foreground">
                              {med.instructions}
                            </p>
                          )}
                          {languageMode !== 'en' && med.instructionsUrdu && (
                            <p
                              className="text-[12px] leading-5.5 text-muted-foreground text-right"
                              dir="rtl"
                              style={{ fontFamily: 'Noto Nastaliq Urdu, Jameel Noori Nastaleeq, serif' }}
                            >
                              {med.instructionsUrdu}
                            </p>
                          )}
                        </div>
                      )}
                          </>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              )}

              {(instructions || followUp) && (
                <div className="mt-3 space-y-1.5">
                  {instructions && (
                    <section>
                      <h3 className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wider mb-1">Instructions</h3>
                      <p className="text-[12px] leading-4.5 font-normal text-foreground whitespace-pre-line">{instructions}</p>
                    </section>
                  )}
                  {followUp && (
                    <section>
                      <h3 className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wider mb-1">Follow-up</h3>
                      <p className="text-[12px] leading-4.5 font-normal text-foreground whitespace-pre-line">{followUp}</p>
                    </section>
                  )}
                </div>
              )}

              {(procedures.length > 0 || labOnlyOrders.length > 0 || radiologyOrders.length > 0) && (
                <div className="mt-4 space-y-2.5 border-t border-border pt-3">
                  {procedures.length > 0 && (
                    <section>
                      <h3 className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wider mb-1">Procedures</h3>
                      <div className="space-y-1">
                        {procedures.map((procedure, index) => (
                          <div key={procedure.id} className="text-[12px] leading-4.5 text-foreground">
                            <p>{index + 1}. {procedure.name}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {[procedure.category, procedure.notes].filter(Boolean).join(' • ') || 'Procedure added during consultation'}
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {labOnlyOrders.length > 0 && (
                    <section>
                      <h3 className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wider mb-1">Lab Orders</h3>
                      <div className="space-y-1">
                        {labOnlyOrders.map((order, index) => (
                          <div key={order.id} className="text-[12px] leading-4.5 text-foreground">
                            <p>{index + 1}. {order.testName}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {[order.category, order.priority?.toUpperCase()].filter(Boolean).join(' • ')}
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {radiologyOrders.length > 0 && (
                    <section>
                      <h3 className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wider mb-1">Radiology</h3>
                      <div className="space-y-1">
                        {radiologyOrders.map((order, index) => (
                          <div key={order.id} className="text-[12px] leading-4.5 text-foreground">
                            <p>{index + 1}. {order.testName}</p>
                            <p className="text-[11px] text-muted-foreground">
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

          <div className="mt-auto pt-6">
            <div className="flex items-end justify-end">
              <div className="text-center">
                <div className="w-36 border-t border-foreground pt-1.5">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Signature</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-2.5 bg-muted/50 border-t border-border">
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
