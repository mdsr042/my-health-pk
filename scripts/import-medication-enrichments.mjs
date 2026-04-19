import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const { Pool } = pg;

function normalizeKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}%+./ -]+/gu, '')
    .trim();
}

function buildLookupKey(item) {
  const registrationNo = String(item.registrationNo ?? '').trim();
  if (registrationNo) {
    return `reg:${normalizeKey(registrationNo)}`;
  }

  return [
    'fallback',
    normalizeKey(item.brandName),
    normalizeKey(item.genericName),
    normalizeKey(item.strengthText),
    normalizeKey(item.dosageForm),
  ].join('|');
}

function randomId() {
  return `medenrich_${crypto.randomUUID()}`;
}

import crypto from 'node:crypto';

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error('Usage: npm run catalog:import:pk-enrichment -- <path-to-json>');
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to import medication enrichments.');
  }

  const absolutePath = path.resolve(process.cwd(), inputPath);
  const raw = await fs.readFile(absolutePath, 'utf8');
  const parsed = JSON.parse(raw);
  const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed.items) ? parsed.items : [];

  if (items.length === 0) {
    throw new Error('No enrichment items found. Expected an array or an object with an items array.');
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'require' ? { rejectUnauthorized: false } : undefined,
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const item of items) {
      const lookupKey = buildLookupKey(item);
      await client.query(
        `
          INSERT INTO medication_enrichments (
            id,
            registration_no,
            lookup_key,
            brand_name,
            generic_name,
            strength_text,
            dosage_form,
            therapeutic_category,
            drug_category,
            trade_price,
            pack_info,
            indications,
            dosage,
            administration,
            contraindications,
            precautions,
            adverse_effects,
            alternatives_summary,
            source_name,
            source_updated_at,
            enrichment_status
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
            NULLIF($20, '')::timestamptz,
            $21
          )
          ON CONFLICT (lookup_key)
          DO UPDATE SET
            registration_no = EXCLUDED.registration_no,
            brand_name = EXCLUDED.brand_name,
            generic_name = EXCLUDED.generic_name,
            strength_text = EXCLUDED.strength_text,
            dosage_form = EXCLUDED.dosage_form,
            therapeutic_category = EXCLUDED.therapeutic_category,
            drug_category = EXCLUDED.drug_category,
            trade_price = EXCLUDED.trade_price,
            pack_info = EXCLUDED.pack_info,
            indications = EXCLUDED.indications,
            dosage = EXCLUDED.dosage,
            administration = EXCLUDED.administration,
            contraindications = EXCLUDED.contraindications,
            precautions = EXCLUDED.precautions,
            adverse_effects = EXCLUDED.adverse_effects,
            alternatives_summary = EXCLUDED.alternatives_summary,
            source_name = EXCLUDED.source_name,
            source_updated_at = EXCLUDED.source_updated_at,
            enrichment_status = EXCLUDED.enrichment_status,
            updated_at = NOW()
        `,
        [
          randomId(),
          String(item.registrationNo ?? '').trim(),
          lookupKey,
          String(item.brandName ?? '').trim(),
          String(item.genericName ?? '').trim(),
          String(item.strengthText ?? '').trim(),
          String(item.dosageForm ?? '').trim(),
          String(item.therapeuticCategory ?? '').trim(),
          String(item.drugCategory ?? '').trim(),
          String(item.tradePrice ?? '').trim(),
          String(item.packInfo ?? '').trim(),
          String(item.indications ?? '').trim(),
          String(item.dosage ?? '').trim(),
          String(item.administration ?? '').trim(),
          String(item.contraindications ?? '').trim(),
          String(item.precautions ?? '').trim(),
          String(item.adverseEffects ?? '').trim(),
          String(item.alternativesSummary ?? '').trim(),
          String(item.sourceName ?? 'Licensed Pakistan Source').trim(),
          item.sourceUpdatedAt ?? '',
          String(item.enrichmentStatus ?? 'partial').trim() || 'partial',
        ]
      );
    }

    await client.query('COMMIT');
    console.log(`Imported ${items.length} medication enrichment records from ${absolutePath}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
