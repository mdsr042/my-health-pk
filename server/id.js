import crypto from 'node:crypto';

export const ID_PREFIXES = {
  user: 'usr',
  users: 'usr',
  doctor_profile: 'dr',
  doctor_profiles: 'dr',
  workspace: 'ws',
  workspaces: 'ws',
  workspace_member: 'wm',
  workspace_members: 'wm',
  member: 'wm',
  subscription: 'sub',
  subscriptions: 'sub',
  approval: 'apr',
  approval_request: 'apr',
  approval_requests: 'apr',
  admin_audit_log: 'aal',
  admin_audit_logs: 'aal',
  medication_favorite: 'mfv',
  medication_favorites: 'mfv',
  clinic: 'cl',
  clinics: 'cl',
  patient: 'pt',
  patients: 'pt',
  appointment: 'apt',
  appointments: 'apt',
  draft: 'cd',
  consultation_draft: 'cd',
  consultation_drafts: 'cd',
  note: 'cn',
  clinical_note: 'cn',
  clinical_notes: 'cn',
  diagnosis: 'dx',
  diagnoses: 'dx',
  medication: 'med',
  medications: 'med',
  lab_order: 'lab',
  lab_orders: 'lab',
  lab: 'lab',
  setting: 'wst',
  workspace_setting: 'wst',
  workspace_settings: 'wst',
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
  return typeof value === 'string' && value.startsWith(`${getIdPrefix(entity)}_`);
}
