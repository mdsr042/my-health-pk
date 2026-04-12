import { z } from 'zod';

function createHttpError(message, code, statusCode) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

export function validatePasswordPolicy(password) {
  const value = String(password ?? '');
  if (value.length < 8) return 'Password must be at least 8 characters long.';
  if (!/[a-z]/.test(value)) return 'Password must include at least one lowercase letter.';
  if (!/[A-Z]/.test(value)) return 'Password must include at least one uppercase letter.';
  if (!/[0-9]/.test(value)) return 'Password must include at least one number.';
  return '';
}

const trimmedString = (field, max = 255) =>
  z.string({ required_error: `${field} is required` }).trim().min(1, `${field} is required`).max(max, `${field} is too long`);

export const signupSchema = z.object({
  fullName: trimmedString('Full name'),
  email: z.string().trim().email('Valid email is required'),
  phone: trimmedString('Phone', 40),
  password: z.string().min(1, 'Password is required'),
  pmcNumber: trimmedString('PMC number', 80),
  specialization: trimmedString('Specialization'),
  qualifications: z.string().trim().max(255).default(''),
  clinicName: trimmedString('Clinic name'),
  city: trimmedString('City'),
  notes: z.string().trim().max(1000).default(''),
});

export const patientSchema = z.object({
  id: z.string().optional(),
  mrn: z.string().optional(),
  name: trimmedString('Patient name'),
  phone: z.string().trim().max(40).default(''),
  age: z.number().int().min(0).max(130).default(0),
  gender: z.enum(['Male', 'Female']).default('Male'),
  cnic: z.string().trim().max(30).default(''),
  address: z.string().trim().max(500).default(''),
  bloodGroup: z.string().trim().max(10).default(''),
  emergencyContact: z.string().trim().max(120).default(''),
});

export const appointmentSchema = z.object({
  id: z.string().optional(),
  patientId: trimmedString('Patient'),
  clinicId: trimmedString('Clinic'),
  doctorId: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Appointment date must be YYYY-MM-DD'),
  time: z.string().min(1, 'Appointment time is required').max(20),
  status: z.enum(['scheduled', 'waiting', 'in-consultation', 'completed', 'cancelled', 'no-show']).default('scheduled'),
  type: z.enum(['new', 'follow-up']).default('new'),
  chiefComplaint: z.string().trim().max(500).default(''),
  tokenNumber: z.number().int().min(0).default(0),
});

export const walkInSchema = z.object({
  clinicId: trimmedString('Clinic'),
  patientId: z.string().trim().max(120).optional(),
  name: z.string().trim().max(255).default(''),
  phone: z.string().trim().max(40).default(''),
  age: z.number().int().min(0).max(130).default(0),
  gender: z.enum(['Male', 'Female']).default('Male'),
  cnic: z.string().trim().max(30).default(''),
  address: z.string().trim().max(500).default(''),
  bloodGroup: z.string().trim().max(10).default(''),
  emergencyContact: z.string().trim().max(120).default(''),
  chiefComplaint: z.string().trim().max(500).default(''),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Walk-in date must be YYYY-MM-DD'),
  time: z.string().max(20).optional(),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(1, 'New password is required'),
});

export const passwordResetSchema = z.object({
  newPassword: z.string().min(1, 'New password is required'),
});

const templateDiagnosisSchema = z.object({
  code: z.string().trim().max(50).default(''),
  name: trimmedString('Diagnosis name'),
  isPrimary: z.boolean().default(false),
});

const templateMedicationSchema = z.object({
  name: trimmedString('Medication name'),
  nameUrdu: z.string().trim().max(255).default(''),
  generic: z.string().trim().max(255).default(''),
  strength: z.string().trim().max(120).default(''),
  form: z.string().trim().max(120).default(''),
  route: z.string().trim().max(120).default(''),
  languageMode: z.enum(['en', 'ur', 'bilingual']).default('bilingual'),
  dosePattern: z.string().trim().max(120).default(''),
  frequency: z.string().trim().max(255).default(''),
  frequencyUrdu: z.string().trim().max(255).default(''),
  duration: z.string().trim().max(120).default(''),
  durationUrdu: z.string().trim().max(120).default(''),
  instructions: z.string().trim().max(500).default(''),
  instructionsUrdu: z.string().trim().max(500).default(''),
});

const templateLabOrderSchema = z.object({
  testName: trimmedString('Investigation name'),
  category: trimmedString('Category', 120),
  priority: z.enum(['routine', 'urgent', 'stat']).default('routine'),
});

export const treatmentTemplateSchema = z.object({
  name: trimmedString('Template name'),
  conditionLabel: z.string().trim().max(255).default(''),
  chiefComplaint: z.string().trim().max(500).default(''),
  instructions: z.string().trim().max(1000).default(''),
  followUp: z.string().trim().max(500).default(''),
  diagnoses: z.array(templateDiagnosisSchema).max(25).default([]),
  medications: z.array(templateMedicationSchema).max(25).default([]),
  labOrders: z.array(templateLabOrderSchema).max(25).default([]),
});

export function parseOrThrow(schema, value, code = 'INVALID_REQUEST') {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw createHttpError(issue?.message || 'Invalid request data', code, 400);
  }
  return result.data;
}
