import { getLocalDateKey } from '@/lib/date';

export interface Clinic {
  id: string;
  name: string;
  location: string;
  city: string;
  phone: string;
  timings: string;
  specialties: string[];
  logo: string;
}

export interface Doctor {
  id: string;
  name: string;
  email: string;
  qualifications: string;
  specialization: string;
  pmcNumber: string;
  phone: string;
  clinicIds: string[];
}

export interface Patient {
  id: string;
  mrn: string;
  name: string;
  phone: string;
  age: number;
  gender: 'Male' | 'Female';
  cnic: string;
  address: string;
  bloodGroup: string;
  emergencyContact: string;
}

export interface Appointment {
  id: string;
  patientId: string;
  clinicId: string;
  doctorId: string;
  date: string;
  time: string;
  status: 'scheduled' | 'waiting' | 'in-consultation' | 'completed' | 'cancelled' | 'no-show';
  type: 'new' | 'follow-up';
  chiefComplaint?: string;
  tokenNumber: number;
}

export interface Vitals {
  bp: string;
  pulse: string;
  temp: string;
  spo2: string;
  weight: string;
  height: string;
  bmi: string;
  respiratoryRate: string;
}

export interface Diagnosis {
  id: string;
  code: string;
  name: string;
  isPrimary: boolean;
}

export interface Medication {
  id: string;
  name: string;
  nameUrdu: string;
  generic: string;
  strength: string;
  form: string;
  route: string;
  injectionRouteType?: 'IM' | 'IV' | 'SC' | '';
  languageMode?: 'en' | 'ur' | 'bilingual';
  dosePattern?: string;
  prescriptionLine?: string;
  prescriptionLineUrdu?: string;
  doseUnitUrdu?: {
    singular: string;
    plural: string;
  };
  frequency: string;
  frequencyUrdu: string;
  duration: string;
  durationUrdu: string;
  instructions: string;
  instructionsUrdu: string;
  diagnosisId?: string;
}

export interface LabOrder {
  id: string;
  testName: string;
  category: string;
  priority: 'routine' | 'urgent' | 'stat';
  status: 'ordered' | 'collected' | 'resulted';
  result?: string;
  date: string;
}

export interface Procedure {
  id: string;
  name: string;
  category: string;
  notes: string;
}

export interface CareAction {
  id: string;
  appointmentId?: string;
  patientId: string;
  clinicId: string;
  doctorId: string;
  type: 'referral' | 'admission' | 'followup';
  targetType: 'specialty' | 'facility' | 'date';
  targetId: string;
  title: string;
  notes: string;
  urgency: 'routine' | 'urgent' | 'emergency';
  actionDate: string;
  createdAt?: string;
}

export interface ClinicalNote {
  id: string;
  appointmentId?: string;
  patientId: string;
  clinicId: string;
  doctorId: string;
  date: string;
  chiefComplaint: string;
  hpi: string;
  pastHistory: string;
  allergies: string;
  examination: string;
  assessment: string;
  plan: string;
  instructions: string;
  followUp: string;
  vitals: Vitals;
  diagnoses: Diagnosis[];
  medications: Medication[];
  labOrders: LabOrder[];
  procedures: Procedure[];
  careActions: CareAction[];
  status: 'draft' | 'completed';
}

// ── Clinics ──
export const clinics: Clinic[] = [
  {
    id: 'clinic-1',
    name: 'Al-Shifa Medical Center',
    location: 'Block F, Johar Town',
    city: 'Lahore',
    phone: '042-35431200',
    timings: '9:00 AM – 2:00 PM',
    specialties: ['General Medicine', 'Cardiology', 'Dermatology'],
    logo: '🏥',
  },
  {
    id: 'clinic-2',
    name: 'Medicare Family Clinic',
    location: 'Main Boulevard, Gulberg III',
    city: 'Lahore',
    phone: '042-35762100',
    timings: '4:00 PM – 9:00 PM',
    specialties: ['Family Medicine', 'Pediatrics', 'ENT'],
    logo: '🏨',
  },
  {
    id: 'clinic-3',
    name: 'City Hospital OPD',
    location: 'Ferozepur Road, Ichhra',
    city: 'Lahore',
    phone: '042-37581000',
    timings: '10:00 AM – 5:00 PM',
    specialties: ['Internal Medicine', 'Pulmonology', 'Gastroenterology'],
    logo: '🏩',
  },
];

// ── Doctor ──
export const doctor: Doctor = {
  id: 'doc-1',
  name: 'Dr. Ahmed Raza Khan',
  email: 'dr.ahmed@medcare.pk',
  qualifications: 'MBBS, FCPS (Medicine), MRCP (UK)',
  specialization: 'Internal Medicine / General Physician',
  pmcNumber: 'PMC-45231',
  phone: '0321-4567890',
  clinicIds: ['clinic-1', 'clinic-2', 'clinic-3'],
};

// ── Patients ──
export const patients: Patient[] = [
  { id: 'p-1', mrn: 'MRN-20240001', name: 'Muhammad Asif Ali', phone: '0300-1234567', age: 45, gender: 'Male', cnic: '35201-1234567-1', address: 'House 12, Street 5, Johar Town, Lahore', bloodGroup: 'B+', emergencyContact: '0301-9876543' },
  { id: 'p-2', mrn: 'MRN-20240002', name: 'Fatima Bibi', phone: '0321-2345678', age: 32, gender: 'Female', cnic: '35202-2345678-2', address: '45-A, Model Town, Lahore', bloodGroup: 'A+', emergencyContact: '0322-8765432' },
  { id: 'p-3', mrn: 'MRN-20240003', name: 'Imran Hussain', phone: '0333-3456789', age: 58, gender: 'Male', cnic: '35203-3456789-3', address: 'Flat 3, Al-Rehman Garden, Lahore', bloodGroup: 'O+', emergencyContact: '0334-7654321' },
  { id: 'p-4', mrn: 'MRN-20240004', name: 'Ayesha Siddiqui', phone: '0345-4567890', age: 28, gender: 'Female', cnic: '35204-4567890-4', address: '67-B, Cantt Area, Lahore', bloodGroup: 'AB+', emergencyContact: '0346-6543210' },
  { id: 'p-5', mrn: 'MRN-20240005', name: 'Rizwan Ahmed', phone: '0312-5678901', age: 67, gender: 'Male', cnic: '35205-5678901-5', address: '23, Gulberg II, Lahore', bloodGroup: 'A-', emergencyContact: '0313-5432109' },
  { id: 'p-6', mrn: 'MRN-20240006', name: 'Sana Fatima', phone: '0331-6789012', age: 41, gender: 'Female', cnic: '35206-6789012-6', address: '89, DHA Phase 5, Lahore', bloodGroup: 'B-', emergencyContact: '0332-4321098' },
  { id: 'p-7', mrn: 'MRN-20240007', name: 'Kashif Mehmood', phone: '0344-7890123', age: 52, gender: 'Male', cnic: '35207-7890123-7', address: '112, Township, Lahore', bloodGroup: 'O-', emergencyContact: '0345-3210987' },
  { id: 'p-8', mrn: 'MRN-20240008', name: 'Zainab Noor', phone: '0303-8901234', age: 35, gender: 'Female', cnic: '35208-8901234-8', address: '34, Garden Town, Lahore', bloodGroup: 'A+', emergencyContact: '0304-2109876' },
  { id: 'p-9', mrn: 'MRN-20240009', name: 'Tariq Mahmood', phone: '0315-9012345', age: 72, gender: 'Male', cnic: '35209-9012345-9', address: '56, Iqbal Town, Lahore', bloodGroup: 'B+', emergencyContact: '0316-1098765' },
  { id: 'p-10', mrn: 'MRN-20240010', name: 'Nadia Perveen', phone: '0336-0123456', age: 29, gender: 'Female', cnic: '35210-0123456-0', address: '78, Wapda Town, Lahore', bloodGroup: 'AB-', emergencyContact: '0337-0987654' },
  { id: 'p-11', mrn: 'MRN-20240011', name: 'Usman Ghani', phone: '0347-1234509', age: 61, gender: 'Male', cnic: '35211-1234509-1', address: '90, Faisal Town, Lahore', bloodGroup: 'O+', emergencyContact: '0348-9876501' },
  { id: 'p-12', mrn: 'MRN-20240012', name: 'Rubina Khatoon', phone: '0306-2345610', age: 48, gender: 'Female', cnic: '35212-2345610-2', address: '15, Samanabad, Lahore', bloodGroup: 'A+', emergencyContact: '0307-8765410' },
  { id: 'p-13', mrn: 'MRN-20240013', name: 'Bilal Hassan', phone: '0318-3456721', age: 38, gender: 'Male', cnic: '35213-3456721-3', address: '22, Shadman, Lahore', bloodGroup: 'B+', emergencyContact: '0319-7654321' },
  { id: 'p-14', mrn: 'MRN-20240014', name: 'Mehwish Hayat', phone: '0339-4567832', age: 26, gender: 'Female', cnic: '35214-4567832-4', address: '44, Askari 11, Lahore', bloodGroup: 'O+', emergencyContact: '0340-6543210' },
  { id: 'p-15', mrn: 'MRN-20240015', name: 'Nadeem Sarwar', phone: '0302-5678943', age: 55, gender: 'Male', cnic: '35215-5678943-5', address: '66, Bahria Town, Lahore', bloodGroup: 'A-', emergencyContact: '0303-5432100' },
  { id: 'p-16', mrn: 'MRN-20240016', name: 'Amina Iqbal', phone: '0323-6789054', age: 33, gender: 'Female', cnic: '35216-6789054-6', address: '88, Valencia Town, Lahore', bloodGroup: 'AB+', emergencyContact: '0324-4321099' },
  { id: 'p-17', mrn: 'MRN-20240017', name: 'Shahid Afridi', phone: '0341-7890165', age: 44, gender: 'Male', cnic: '35217-7890165-7', address: '11, EME Society, Lahore', bloodGroup: 'B-', emergencyContact: '0342-3210988' },
  { id: 'p-18', mrn: 'MRN-20240018', name: 'Hira Mani', phone: '0309-8901276', age: 31, gender: 'Female', cnic: '35218-8901276-8', address: '33, Cavalry Ground, Lahore', bloodGroup: 'O-', emergencyContact: '0310-2109877' },
  { id: 'p-19', mrn: 'MRN-20240019', name: 'Farhan Saeed', phone: '0317-9012387', age: 49, gender: 'Male', cnic: '35219-9012387-9', address: '55, Allama Iqbal Town, Lahore', bloodGroup: 'A+', emergencyContact: '0318-1098766' },
  { id: 'p-20', mrn: 'MRN-20240020', name: 'Sadia Khan', phone: '0338-0123498', age: 37, gender: 'Female', cnic: '35220-0123498-0', address: '77, Gulshan-e-Ravi, Lahore', bloodGroup: 'B+', emergencyContact: '0339-0987655' },
];

// ── Today's Appointments ──
const today = getLocalDateKey();
export const appointments: Appointment[] = [
  { id: 'apt-1', patientId: 'p-1', clinicId: 'clinic-1', doctorId: 'doc-1', date: today, time: '09:15', status: 'completed', type: 'follow-up', chiefComplaint: 'Diabetes follow-up', tokenNumber: 1 },
  { id: 'apt-2', patientId: 'p-2', clinicId: 'clinic-1', doctorId: 'doc-1', date: today, time: '09:30', status: 'completed', type: 'new', chiefComplaint: 'Chronic headache', tokenNumber: 2 },
  { id: 'apt-3', patientId: 'p-3', clinicId: 'clinic-1', doctorId: 'doc-1', date: today, time: '09:45', status: 'in-consultation', type: 'new', chiefComplaint: 'Chest pain and shortness of breath', tokenNumber: 3 },
  { id: 'apt-4', patientId: 'p-4', clinicId: 'clinic-1', doctorId: 'doc-1', date: today, time: '10:00', status: 'waiting', type: 'follow-up', chiefComplaint: 'Hypertension review', tokenNumber: 4 },
  { id: 'apt-5', patientId: 'p-5', clinicId: 'clinic-1', doctorId: 'doc-1', date: today, time: '10:15', status: 'waiting', type: 'new', chiefComplaint: 'Joint pain and stiffness', tokenNumber: 5 },
  { id: 'apt-6', patientId: 'p-6', clinicId: 'clinic-1', doctorId: 'doc-1', date: today, time: '10:30', status: 'waiting', type: 'new', chiefComplaint: 'Skin rash on arms', tokenNumber: 6 },
  { id: 'apt-7', patientId: 'p-7', clinicId: 'clinic-1', doctorId: 'doc-1', date: today, time: '10:45', status: 'scheduled', type: 'follow-up', chiefComplaint: 'Asthma follow-up', tokenNumber: 7 },
  { id: 'apt-8', patientId: 'p-8', clinicId: 'clinic-1', doctorId: 'doc-1', date: today, time: '11:00', status: 'scheduled', type: 'new', chiefComplaint: 'Fever and body aches', tokenNumber: 8 },
  { id: 'apt-9', patientId: 'p-9', clinicId: 'clinic-1', doctorId: 'doc-1', date: today, time: '11:15', status: 'scheduled', type: 'new', chiefComplaint: 'Urinary problems', tokenNumber: 9 },
  { id: 'apt-10', patientId: 'p-10', clinicId: 'clinic-1', doctorId: 'doc-1', date: today, time: '11:30', status: 'scheduled', type: 'follow-up', chiefComplaint: 'Thyroid check-up', tokenNumber: 10 },
  { id: 'apt-11', patientId: 'p-11', clinicId: 'clinic-2', doctorId: 'doc-1', date: today, time: '16:00', status: 'waiting', type: 'new', chiefComplaint: 'Persistent cough', tokenNumber: 1 },
  { id: 'apt-12', patientId: 'p-12', clinicId: 'clinic-2', doctorId: 'doc-1', date: today, time: '16:15', status: 'scheduled', type: 'follow-up', chiefComplaint: 'Gastritis follow-up', tokenNumber: 2 },
  { id: 'apt-13', patientId: 'p-13', clinicId: 'clinic-2', doctorId: 'doc-1', date: today, time: '16:30', status: 'scheduled', type: 'new', chiefComplaint: 'Lower back pain', tokenNumber: 3 },
  { id: 'apt-14', patientId: 'p-14', clinicId: 'clinic-3', doctorId: 'doc-1', date: today, time: '10:00', status: 'completed', type: 'new', chiefComplaint: 'Migraine', tokenNumber: 1 },
  { id: 'apt-15', patientId: 'p-15', clinicId: 'clinic-3', doctorId: 'doc-1', date: today, time: '10:30', status: 'waiting', type: 'follow-up', chiefComplaint: 'COPD management', tokenNumber: 2 },
  { id: 'apt-16', patientId: 'p-16', clinicId: 'clinic-3', doctorId: 'doc-1', date: today, time: '11:00', status: 'scheduled', type: 'new', chiefComplaint: 'Anemia evaluation', tokenNumber: 3 },
  { id: 'apt-17', patientId: 'p-17', clinicId: 'clinic-3', doctorId: 'doc-1', date: today, time: '11:30', status: 'scheduled', type: 'follow-up', chiefComplaint: 'Liver function review', tokenNumber: 4 },
];

// ── Sample Vitals ──
export const sampleVitals: Vitals = {
  bp: '130/85',
  pulse: '78',
  temp: '98.6',
  spo2: '97',
  weight: '82',
  height: '175',
  bmi: '26.8',
  respiratoryRate: '18',
};

// ── Diagnosis Library ──
export const diagnosisLibrary: Diagnosis[] = [
  { id: 'dx-1', code: 'E11.9', name: 'Type 2 Diabetes Mellitus', isPrimary: false },
  { id: 'dx-2', code: 'I10', name: 'Essential Hypertension', isPrimary: false },
  { id: 'dx-3', code: 'J45.9', name: 'Bronchial Asthma', isPrimary: false },
  { id: 'dx-4', code: 'K29.7', name: 'Gastritis, Unspecified', isPrimary: false },
  { id: 'dx-5', code: 'M54.5', name: 'Low Back Pain', isPrimary: false },
  { id: 'dx-6', code: 'G43.9', name: 'Migraine, Unspecified', isPrimary: false },
  { id: 'dx-7', code: 'J44.1', name: 'COPD with Acute Exacerbation', isPrimary: false },
  { id: 'dx-8', code: 'D64.9', name: 'Anemia, Unspecified', isPrimary: false },
  { id: 'dx-9', code: 'R10.9', name: 'Unspecified Abdominal Pain', isPrimary: false },
  { id: 'dx-10', code: 'N39.0', name: 'Urinary Tract Infection', isPrimary: false },
  { id: 'dx-11', code: 'E03.9', name: 'Hypothyroidism, Unspecified', isPrimary: false },
  { id: 'dx-12', code: 'J06.9', name: 'Upper Respiratory Infection', isPrimary: false },
  { id: 'dx-13', code: 'L30.9', name: 'Dermatitis, Unspecified', isPrimary: false },
  { id: 'dx-14', code: 'R51', name: 'Headache', isPrimary: false },
  { id: 'dx-15', code: 'I25.10', name: 'Ischemic Heart Disease', isPrimary: false },
];

// ── Medication Library ──
export const medicationLibrary: Medication[] = [
  { id: 'med-1', name: 'Metformin 500mg', nameUrdu: 'میٹفارمن ۵۰۰ ملی گرام', generic: 'Metformin HCl', strength: '500mg', form: 'Tablet', route: 'Oral', frequency: 'Twice daily', frequencyUrdu: 'دن میں دو بار', duration: '30 days', durationUrdu: '۳۰ دن', instructions: 'Take after meals', instructionsUrdu: 'کھانے کے بعد لیں' },
  { id: 'med-2', name: 'Amlodipine 5mg', nameUrdu: 'املوڈپین ۵ ملی گرام', generic: 'Amlodipine Besylate', strength: '5mg', form: 'Tablet', route: 'Oral', frequency: 'Once daily', frequencyUrdu: 'دن میں ایک بار', duration: '30 days', durationUrdu: '۳۰ دن', instructions: 'Take in the morning', instructionsUrdu: 'صبح لیں' },
  { id: 'med-3', name: 'Omeprazole 20mg', nameUrdu: 'اومیپرازول ۲۰ ملی گرام', generic: 'Omeprazole', strength: '20mg', form: 'Capsule', route: 'Oral', frequency: 'Once daily', frequencyUrdu: 'دن میں ایک بار', duration: '14 days', durationUrdu: '۱۴ دن', instructions: 'Take before breakfast on empty stomach', instructionsUrdu: 'ناشتے سے پہلے خالی پیٹ لیں' },
  { id: 'med-4', name: 'Paracetamol 500mg', nameUrdu: 'پیراسیٹامول ۵۰۰ ملی گرام', generic: 'Acetaminophen', strength: '500mg', form: 'Tablet', route: 'Oral', frequency: 'Three times daily', frequencyUrdu: 'دن میں تین بار', duration: '5 days', durationUrdu: '۵ دن', instructions: 'Take when needed for fever/pain', instructionsUrdu: 'بخار یا درد ہونے پر لیں' },
  { id: 'med-5', name: 'Azithromycin 500mg', nameUrdu: 'ازیتھرومائسن ۵۰۰ ملی گرام', generic: 'Azithromycin', strength: '500mg', form: 'Tablet', route: 'Oral', frequency: 'Once daily', frequencyUrdu: 'دن میں ایک بار', duration: '3 days', durationUrdu: '۳ دن', instructions: 'Complete the full course', instructionsUrdu: 'پوری خوراک مکمل کریں' },
  { id: 'med-6', name: 'Salbutamol Inhaler', nameUrdu: 'سالبیوٹامول انہیلر', generic: 'Salbutamol', strength: '100mcg', form: 'Inhaler', route: 'Inhalation', frequency: 'As needed', frequencyUrdu: 'ضرورت کے مطابق', duration: '30 days', durationUrdu: '۳۰ دن', instructions: '2 puffs when short of breath', instructionsUrdu: 'سانس تنگ ہونے پر ۲ پف لیں' },
  { id: 'med-7', name: 'Losartan 50mg', nameUrdu: 'لوسارٹن ۵۰ ملی گرام', generic: 'Losartan Potassium', strength: '50mg', form: 'Tablet', route: 'Oral', frequency: 'Once daily', frequencyUrdu: 'دن میں ایک بار', duration: '30 days', durationUrdu: '۳۰ دن', instructions: 'Take at bedtime', instructionsUrdu: 'سونے سے پہلے لیں' },
  { id: 'med-8', name: 'Cetirizine 10mg', nameUrdu: 'سیٹریزین ۱۰ ملی گرام', generic: 'Cetirizine HCl', strength: '10mg', form: 'Tablet', route: 'Oral', frequency: 'Once daily', frequencyUrdu: 'دن میں ایک بار', duration: '7 days', durationUrdu: '۷ دن', instructions: 'Take at night', instructionsUrdu: 'رات کو لیں' },
  { id: 'med-9', name: 'Diclofenac 50mg', nameUrdu: 'ڈائکلوفینک ۵۰ ملی گرام', generic: 'Diclofenac Sodium', strength: '50mg', form: 'Tablet', route: 'Oral', frequency: 'Twice daily', frequencyUrdu: 'دن میں دو بار', duration: '5 days', durationUrdu: '۵ دن', instructions: 'Take after meals, avoid empty stomach', instructionsUrdu: 'کھانے کے بعد لیں، خالی پیٹ نہ لیں' },
  { id: 'med-10', name: 'Iron + Folic Acid', nameUrdu: 'آئرن + فولک ایسڈ', generic: 'Ferrous Sulfate + Folic Acid', strength: '200mg+0.4mg', form: 'Tablet', route: 'Oral', frequency: 'Once daily', frequencyUrdu: 'دن میں ایک بار', duration: '90 days', durationUrdu: '۹۰ دن', instructions: 'Take on empty stomach with vitamin C', instructionsUrdu: 'خالی پیٹ وٹامن سی کے ساتھ لیں' },
];

// ── Previous Clinical Notes ──
export const previousNotes: ClinicalNote[] = [
  {
    id: 'note-1', patientId: 'p-1', clinicId: 'clinic-1', doctorId: 'doc-1', date: '2026-03-15',
    chiefComplaint: 'Diabetes follow-up, increased thirst',
    hpi: 'Patient reports increased thirst and frequent urination for 2 weeks. Has been compliant with Metformin.',
    pastHistory: 'Type 2 DM diagnosed 3 years ago. No surgical history.',
    allergies: 'No known drug allergies',
    examination: 'General: Alert, oriented. CVS: S1S2 normal. Chest: Clear bilateral.',
    assessment: 'Uncontrolled Type 2 DM. Need to adjust medications.',
    plan: 'Increase Metformin to 1000mg BD. Add Glimepiride 2mg OD. Recheck HbA1c in 3 months.',
    instructions: 'Strict diet control. Regular exercise 30 min daily. Monitor blood sugar at home.',
    followUp: '3 months',
    vitals: { bp: '125/80', pulse: '76', temp: '98.4', spo2: '98', weight: '84', height: '175', bmi: '27.4', respiratoryRate: '16' },
    diagnoses: [{ id: 'dx-1', code: 'E11.9', name: 'Type 2 Diabetes Mellitus', isPrimary: true }],
    medications: [
      { ...medicationLibrary[0], id: 'rx-1-1' },
    ],
    labOrders: [
      { id: 'lab-1', testName: 'HbA1c', category: 'Biochemistry', priority: 'routine', status: 'resulted', result: '8.2%', date: '2026-03-15' },
      { id: 'lab-2', testName: 'Fasting Blood Glucose', category: 'Biochemistry', priority: 'routine', status: 'resulted', result: '185 mg/dL', date: '2026-03-15' },
    ],
    procedures: [],
    status: 'completed',
  },
  {
    id: 'note-2', patientId: 'p-3', clinicId: 'clinic-1', doctorId: 'doc-1', date: '2026-03-20',
    chiefComplaint: 'Chest heaviness and breathlessness on exertion',
    hpi: 'Patient complains of chest heaviness for 1 week, worsens on climbing stairs. Associated with mild breathlessness.',
    pastHistory: 'Hypertension for 5 years. Smoker 20 pack-years. No DM.',
    allergies: 'Allergic to Sulfa drugs',
    examination: 'BP 145/95. CVS: S1S2 normal, no murmur. Chest: Bilateral rhonchi present.',
    assessment: 'Rule out IHD. Uncontrolled hypertension. COPD features.',
    plan: 'ECG stat. Cardiac enzymes. CXR PA view. Start Amlodipine 5mg. Refer to cardiologist if ECG abnormal.',
    instructions: 'Stop smoking immediately. Low salt diet. Avoid strenuous activity until evaluation complete.',
    followUp: '1 week',
    vitals: { bp: '145/95', pulse: '88', temp: '98.6', spo2: '94', weight: '78', height: '170', bmi: '27.0', respiratoryRate: '22' },
    diagnoses: [
      { id: 'dx-2', code: 'I10', name: 'Essential Hypertension', isPrimary: true },
      { id: 'dx-15', code: 'I25.10', name: 'Ischemic Heart Disease', isPrimary: false },
    ],
    medications: [
      { ...medicationLibrary[1], id: 'rx-2-1' },
    ],
    labOrders: [
      { id: 'lab-3', testName: 'ECG', category: 'Cardiology', priority: 'urgent', status: 'resulted', result: 'ST depression V4-V6', date: '2026-03-20' },
      { id: 'lab-4', testName: 'Troponin I', category: 'Biochemistry', priority: 'stat', status: 'resulted', result: '0.02 ng/mL (Normal)', date: '2026-03-20' },
      { id: 'lab-5', testName: 'Chest X-Ray PA', category: 'Radiology', priority: 'routine', status: 'resulted', result: 'Mild cardiomegaly. Clear lung fields.', date: '2026-03-20' },
    ],
    procedures: [],
    status: 'completed',
  },
  {
    id: 'note-3', patientId: 'p-5', clinicId: 'clinic-1', doctorId: 'doc-1', date: '2026-03-10',
    chiefComplaint: 'Severe joint pain in both knees',
    hpi: 'Progressive bilateral knee pain for 6 months. Worse in the morning and after sitting for long. Stiffness for ~30 min in morning.',
    pastHistory: 'Osteoarthritis diagnosed 2 years ago. Takes Diclofenac PRN.',
    allergies: 'NKDA',
    examination: 'Knee: Bilateral crepitus. Mild effusion right knee. ROM limited.',
    assessment: 'Bilateral Knee Osteoarthritis - progressive.',
    plan: 'X-Ray both knees AP/Lateral. Switch to Etoricoxib 60mg. Physiotherapy referral.',
    instructions: 'Weight reduction advised. Use knee cap. Avoid squatting and sitting cross-legged.',
    followUp: '2 weeks',
    vitals: { bp: '135/85', pulse: '72', temp: '98.2', spo2: '97', weight: '90', height: '168', bmi: '31.9', respiratoryRate: '16' },
    diagnoses: [{ id: 'dx-5', code: 'M54.5', name: 'Low Back Pain', isPrimary: true }],
    medications: [{ ...medicationLibrary[8], id: 'rx-3-1' }],
    labOrders: [],
    procedures: [],
    status: 'completed',
  },
  {
    id: 'note-4', patientId: 'p-2', clinicId: 'clinic-1', doctorId: 'doc-1', date: '2026-03-25',
    chiefComplaint: 'Recurrent headaches for 2 months',
    hpi: 'Throbbing unilateral headache, 2-3 episodes per week. Associated with nausea and photophobia. No aura.',
    pastHistory: 'No significant past history.',
    allergies: 'NKDA',
    examination: 'Neuro: Cranial nerves intact. No papilledema. No focal deficits.',
    assessment: 'Migraine without aura.',
    plan: 'Start Propranolol 20mg BD for prophylaxis. Sumatriptan 50mg PRN for acute attacks.',
    instructions: 'Maintain headache diary. Avoid triggers: bright lights, stress, irregular sleep.',
    followUp: '1 month',
    vitals: { bp: '110/70', pulse: '68', temp: '98.4', spo2: '99', weight: '58', height: '160', bmi: '22.7', respiratoryRate: '14' },
    diagnoses: [{ id: 'dx-6', code: 'G43.9', name: 'Migraine, Unspecified', isPrimary: true }],
    medications: [{ ...medicationLibrary[3], id: 'rx-4-1' }],
    labOrders: [],
    procedures: [],
    status: 'completed',
  },
  {
    id: 'note-5', patientId: 'p-4', clinicId: 'clinic-1', doctorId: 'doc-1', date: '2026-03-28',
    chiefComplaint: 'Blood pressure monitoring',
    hpi: 'Patient on Amlodipine 5mg for 6 months. BP has been borderline. No symptoms of end-organ damage.',
    pastHistory: 'Hypertension diagnosed 1 year ago.',
    allergies: 'NKDA',
    examination: 'CVS: Normal. Fundoscopy: No hypertensive changes.',
    assessment: 'Essential Hypertension - partially controlled.',
    plan: 'Add Losartan 50mg OD. Continue Amlodipine. Recheck BP in 2 weeks.',
    instructions: 'Low sodium diet. Regular BP monitoring at home. Regular walking 30 minutes.',
    followUp: '2 weeks',
    vitals: { bp: '140/90', pulse: '74', temp: '98.6', spo2: '98', weight: '65', height: '162', bmi: '24.8', respiratoryRate: '16' },
    diagnoses: [{ id: 'dx-2', code: 'I10', name: 'Essential Hypertension', isPrimary: true }],
    medications: [
      { ...medicationLibrary[1], id: 'rx-5-1' },
      { ...medicationLibrary[6], id: 'rx-5-2' },
    ],
    labOrders: [
      { id: 'lab-6', testName: 'Renal Function Tests', category: 'Biochemistry', priority: 'routine', status: 'resulted', result: 'Creatinine 0.9, BUN 15 (Normal)', date: '2026-03-28' },
      { id: 'lab-7', testName: 'Serum Electrolytes', category: 'Biochemistry', priority: 'routine', status: 'resulted', result: 'Na 140, K 4.2 (Normal)', date: '2026-03-28' },
    ],
    procedures: [],
    status: 'completed',
  },
];

// ── Favorite Diagnoses ──
export const favoriteDiagnoses = ['dx-1', 'dx-2', 'dx-3', 'dx-4', 'dx-12'];
export const favoriteMedications = ['med-1', 'med-2', 'med-3', 'med-4', 'med-5'];

// ── Helper functions ──
export function getPatient(id: string) {
  return patients.find(p => p.id === id);
}

export function getClinic(id: string) {
  return clinics.find(c => c.id === id);
}

export function getAppointmentsForClinic(clinicId: string) {
  return appointments.filter(a => a.clinicId === clinicId);
}

export function getPatientNotes(patientId: string) {
  return previousNotes.filter(n => n.patientId === patientId);
}

export function addWalkInPatient(
  data: { name: string; phone: string; age: string; gender: string; cnic: string; address: string; bloodGroup: string; emergencyContact: string; chiefComplaint: string },
  clinicId: string
): string {
  const patientId = `p-walkin-${Date.now()}`;
  const mrn = `MRN-${Date.now().toString().slice(-8)}`;
  const today = getLocalDateKey();

  const newPatient: Patient = {
    id: patientId,
    mrn,
    name: data.name,
    phone: data.phone,
    age: parseInt(data.age) || 0,
    gender: data.gender as 'Male' | 'Female',
    cnic: data.cnic || '',
    address: data.address || '',
    bloodGroup: data.bloodGroup || '',
    emergencyContact: data.emergencyContact || '',
  };
  patients.push(newPatient);

  const clinicApts = appointments.filter(a => a.clinicId === clinicId);
  const nextToken = clinicApts.length > 0 ? Math.max(...clinicApts.map(a => a.tokenNumber)) + 1 : 1;
  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  const newAppointment: Appointment = {
    id: `apt-walkin-${Date.now()}`,
    patientId,
    clinicId,
    doctorId: 'doc-1',
    date: today,
    time: timeStr,
    status: 'waiting',
    type: 'new',
    chiefComplaint: data.chiefComplaint || 'Walk-in',
    tokenNumber: nextToken,
  };
  appointments.push(newAppointment);

  return patientId;
}
