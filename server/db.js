import bcrypt from 'bcryptjs';
import pg from 'pg';
import { cleanupExpiredDemoSessions } from './demoSeed.js';
import { createId, hasExpectedPrefix } from './id.js';

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

async function createBaseSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('platform_admin', 'doctor_owner')),
      status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'rejected', 'suspended')),
      is_demo BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS doctor_profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      pmc_number TEXT NOT NULL DEFAULT '',
      specialization TEXT NOT NULL DEFAULT '',
      qualifications TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'rejected', 'suspended')),
      is_demo BOOLEAN NOT NULL DEFAULT FALSE,
      demo_expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS workspace_members (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('owner')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      target_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS medication_favorites (
      id TEXT PRIMARY KEY,
      doctor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      registration_no TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (doctor_user_id, registration_no)
    );

    CREATE TABLE IF NOT EXISTS medication_preferences (
      id TEXT PRIMARY KEY,
      doctor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      medication_key TEXT NOT NULL,
      registration_no TEXT NOT NULL DEFAULT '',
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (doctor_user_id, medication_key)
    );

    CREATE TABLE IF NOT EXISTS treatment_templates (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      doctor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      condition_label TEXT NOT NULL DEFAULT '',
      chief_complaint TEXT NOT NULL DEFAULT '',
      instructions TEXT NOT NULL DEFAULT '',
      follow_up TEXT NOT NULL DEFAULT '',
      diagnoses JSONB NOT NULL DEFAULT '[]'::jsonb,
      medications JSONB NOT NULL DEFAULT '[]'::jsonb,
      lab_orders JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
      id TEXT PRIMARY KEY,
      appointment_id TEXT UNIQUE REFERENCES appointments(id) ON DELETE SET NULL,
      patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
      doctor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      payload JSONB NOT NULL,
      saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS clinical_notes (
      id TEXT PRIMARY KEY,
      appointment_id TEXT REFERENCES appointments(id) ON DELETE SET NULL,
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
      status TEXT NOT NULL DEFAULT 'completed',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS diagnoses (
      id TEXT PRIMARY KEY,
      note_id TEXT NOT NULL REFERENCES clinical_notes(id) ON DELETE CASCADE,
      code TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      is_primary BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
      dose_pattern TEXT NOT NULL DEFAULT '',
      frequency TEXT NOT NULL DEFAULT '',
      frequency_urdu TEXT NOT NULL DEFAULT '',
      duration TEXT NOT NULL DEFAULT '',
      duration_urdu TEXT NOT NULL DEFAULT '',
      instructions TEXT NOT NULL DEFAULT '',
      instructions_urdu TEXT NOT NULL DEFAULT '',
      diagnosis_id TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS lab_orders (
      id TEXT PRIMARY KEY,
      note_id TEXT NOT NULL REFERENCES clinical_notes(id) ON DELETE CASCADE,
      test_name TEXT NOT NULL,
      category TEXT NOT NULL,
      priority TEXT NOT NULL CHECK (priority IN ('routine', 'urgent', 'stat')),
      status TEXT NOT NULL CHECK (status IN ('ordered', 'collected', 'resulted')),
      result TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function hasColumn(client, tableName, columnName) {
  const { rows } = await client.query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
      LIMIT 1
    `,
    [tableName, columnName]
  );

  return rows.length > 0;
}

async function getPrimaryKeyInfo(client, tableName) {
  const { rows } = await client.query(
    `
      SELECT
        con.conname,
        array_agg(attr.attname ORDER BY attr.attnum) AS columns
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      JOIN unnest(con.conkey) AS keynum(attnum) ON TRUE
      JOIN pg_attribute attr ON attr.attrelid = rel.oid AND attr.attnum = keynum.attnum
      WHERE nsp.nspname = 'public'
        AND rel.relname = $1
        AND con.contype = 'p'
      GROUP BY con.conname
      LIMIT 1
    `,
    [tableName]
  );

  return rows[0] ?? null;
}

async function ensurePrimaryKeyOnId(client, tableName) {
  const primaryKey = await getPrimaryKeyInfo(client, tableName);
  if (primaryKey && !(primaryKey.columns.length === 1 && primaryKey.columns[0] === 'id')) {
    await client.query(`ALTER TABLE ${tableName} DROP CONSTRAINT IF EXISTS ${primaryKey.conname}`);
  }

  const refreshedPrimaryKey = await getPrimaryKeyInfo(client, tableName);
  if (!refreshedPrimaryKey) {
    await client.query(`ALTER TABLE ${tableName} ADD PRIMARY KEY (id)`);
  }
}

async function ensureUniqueConstraint(client, tableName, constraintName, columnsSql) {
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = 'public'
          AND rel.relname = '${tableName}'
          AND con.conname = '${constraintName}'
      ) THEN
        ALTER TABLE ${tableName}
        ADD CONSTRAINT ${constraintName} UNIQUE ${columnsSql};
      END IF;
    END $$;
  `);
}

async function ensureForeignKey(client, tableName, constraintName, columnName, refTable, refColumn, onDeleteClause) {
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = 'public'
          AND rel.relname = '${tableName}'
          AND con.conname = '${constraintName}'
      ) THEN
        ALTER TABLE ${tableName}
        ADD CONSTRAINT ${constraintName}
        FOREIGN KEY (${columnName}) REFERENCES ${refTable}(${refColumn}) ON DELETE ${onDeleteClause};
      END IF;
    END $$;
  `);
}

async function ensureIndex(client, indexName, tableName, expression) {
  await client.query(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName} ${expression}`);
}

async function dropForeignKeysForColumns(client, tableName, columnNames) {
  const { rows } = await client.query(
    `
      SELECT DISTINCT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      JOIN unnest(con.conkey) AS keynum(attnum) ON TRUE
      JOIN pg_attribute attr ON attr.attrelid = rel.oid AND attr.attnum = keynum.attnum
      WHERE nsp.nspname = 'public'
        AND rel.relname = $1
        AND con.contype = 'f'
        AND attr.attname = ANY($2::text[])
    `,
    [tableName, columnNames]
  );

  for (const row of rows) {
    await client.query(`ALTER TABLE ${tableName} DROP CONSTRAINT IF EXISTS ${row.conname}`);
  }
}

async function dropUniqueConstraintsForColumns(client, tableName, columnNames) {
  const { rows } = await client.query(
    `
      SELECT DISTINCT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      JOIN unnest(con.conkey) AS keynum(attnum) ON TRUE
      JOIN pg_attribute attr ON attr.attrelid = rel.oid AND attr.attnum = keynum.attnum
      WHERE nsp.nspname = 'public'
        AND rel.relname = $1
        AND con.contype = 'u'
        AND attr.attname = ANY($2::text[])
    `,
    [tableName, columnNames]
  );

  for (const row of rows) {
    await client.query(`ALTER TABLE ${tableName} DROP CONSTRAINT IF EXISTS ${row.conname}`);
  }
}

async function ensureAuditColumns(client, tableName, options = {}) {
  const { createdSource = null, updatedSource = null } = options;

  await client.query(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ`);
  await client.query(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`);

  if (createdSource) {
    await client.query(`UPDATE ${tableName} SET created_at = COALESCE(created_at, ${createdSource}, NOW())`);
  } else {
    await client.query(`UPDATE ${tableName} SET created_at = COALESCE(created_at, NOW())`);
  }

  if (updatedSource) {
    await client.query(`UPDATE ${tableName} SET updated_at = COALESCE(updated_at, ${updatedSource}, NOW())`);
  } else {
    await client.query(`UPDATE ${tableName} SET updated_at = COALESCE(updated_at, created_at, NOW())`);
  }

  await client.query(`ALTER TABLE ${tableName} ALTER COLUMN created_at SET DEFAULT NOW()`);
  await client.query(`ALTER TABLE ${tableName} ALTER COLUMN updated_at SET DEFAULT NOW()`);
  await client.query(`ALTER TABLE ${tableName} ALTER COLUMN created_at SET NOT NULL`);
  await client.query(`ALTER TABLE ${tableName} ALTER COLUMN updated_at SET NOT NULL`);
}

async function ensureOwnedIdTable(client, config) {
  const {
    tableName,
    entity,
    uniqueColumn,
    createdSource = null,
    updatedSource = null,
  } = config;

  await client.query(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS id TEXT`);
  await ensureAuditColumns(client, tableName, { createdSource, updatedSource });

  const { rows } = await client.query(`SELECT ${uniqueColumn}, id FROM ${tableName}`);
  for (const row of rows) {
    if (!hasExpectedPrefix(row.id, entity)) {
      await client.query(
        `
          UPDATE ${tableName}
          SET id = $2, updated_at = NOW()
          WHERE ${uniqueColumn} = $1
        `,
        [row[uniqueColumn], createId(entity)]
      );
    }
  }

  await client.query(`ALTER TABLE ${tableName} ALTER COLUMN id SET NOT NULL`);
  await ensurePrimaryKeyOnId(client, tableName);
  await ensureUniqueConstraint(client, tableName, `${tableName}_${uniqueColumn}_key`, `(${uniqueColumn})`);
}

async function updateColumnValue(client, tableName, columnName, oldId, newId) {
  const hasUpdated = await hasColumn(client, tableName, 'updated_at');
  if (hasUpdated) {
    await client.query(
      `UPDATE ${tableName} SET ${columnName} = $1, updated_at = NOW() WHERE ${columnName} = $2`,
      [newId, oldId]
    );
    return;
  }

  await client.query(`UPDATE ${tableName} SET ${columnName} = $1 WHERE ${columnName} = $2`, [newId, oldId]);
}

async function remapPrimaryIds(client, config) {
  const { tableName, entity, references = [] } = config;
  const { rows } = await client.query(`SELECT id FROM ${tableName}`);
  const mappings = rows
    .filter(row => !hasExpectedPrefix(row.id, entity))
    .map(row => ({ oldId: row.id, newId: createId(entity) }));

  if (mappings.length === 0) {
    return;
  }

  for (const reference of references) {
    await dropForeignKeysForColumns(client, reference.tableName, [reference.columnName]);
  }

  for (const mapping of mappings) {
    for (const reference of references) {
      await updateColumnValue(client, reference.tableName, reference.columnName, mapping.oldId, mapping.newId);
    }

    await updateColumnValue(client, tableName, 'id', mapping.oldId, mapping.newId);
  }

  for (const reference of references) {
    await ensureForeignKey(
      client,
      reference.tableName,
      reference.constraintName,
      reference.columnName,
      tableName,
      'id',
      reference.onDelete
    );
  }
}

async function runMigration(client, id, handler) {
  const existing = await client.query(`SELECT 1 FROM schema_migrations WHERE id = $1 LIMIT 1`, [id]);
  if (existing.rowCount > 0) {
    return;
  }

  await handler();
  await client.query(`INSERT INTO schema_migrations (id) VALUES ($1)`, [id]);
}

async function runSchemaMigrations(client) {
  await runMigration(client, '001_owned_ids_and_audit_fields', async () => {
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE`);
    await client.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE`);
    await client.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS demo_expires_at TIMESTAMPTZ`);

    await ensureAuditColumns(client, 'doctor_profiles');
    await ensureAuditColumns(client, 'workspace_members');
    await ensureAuditColumns(client, 'approval_requests');
    await ensureAuditColumns(client, 'patients');
    await ensureAuditColumns(client, 'clinical_notes', { createdSource: 'date', updatedSource: 'date' });
    await ensureAuditColumns(client, 'diagnoses');
    await ensureAuditColumns(client, 'medications');
    await ensureAuditColumns(client, 'lab_orders');
    await ensureAuditColumns(client, 'medication_favorites');
    await ensureAuditColumns(client, 'medication_preferences');

    await ensureOwnedIdTable(client, {
      tableName: 'doctor_profiles',
      entity: 'doctor_profile',
      uniqueColumn: 'user_id',
    });

    await ensureOwnedIdTable(client, {
      tableName: 'workspace_settings',
      entity: 'workspace_setting',
      uniqueColumn: 'workspace_id',
    });

    await ensureOwnedIdTable(client, {
      tableName: 'consultation_drafts',
      entity: 'consultation_draft',
      uniqueColumn: 'patient_id',
      createdSource: 'saved_at',
      updatedSource: 'saved_at',
    });
  });

  await runMigration(client, '002_standardize_prefixed_ids', async () => {
    await remapPrimaryIds(client, {
      tableName: 'users',
      entity: 'user',
      references: [
        { tableName: 'doctor_profiles', columnName: 'user_id', constraintName: 'doctor_profiles_user_id_fkey', onDelete: 'CASCADE' },
        { tableName: 'workspaces', columnName: 'owner_user_id', constraintName: 'workspaces_owner_user_id_fkey', onDelete: 'CASCADE' },
        { tableName: 'workspace_members', columnName: 'user_id', constraintName: 'workspace_members_user_id_fkey', onDelete: 'CASCADE' },
        { tableName: 'approval_requests', columnName: 'user_id', constraintName: 'approval_requests_user_id_fkey', onDelete: 'CASCADE' },
        { tableName: 'approval_requests', columnName: 'reviewed_by', constraintName: 'approval_requests_reviewed_by_fkey', onDelete: 'SET NULL' },
        { tableName: 'appointments', columnName: 'doctor_user_id', constraintName: 'appointments_doctor_user_id_fkey', onDelete: 'CASCADE' },
        { tableName: 'consultation_drafts', columnName: 'doctor_user_id', constraintName: 'consultation_drafts_doctor_user_id_fkey', onDelete: 'CASCADE' },
        { tableName: 'clinical_notes', columnName: 'doctor_user_id', constraintName: 'clinical_notes_doctor_user_id_fkey', onDelete: 'CASCADE' },
      ],
    });

    await remapPrimaryIds(client, {
      tableName: 'workspaces',
      entity: 'workspace',
      references: [
        { tableName: 'workspace_members', columnName: 'workspace_id', constraintName: 'workspace_members_workspace_id_fkey', onDelete: 'CASCADE' },
        { tableName: 'subscriptions', columnName: 'workspace_id', constraintName: 'subscriptions_workspace_id_fkey', onDelete: 'CASCADE' },
        { tableName: 'approval_requests', columnName: 'workspace_id', constraintName: 'approval_requests_workspace_id_fkey', onDelete: 'CASCADE' },
        { tableName: 'clinics', columnName: 'workspace_id', constraintName: 'clinics_workspace_id_fkey', onDelete: 'CASCADE' },
        { tableName: 'workspace_settings', columnName: 'workspace_id', constraintName: 'workspace_settings_workspace_id_fkey', onDelete: 'CASCADE' },
        { tableName: 'patients', columnName: 'workspace_id', constraintName: 'patients_workspace_id_fkey', onDelete: 'CASCADE' },
        { tableName: 'appointments', columnName: 'workspace_id', constraintName: 'appointments_workspace_id_fkey', onDelete: 'CASCADE' },
        { tableName: 'consultation_drafts', columnName: 'workspace_id', constraintName: 'consultation_drafts_workspace_id_fkey', onDelete: 'CASCADE' },
        { tableName: 'clinical_notes', columnName: 'workspace_id', constraintName: 'clinical_notes_workspace_id_fkey', onDelete: 'CASCADE' },
      ],
    });

    await remapPrimaryIds(client, {
      tableName: 'clinics',
      entity: 'clinic',
      references: [
        { tableName: 'appointments', columnName: 'clinic_id', constraintName: 'appointments_clinic_id_fkey', onDelete: 'CASCADE' },
        { tableName: 'consultation_drafts', columnName: 'clinic_id', constraintName: 'consultation_drafts_clinic_id_fkey', onDelete: 'CASCADE' },
        { tableName: 'clinical_notes', columnName: 'clinic_id', constraintName: 'clinical_notes_clinic_id_fkey', onDelete: 'CASCADE' },
      ],
    });

    await remapPrimaryIds(client, {
      tableName: 'patients',
      entity: 'patient',
      references: [
        { tableName: 'appointments', columnName: 'patient_id', constraintName: 'appointments_patient_id_fkey', onDelete: 'CASCADE' },
        { tableName: 'consultation_drafts', columnName: 'patient_id', constraintName: 'consultation_drafts_patient_id_fkey', onDelete: 'CASCADE' },
        { tableName: 'clinical_notes', columnName: 'patient_id', constraintName: 'clinical_notes_patient_id_fkey', onDelete: 'CASCADE' },
      ],
    });

    await remapPrimaryIds(client, {
      tableName: 'clinical_notes',
      entity: 'clinical_note',
      references: [
        { tableName: 'diagnoses', columnName: 'note_id', constraintName: 'diagnoses_note_id_fkey', onDelete: 'CASCADE' },
        { tableName: 'medications', columnName: 'note_id', constraintName: 'medications_note_id_fkey', onDelete: 'CASCADE' },
        { tableName: 'lab_orders', columnName: 'note_id', constraintName: 'lab_orders_note_id_fkey', onDelete: 'CASCADE' },
      ],
    });

    await remapPrimaryIds(client, { tableName: 'workspace_members', entity: 'workspace_member' });
    await remapPrimaryIds(client, { tableName: 'subscriptions', entity: 'subscription' });
    await remapPrimaryIds(client, { tableName: 'approval_requests', entity: 'approval_request' });
    await remapPrimaryIds(client, {
      tableName: 'appointments',
      entity: 'appointment',
      references: [
        { tableName: 'consultation_drafts', columnName: 'appointment_id', constraintName: 'consultation_drafts_appointment_id_fkey', onDelete: 'SET NULL' },
        { tableName: 'clinical_notes', columnName: 'appointment_id', constraintName: 'clinical_notes_appointment_id_fkey', onDelete: 'SET NULL' },
      ],
    });
    await remapPrimaryIds(client, { tableName: 'doctor_profiles', entity: 'doctor_profile' });
    await remapPrimaryIds(client, { tableName: 'workspace_settings', entity: 'workspace_setting' });
    await remapPrimaryIds(client, { tableName: 'consultation_drafts', entity: 'consultation_draft' });
    await remapPrimaryIds(client, { tableName: 'diagnoses', entity: 'diagnosis' });
    await remapPrimaryIds(client, { tableName: 'medications', entity: 'medication' });
    await remapPrimaryIds(client, { tableName: 'lab_orders', entity: 'lab_order' });
    await remapPrimaryIds(client, { tableName: 'medication_favorites', entity: 'medication_favorite' });
  });

  await runMigration(client, '003_constraints_and_indexes', async () => {
    await ensureUniqueConstraint(client, 'workspace_members', 'workspace_members_workspace_id_user_id_key', '(workspace_id, user_id)');
    await ensureUniqueConstraint(client, 'patients', 'patients_workspace_id_mrn_key', '(workspace_id, mrn)');
    await ensureUniqueConstraint(client, 'doctor_profiles', 'doctor_profiles_user_id_key', '(user_id)');
    await ensureUniqueConstraint(client, 'workspace_settings', 'workspace_settings_workspace_id_key', '(workspace_id)');
    await ensureUniqueConstraint(client, 'consultation_drafts', 'consultation_drafts_appointment_id_key', '(appointment_id)');
    await ensureUniqueConstraint(client, 'medication_favorites', 'medication_favorites_doctor_user_id_registration_no_key', '(doctor_user_id, registration_no)');

    await ensureIndex(client, 'idx_clinics_workspace_id', 'clinics', '(workspace_id)');
    await ensureIndex(client, 'idx_patients_workspace_created', 'patients', '(workspace_id, created_at DESC)');
    await ensureIndex(client, 'idx_appointments_workspace_date_time', 'appointments', '(workspace_id, date, time)');
    await ensureIndex(client, 'idx_notes_workspace_patient_date', 'clinical_notes', '(workspace_id, patient_id, date DESC)');
    await ensureIndex(client, 'idx_approval_requests_status_created', 'approval_requests', '(status, created_at DESC)');
    await ensureIndex(client, 'idx_workspaces_demo_expires_at', 'workspaces', '(demo_expires_at)');
    await ensureIndex(client, 'idx_admin_audit_logs_created', 'admin_audit_logs', '(created_at DESC)');
    await ensureIndex(client, 'idx_medication_favorites_doctor_created', 'medication_favorites', '(doctor_user_id, created_at DESC)');
    await ensureIndex(client, 'idx_medication_preferences_doctor_updated', 'medication_preferences', '(doctor_user_id, updated_at DESC)');
  });

  await runMigration(client, '004_demo_workspace_expiry', async () => {
    await client.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS demo_expires_at TIMESTAMPTZ`);
    await ensureIndex(client, 'idx_workspaces_demo_expires_at', 'workspaces', '(demo_expires_at)');
  });

  await runMigration(client, '005_medication_dose_pattern', async () => {
    await client.query(`ALTER TABLE medications ADD COLUMN IF NOT EXISTS dose_pattern TEXT NOT NULL DEFAULT ''`);
  });

  await runMigration(client, '006_encounter_scoped_drafts_and_notes', async () => {
    await client.query(`ALTER TABLE consultation_drafts ADD COLUMN IF NOT EXISTS appointment_id TEXT`);
    await client.query(`ALTER TABLE clinical_notes ADD COLUMN IF NOT EXISTS appointment_id TEXT`);

    const draftRows = await client.query(
      `
        SELECT id, workspace_id, patient_id, clinic_id
        FROM consultation_drafts
        WHERE appointment_id IS NULL
      `
    );

    for (const row of draftRows.rows) {
      const match = await client.query(
        `
          SELECT id
          FROM appointments
          WHERE workspace_id = $1
            AND patient_id = $2
            AND clinic_id = $3
          ORDER BY
            CASE
              WHEN status IN ('in-consultation', 'waiting', 'scheduled') THEN 0
              WHEN status = 'completed' THEN 1
              ELSE 2
            END,
            date DESC,
            time DESC
          LIMIT 1
        `,
        [row.workspace_id, row.patient_id, row.clinic_id]
      );

      if (match.rowCount > 0) {
        await client.query(
          `UPDATE consultation_drafts SET appointment_id = $2, updated_at = NOW() WHERE id = $1`,
          [row.id, match.rows[0].id]
        );
      }
    }

    const noteRows = await client.query(
      `
        SELECT id, workspace_id, patient_id, clinic_id, date
        FROM clinical_notes
        WHERE appointment_id IS NULL
      `
    );

    for (const row of noteRows.rows) {
      const match = await client.query(
        `
          SELECT id
          FROM appointments
          WHERE workspace_id = $1
            AND patient_id = $2
            AND clinic_id = $3
            AND date = ($4::timestamptz AT TIME ZONE 'UTC')::date::text
          ORDER BY time DESC
          LIMIT 1
        `,
        [row.workspace_id, row.patient_id, row.clinic_id, row.date]
      );

      if (match.rowCount > 0) {
        await client.query(
          `UPDATE clinical_notes SET appointment_id = $2, updated_at = NOW() WHERE id = $1`,
          [row.id, match.rows[0].id]
        );
      }
    }

    await dropUniqueConstraintsForColumns(client, 'consultation_drafts', ['patient_id']);
    await ensureForeignKey(
      client,
      'consultation_drafts',
      'consultation_drafts_appointment_id_fkey',
      'appointment_id',
      'appointments',
      'id',
      'SET NULL'
    );
    await ensureForeignKey(
      client,
      'clinical_notes',
      'clinical_notes_appointment_id_fkey',
      'appointment_id',
      'appointments',
      'id',
      'SET NULL'
    );
    await ensureUniqueConstraint(client, 'consultation_drafts', 'consultation_drafts_appointment_id_key', '(appointment_id)');
  });

  await runMigration(client, '007_doctor_medication_preferences', async () => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS medication_preferences (
        id TEXT PRIMARY KEY,
        doctor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        medication_key TEXT NOT NULL,
        registration_no TEXT NOT NULL DEFAULT '',
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (doctor_user_id, medication_key)
      )
    `);

    await ensureAuditColumns(client, 'medication_preferences');
    await ensureUniqueConstraint(client, 'medication_preferences', 'medication_preferences_doctor_user_id_medication_key_key', '(doctor_user_id, medication_key)');
    await ensureIndex(client, 'idx_medication_preferences_doctor_updated', 'medication_preferences', '(doctor_user_id, updated_at DESC)');
  });

  await runMigration(client, '008_treatment_templates', async () => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS treatment_templates (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        doctor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        condition_label TEXT NOT NULL DEFAULT '',
        chief_complaint TEXT NOT NULL DEFAULT '',
        instructions TEXT NOT NULL DEFAULT '',
        follow_up TEXT NOT NULL DEFAULT '',
        diagnoses JSONB NOT NULL DEFAULT '[]'::jsonb,
        medications JSONB NOT NULL DEFAULT '[]'::jsonb,
        lab_orders JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await ensureAuditColumns(client, 'treatment_templates');
    await ensureIndex(client, 'idx_treatment_templates_doctor_updated', 'treatment_templates', '(doctor_user_id, updated_at DESC)');
    await ensureIndex(client, 'idx_treatment_templates_workspace_doctor', 'treatment_templates', '(workspace_id, doctor_user_id)');
  });
}

export async function initDb() {
  await withTransaction(async client => {
    await createBaseSchema(client);
    await ensureMigrationsTable(client);
    await runSchemaMigrations(client);
  });

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@myhealth.pk';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const existingAdmin = await query('SELECT id FROM users WHERE email = $1 LIMIT 1', [adminEmail]);

  if (existingAdmin.rowCount === 0) {
    await query(
      `
        INSERT INTO users (id, email, password_hash, role, status)
        VALUES ($1, $2, $3, 'platform_admin', 'active')
      `,
      [createId('user'), adminEmail, await bcrypt.hash(adminPassword, 10)]
    );
  }

  await cleanupExpiredDemoSessions({ query });
}
