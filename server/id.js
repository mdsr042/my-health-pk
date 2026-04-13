import crypto from 'node:crypto';

export const ID_PREFIXES = {
  user: 'user',
  users: 'user',
  doctor_profile: 'docprof',
  doctor_profiles: 'docprof',
  workspace: 'workspace',
  workspaces: 'workspace',
  workspace_member: 'workmem',
  workspace_members: 'workmem',
  member: 'workmem',
  subscription: 'subscr',
  subscriptions: 'subscr',
  approval: 'approval',
  approval_request: 'approval',
  approval_requests: 'approval',
  admin_audit_log: 'auditlog',
  admin_audit_logs: 'auditlog',
  medication_favorite: 'medfav',
  medication_favorites: 'medfav',
  medication_preference: 'medpref',
  medication_preferences: 'medpref',
  treatment_template: 'treattemp',
  treatment_templates: 'treattemp',
  diagnosis_set: 'diagset',
  diagnosis_sets: 'diagset',
  investigation_set: 'invset',
  investigation_sets: 'invset',
  advice_template: 'advtemp',
  advice_templates: 'advtemp',
  clinic: 'clinic',
  clinics: 'clinic',
  patient: 'patient',
  patients: 'patient',
  appointment: 'appt',
  appointments: 'appt',
  draft: 'condraft',
  consultation_draft: 'condraft',
  consultation_drafts: 'condraft',
  note: 'clinote',
  clinical_note: 'clinote',
  clinical_notes: 'clinote',
  diagnosis: 'diag',
  diagnoses: 'diag',
  medication: 'med',
  medications: 'med',
  lab_order: 'labord',
  lab_orders: 'labord',
  lab: 'labord',
  setting: 'workset',
  workspace_setting: 'workset',
  workspace_settings: 'workset',
};

export const LEGACY_ID_PREFIXES = {
  user: ['usr'],
  users: ['usr'],
  doctor_profile: ['dr'],
  doctor_profiles: ['dr'],
  workspace: ['ws'],
  workspaces: ['ws'],
  workspace_member: ['wm'],
  workspace_members: ['wm'],
  member: ['wm'],
  subscription: ['sub'],
  subscriptions: ['sub'],
  approval: ['apr'],
  approval_request: ['apr'],
  approval_requests: ['apr'],
  admin_audit_log: ['aal'],
  admin_audit_logs: ['aal'],
  medication_favorite: ['mfv'],
  medication_favorites: ['mfv'],
  medication_preference: ['mpr'],
  medication_preferences: ['mpr'],
  treatment_template: ['ttm'],
  treatment_templates: ['ttm'],
  diagnosis_set: ['dgs'],
  diagnosis_sets: ['dgs'],
  investigation_set: ['ivs'],
  investigation_sets: ['ivs'],
  advice_template: ['adt'],
  advice_templates: ['adt'],
  clinic: ['cl'],
  clinics: ['cl'],
  patient: ['pt'],
  patients: ['pt'],
  appointment: ['apt'],
  appointments: ['apt'],
  draft: ['cd'],
  consultation_draft: ['cd'],
  consultation_drafts: ['cd'],
  note: ['cn'],
  clinical_note: ['cn'],
  clinical_notes: ['cn'],
  diagnosis: ['dx'],
  diagnoses: ['dx'],
  medication: ['med'],
  medications: ['med'],
  lab_order: ['lab'],
  lab_orders: ['lab'],
  lab: ['lab'],
  setting: ['wst'],
  workspace_setting: ['wst'],
  workspace_settings: ['wst'],
};

export function getIdPrefix(entity) {
  const prefix = ID_PREFIXES[entity];
  if (!prefix) {
    throw new Error(`Unknown ID entity: ${entity}`);
  }

  return prefix;
}

export function createId(entity) {
  return `${getIdPrefix(entity)}_${crypto.randomUUID()}`;
}

export function hasExpectedPrefix(value, entity) {
  if (typeof value !== 'string') return false;

  const prefixes = [getIdPrefix(entity), ...(LEGACY_ID_PREFIXES[entity] ?? [])];
  return prefixes.some(prefix => value.startsWith(`${prefix}_`));
}
