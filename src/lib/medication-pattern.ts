import type { Medication } from '@/data/mockData';

type TimingSlot = 'morning' | 'noon' | 'evening';

const timingLabels: Record<TimingSlot, { en: string; ur: string }> = {
  morning: { en: 'morning', ur: 'صبح' },
  noon: { en: 'noon', ur: 'دوپہر' },
  evening: { en: 'evening', ur: 'شام' },
};

const specialPatterns: Record<string, { frequency: string; frequencyUrdu: string; instructions?: string; instructionsUrdu?: string }> = {
  SOS: {
    frequency: 'As needed',
    frequencyUrdu: 'ضرورت کے مطابق',
    instructions: 'Take when required',
    instructionsUrdu: 'ضرورت کے مطابق استعمال کریں',
  },
  HS: {
    frequency: 'At bedtime',
    frequencyUrdu: 'رات سونے سے پہلے',
    instructions: 'Take at bedtime',
    instructionsUrdu: 'رات سونے سے پہلے لیں',
  },
};

const englishNumberWords: Record<number, string> = {
  1: 'one',
  2: 'two',
  3: 'three',
  4: 'four',
  5: 'five',
};

const urduDoseUnitsByForm: Record<string, { singular: string; plural: string }> = {
  tablet: { singular: 'گولی', plural: 'گولیاں' },
  capsule: { singular: 'کیپسول', plural: 'کیپسول' },
  syrup: { singular: 'چمچ', plural: 'چمچ' },
  drops: { singular: 'قطرہ', plural: 'قطرے' },
  injection: { singular: 'انجکشن', plural: 'انجکشن' },
  inhaler: { singular: 'پف', plural: 'پف' },
  cream: { singular: 'مرتبہ', plural: 'مرتبہ' },
  gel: { singular: 'مرتبہ', plural: 'مرتبہ' },
};

const englishDoseUnitsByForm: Record<string, { singular: string; plural: string }> = {
  tablet: { singular: 'tablet', plural: 'tablets' },
  capsule: { singular: 'capsule', plural: 'capsules' },
  syrup: { singular: 'teaspoon', plural: 'teaspoons' },
  drops: { singular: 'drop', plural: 'drops' },
  injection: { singular: 'injection', plural: 'injections' },
  inhaler: { singular: 'puff', plural: 'puffs' },
  cream: { singular: 'application', plural: 'applications' },
  gel: { singular: 'application', plural: 'applications' },
};

function normalizeForm(form: string) {
  return form.trim().toLowerCase();
}

function getUrduDoseUnit(medication: Medication, quantity: number) {
  const fallback = { singular: 'خوراک', plural: 'خوراکیں' };
  const units = medication.doseUnitUrdu ?? urduDoseUnitsByForm[normalizeForm(medication.form)] ?? fallback;
  return quantity === 1 ? units.singular : units.plural;
}

function getEnglishDoseLabel(quantity: number, medication: Medication) {
  const form = normalizeForm(medication.form) || 'dose';
  const units = englishDoseUnitsByForm[form] ?? { singular: 'dose', plural: 'doses' };
  const numberWord = englishNumberWords[quantity] ?? String(quantity);
  return `${numberWord} ${quantity === 1 ? units.singular : units.plural}`;
}

function buildUrduTimingText(medication: Medication, slots: Array<{ timing: TimingSlot; quantity: number }>) {
  return slots
    .map(({ timing, quantity }) => `${quantity} ${getUrduDoseUnit(medication, quantity)} ${timingLabels[timing].ur}`)
    .join('، ');
}

function buildEnglishFrequency(slots: Array<{ timing: TimingSlot; quantity: number }>, medication: Medication) {
  return slots
    .map(({ timing, quantity }) => `${quantity} ${quantity === 1 ? (englishDoseUnitsByForm[normalizeForm(medication.form)]?.singular ?? 'dose') : (englishDoseUnitsByForm[normalizeForm(medication.form)]?.plural ?? 'doses')} ${timingLabels[timing].en}`)
    .join(' + ');
}

function getDurationSuffix(duration: string, language: 'en' | 'ur') {
  const trimmed = duration.trim();
  if (!trimmed) return '';
  if (language === 'ur') {
    return ` - ${translateDurationToUrdu(trimmed)}`;
  }
  return ` - ${trimmed}`;
}

function translateDurationToUrdu(duration: string) {
  const trimmed = duration.trim();
  if (!trimmed) return '';

  const normalized = trimmed.toLowerCase();
  if (normalized === 'continue') return 'جاری رکھیں';

  const match = normalized.match(/^(\d+)\s*(day|days|d|week|weeks|w|month|months|m)$/i);
  if (!match) return trimmed;

  const [, count, unit] = match;
  if (['day', 'days', 'd'].includes(unit)) {
    return `${count} دن`;
  }
  if (['week', 'weeks', 'w'].includes(unit)) {
    return `${count} ہفتے`;
  }
  if (['month', 'months', 'm'].includes(unit)) {
    return `${count} ماہ`;
  }

  return trimmed;
}

function getInjectionRouteSuffix(medication: Medication) {
  if (normalizeForm(medication.form) !== 'injection') return '';
  const type = medication.injectionRouteType?.trim();
  return type ? ` ${type}` : '';
}

export function buildMedicationPrescriptionLines(
  medication: Medication,
  parsedPattern: Pick<ParsedDosePattern, 'frequency' | 'frequencyUrdu'> | null,
  duration: string
) {
  const routeSuffix = getInjectionRouteSuffix(medication);
  const englishBase = parsedPattern?.frequency || medication.frequency || '';
  const urduBase = parsedPattern?.frequencyUrdu || medication.frequencyUrdu || '';

  return {
    english: `${englishBase}${routeSuffix}${getDurationSuffix(duration, 'en')}`.trim(),
    urdu: `${urduBase}${routeSuffix}${getDurationSuffix(duration, 'ur')}`.trim(),
  };
}

export interface ParsedDosePattern {
  normalizedPattern: string;
  frequency: string;
  frequencyUrdu: string;
  instructions?: string;
  instructionsUrdu?: string;
  slots: Array<{
    timing: TimingSlot;
    quantity: number;
    labelEn: string;
    labelUr: string;
  }>;
}

export function parseDosePattern(input: string, medication: Medication): ParsedDosePattern | null {
  const value = input.trim().toUpperCase();
  if (!value) return null;

  if (specialPatterns[value]) {
    return {
      normalizedPattern: value,
      slots: [],
      ...specialPatterns[value],
    };
  }

  const parts = value.split('+');
  if (parts.length < 1 || parts.length > 3) return null;

  const quantities = parts.map(part => Number.parseInt(part, 10));
  if (quantities.some(quantity => Number.isNaN(quantity) || quantity < 0 || quantity > 99)) {
    return null;
  }

  if (quantities.every(quantity => quantity === 0)) {
    return null;
  }

  const expandedQuantities =
    quantities.length === 1
      ? [quantities[0], 0, 0]
      : quantities.length === 2
        ? [quantities[0], 0, quantities[1]]
        : quantities;

  const slots = (['morning', 'noon', 'evening'] as TimingSlot[])
    .map((timing, index) => ({ timing, quantity: expandedQuantities[index] }))
    .filter(slot => slot.quantity > 0);

  return {
    normalizedPattern: expandedQuantities.join('+'),
    frequency: buildEnglishFrequency(slots, medication),
    frequencyUrdu: buildUrduTimingText(medication, slots),
    slots: slots.map(slot => ({
      timing: slot.timing,
      quantity: slot.quantity,
      labelEn: `${getEnglishDoseLabel(slot.quantity, medication)} in the ${timingLabels[slot.timing].en}`,
      labelUr: `${slot.quantity} ${getUrduDoseUnit(medication, slot.quantity)} ${timingLabels[slot.timing].ur}`,
    })),
  };
}
