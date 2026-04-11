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
  const singular = form.endsWith('s') ? form.slice(0, -1) : form;
  const plural = singular === 'syrup' ? 'teaspoonfuls' : `${singular}s`;
  const numberWord = englishNumberWords[quantity] ?? String(quantity);
  return `${numberWord} ${quantity === 1 ? singular : plural}`;
}

function buildUrduTimingText(medication: Medication, slots: Array<{ timing: TimingSlot; quantity: number }>) {
  return slots
    .map(({ timing, quantity }) => `${timingLabels[timing].ur} ${quantity} ${getUrduDoseUnit(medication, quantity)}`)
    .join('، ');
}

function buildEnglishFrequency(slots: Array<{ timing: TimingSlot; quantity: number }>, medication: Medication) {
  if (slots.length === 1 && slots[0]?.timing === 'morning') {
    return `${getEnglishDoseLabel(slots[0].quantity, medication)} once daily`;
  }

  const activeTimings = slots.map(({ timing, quantity }) => `${getEnglishDoseLabel(quantity, medication)} in the ${timingLabels[timing].en}`);

  if (activeTimings.length === 1) return activeTimings[0];
  if (activeTimings.length === 2) return `${activeTimings[0]} and ${activeTimings[1]}`;

  return `${activeTimings.slice(0, -1).join(', ')}, and ${activeTimings.at(-1)}`;
}

export interface ParsedDosePattern {
  normalizedPattern: string;
  frequency: string;
  frequencyUrdu: string;
  instructions?: string;
  instructionsUrdu?: string;
}

export function parseDosePattern(input: string, medication: Medication): ParsedDosePattern | null {
  const value = input.trim().toUpperCase();
  if (!value) return null;

  if (specialPatterns[value]) {
    return {
      normalizedPattern: value,
      ...specialPatterns[value],
    };
  }

  const parts = value.split('+');
  if (parts.length < 1 || parts.length > 3) return null;

  const quantities = parts.map(part => Number.parseInt(part, 10));
  if (quantities.some(quantity => Number.isNaN(quantity) || quantity < 0 || quantity > 9)) {
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
  };
}
