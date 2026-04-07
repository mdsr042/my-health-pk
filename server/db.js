import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('DATABASE_URL is not set. API routes will fail until PostgreSQL is configured.');
}

export const pool = new Pool(
  connectionString
    ? {
        connectionString,
        ssl: process.env.DATABASE_SSL === 'require' ? { rejectUnauthorized: false } : undefined,
      }
    : undefined
);

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function initDb() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('platform_admin', 'doctor_owner')),
      status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'rejected', 'suspended')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS doctor_profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      pmc_number TEXT NOT NULL DEFAULT '',
      specialization TEXT NOT NULL DEFAULT '',
      qualifications TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'rejected', 'suspended')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS workspace_members (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('owner')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (workspace_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
      plan_name TEXT NOT NULL DEFAULT 'Trial',
      status TEXT NOT NULL CHECK (status IN ('trial', 'active', 'suspended', 'cancelled')),
      trial_ends_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS approval_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      clinic_name TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
      rejection_reason TEXT NOT NULL DEFAULT '',
      reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS clinics (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      location TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      timings TEXT NOT NULL DEFAULT 'By appointment',
      specialties JSONB NOT NULL DEFAULT '[]'::jsonb,
      logo TEXT NOT NULL DEFAULT '🏥',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS workspace_settings (
      workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      mrn TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      age INTEGER NOT NULL DEFAULT 0,
      gender TEXT NOT NULL DEFAULT 'Male',
      cnic TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      blood_group TEXT NOT NULL DEFAULT '',
      emergency_contact TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
      patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      doctor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('scheduled', 'waiting', 'in-consultation', 'completed', 'cancelled', 'no-show')),
      type TEXT NOT NULL CHECK (type IN ('new', 'follow-up')),
      chief_complaint TEXT NOT NULL DEFAULT '',
      token_number INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS consultation_drafts (
      patient_id TEXT PRIMARY KEY REFERENCES patients(id) ON DELETE CASCADE,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
      doctor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      payload JSONB NOT NULL,
      saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS clinical_notes (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
      doctor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      chief_complaint TEXT NOT NULL DEFAULT '',
      hpi TEXT NOT NULL DEFAULT '',
      past_history TEXT NOT NULL DEFAULT '',
      allergies TEXT NOT NULL DEFAULT '',
      examination TEXT NOT NULL DEFAULT '',
      assessment TEXT NOT NULL DEFAULT '',
      plan TEXT NOT NULL DEFAULT '',
      instructions TEXT NOT NULL DEFAULT '',
      follow_up TEXT NOT NULL DEFAULT '',
      vitals JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'completed'
    );

    CREATE TABLE IF NOT EXISTS diagnoses (
      id TEXT PRIMARY KEY,
      note_id TEXT NOT NULL REFERENCES clinical_notes(id) ON DELETE CASCADE,
      code TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      is_primary BOOLEAN NOT NULL DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS medications (
      id TEXT PRIMARY KEY,
      note_id TEXT NOT NULL REFERENCES clinical_notes(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      name_urdu TEXT NOT NULL DEFAULT '',
      generic_name TEXT NOT NULL DEFAULT '',
      strength TEXT NOT NULL DEFAULT '',
      form TEXT NOT NULL DEFAULT '',
      route TEXT NOT NULL DEFAULT '',
      frequency TEXT NOT NULL DEFAULT '',
      frequency_urdu TEXT NOT NULL DEFAULT '',
      duration TEXT NOT NULL DEFAULT '',
      duration_urdu TEXT NOT NULL DEFAULT '',
      instructions TEXT NOT NULL DEFAULT '',
      instructions_urdu TEXT NOT NULL DEFAULT '',
      diagnosis_id TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS lab_orders (
      id TEXT PRIMARY KEY,
      note_id TEXT NOT NULL REFERENCES clinical_notes(id) ON DELETE CASCADE,
      test_name TEXT NOT NULL,
      category TEXT NOT NULL,
      priority TEXT NOT NULL CHECK (priority IN ('routine', 'urgent', 'stat')),
      status TEXT NOT NULL CHECK (status IN ('ordered', 'collected', 'resulted')),
      result TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL
    );
  `);

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@myhealth.pk';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const existingAdmin = await query('SELECT id FROM users WHERE email = $1 LIMIT 1', [adminEmail]);

  if (existingAdmin.rowCount === 0) {
    await query(
      `
        INSERT INTO users (id, email, password_hash, role, status)
        VALUES ($1, $2, $3, 'platform_admin', 'active')
      `,
      [`user_${crypto.randomUUID()}`, adminEmail, await bcrypt.hash(adminPassword, 10)]
    );
  }
}
