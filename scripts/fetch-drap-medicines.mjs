import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const outputDir = path.resolve(repoRoot, 'data');
const outputPath = path.resolve(outputDir, 'drap-medicine-catalog.json');

const SEARCH_URL = 'https://eapp.dra.gov.pk/productView.php';
const PREFIX_CHARSET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const SEARCH_DELAY_MS = Number(process.env.DRAP_SEARCH_DELAY_MS || 120);
const BRAND_CONCURRENCY = Number(process.env.DRAP_BRAND_CONCURRENCY || 8);
const GENERIC_CONCURRENCY = Number(process.env.DRAP_GENERIC_CONCURRENCY || 6);
const DETAIL_CONCURRENCY = Number(process.env.DRAP_MASTER_DETAIL_CONCURRENCY || 6);

const FORM_PATTERNS = [
  ['Powder for Solution for Injection', /\bpowder for solution for injection\b/i],
  ['Powder for Injection', /\bpowder for injection\b/i],
  ['Solution for Injection', /\bsolution for injection\b/i],
  ['Solution for Infusion', /\bsolution for infusion\b/i],
  ['Dry Suspension', /\bdry suspension\b/i],
  ['Oral Suspension', /\boral suspension\b/i],
  ['Ophthalmic Suspension', /\bophthalmic suspension\b/i],
  ['Eye Drops', /\beye drops?\b|\bfor eye\b/i],
  ['Nasal Drops', /\bnasal drops?\b/i],
  ['Oral Drops', /\boral drops?\b/i],
  ['Suspension', /\bsuspension\b/i],
  ['Infusion', /\binfusion\b/i],
  ['Injection', /\binjection\b|\binj\b/i],
  ['Tablet', /\btablets?\b|\btab\b/i],
  ['Capsule', /\bcapsules?\b|\bcap\b/i],
  ['Syrup', /\bsyrup\b/i],
  ['Elixir', /\belixir\b/i],
  ['Cream', /\bcream\b|\bcrm\b/i],
  ['Ointment', /\bointment\b/i],
  ['Gel', /\bgel\b/i],
  ['Lotion', /\blotion\b/i],
  ['Drops', /\bdrops?\b|\bdrp\b/i],
  ['Inhaler', /\binhaler\b/i],
  ['Suppository', /\bsuppositor(?:y|ies)\b|\bsup\b/i],
  ['Granules', /\bgranules\b/i],
  ['Sachet', /\bsachet\b/i],
  ['Spray', /\bspray\b/i],
  ['Vaccine', /\bvaccine\b/i],
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function stripBom(value) {
  return value.replace(/^\uFEFF/, '');
}

function normalizeWhitespace(value) {
  return String(value ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeKey(value) {
  return normalizeWhitespace(value)
    .replace(/[^\p{L}\p{N}%+./ -]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function parseStrengthText(rawName) {
  const matches = normalizeWhitespace(rawName).match(/(\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)*(?:\s*(?:mg|mcg|g|gm|iu|iu\/ml|mg\/ml|mg\/5ml|mcg\/actuation|%|ml|mmol|meq))(?:\s*\/\s*\d+(?:\.\d+)?\s*(?:ml|l))?)/gi);
  if (!matches) return '';

  const unique = [];
  for (const match of matches) {
    const cleaned = normalizeWhitespace(match).replace(/\s+/g, '');
    if (!unique.includes(cleaned)) unique.push(cleaned);
  }

  return unique.join(', ');
}

function parseDosageForm(rawName) {
  const cleaned = normalizeWhitespace(rawName);
  const found = FORM_PATTERNS.find(([, pattern]) => pattern.test(cleaned));
  return found?.[0] ?? '';
}

function inferRoute(form) {
  const normalized = form.toLowerCase();
  if (!normalized) return '';
  if (['tablet', 'capsule', 'syrup', 'elixir', 'granules', 'sachet', 'oral suspension', 'dry suspension', 'suspension'].includes(normalized)) {
    return 'Oral';
  }
  if (normalized.includes('injection') || normalized.includes('infusion')) return 'Injectable';
  if (normalized === 'eye drops' || normalized === 'ophthalmic suspension') return 'Ophthalmic';
  if (normalized === 'nasal drops') return 'Nasal';
  if (normalized === 'cream' || normalized === 'ointment' || normalized === 'gel' || normalized === 'lotion') return 'Topical';
  if (normalized === 'inhaler') return 'Inhalation';
  if (normalized === 'suppository') return 'Rectal';
  return '';
}

function buildPrefixes() {
  const prefixes = [];
  for (const first of PREFIX_CHARSET) {
    for (const second of PREFIX_CHARSET) {
      prefixes.push(`${first}${second}`);
    }
  }
  return prefixes;
}

async function fetchText(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`DRAP request failed (${response.status}) for ${url}`);
  }

  return stripBom(await response.text());
}

async function fetchJson(url, init) {
  const text = await fetchText(url, init);
  return JSON.parse(text);
}

async function runInBatches(items, concurrency, worker) {
  const results = [];
  let index = 0;

  async function runWorker() {
    while (index < items.length) {
      const current = index++;
      results[current] = await worker(items[current], current);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => runWorker()));
  return results;
}

async function fetchBrandMatches(prefix) {
  const url = new URL(SEARCH_URL);
  url.searchParams.set('search', prefix);
  url.searchParams.set('_type', 'brand name');
  const json = await fetchJson(url);
  await sleep(SEARCH_DELAY_MS);
  return Array.isArray(json.results) ? json.results : [];
}

async function fetchGenericMatches(prefix) {
  const url = new URL(SEARCH_URL);
  url.searchParams.set('searchGeneric', prefix);
  url.searchParams.set('_type', 'generic name');
  const json = await fetchJson(url);
  await sleep(SEARCH_DELAY_MS);
  return Array.isArray(json.results) ? json.results : [];
}

async function fetchGenericProducts(masterId) {
  const body = new URLSearchParams({ masterID: String(masterId) });
  const text = await fetchText(SEARCH_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
    },
    body,
  });
  await sleep(SEARCH_DELAY_MS);
  return JSON.parse(text);
}

async function crawlBrandIndex() {
  const prefixes = buildPrefixes();
  const byRegNo = new Map();

  await runInBatches(prefixes, BRAND_CONCURRENCY, async prefix => {
    const rows = await fetchBrandMatches(prefix);
    for (const row of rows) {
      const registrationNo = normalizeWhitespace(row.id);
      const rawDisplayName = normalizeWhitespace(row.text);
      if (!registrationNo || !rawDisplayName) continue;
      if (!byRegNo.has(registrationNo)) {
        byRegNo.set(registrationNo, {
          registrationNo,
          rawDisplayName,
          brandName: rawDisplayName,
          dosageForm: parseDosageForm(rawDisplayName),
          strengthText: parseStrengthText(rawDisplayName),
          route: '',
          genericName: '',
          companyName: '',
          source: 'DRAP Registered Product Data',
          sourceUrl: `https://eapp.dra.gov.pk/productView.php`,
        });
      }
    }
  });

  for (const entry of byRegNo.values()) {
    entry.route = inferRoute(entry.dosageForm);
  }

  return byRegNo;
}

async function crawlGenericMap() {
  const prefixes = buildPrefixes();
  const genericMasters = new Map();

  await runInBatches(prefixes, GENERIC_CONCURRENCY, async prefix => {
    const rows = await fetchGenericMatches(prefix);
    for (const row of rows) {
      const masterId = normalizeWhitespace(row.id);
      const genericName = normalizeWhitespace(row.text);
      if (!masterId || !genericName) continue;
      genericMasters.set(masterId, genericName);
    }
  });

  const brandLookup = new Map();
  const masterIds = [...genericMasters.keys()];

  await runInBatches(masterIds, DETAIL_CONCURRENCY, async masterId => {
    const rows = await fetchGenericProducts(masterId);
    if (!Array.isArray(rows)) return;

    for (const row of rows) {
      const approvedName = normalizeWhitespace(row.approvedName);
      if (!approvedName) continue;

      const key = normalizeKey(approvedName);
      const existing = brandLookup.get(key) ?? {
        genericNames: new Set(),
        companyNames: new Set(),
      };

      const genericName = normalizeWhitespace(row.genericName || genericMasters.get(masterId) || '');
      const companyName = normalizeWhitespace(row.companyName || '');

      if (genericName) existing.genericNames.add(genericName);
      if (companyName) existing.companyNames.add(companyName);
      brandLookup.set(key, existing);
    }
  });

  return brandLookup;
}

async function main() {
  console.log('Fetching DRAP brand index...');
  const brandIndex = await crawlBrandIndex();
  console.log(`Collected ${brandIndex.size} unique registration records.`);

  console.log('Fetching DRAP generic/company mappings...');
  const genericMap = await crawlGenericMap();
  console.log(`Collected ${genericMap.size} approved-name mappings.`);

  const entries = [...brandIndex.values()].map(entry => {
    const enrichment = genericMap.get(normalizeKey(entry.rawDisplayName));
    const genericNames = enrichment ? [...enrichment.genericNames] : [];
    const companyNames = enrichment ? [...enrichment.companyNames] : [];

    return {
      registrationNo: entry.registrationNo,
      brandName: entry.brandName,
      rawDisplayName: entry.rawDisplayName,
      genericName: genericNames.join(' | '),
      companyName: companyNames.join(' | '),
      strengthText: entry.strengthText,
      dosageForm: entry.dosageForm,
      route: entry.route,
      source: entry.source,
      sourceUrl: entry.sourceUrl,
    };
  }).sort((a, b) => a.brandName.localeCompare(b.brandName));

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(
    outputPath,
    JSON.stringify(
      {
        source: 'DRAP Registered Product Data',
        generatedAt: new Date().toISOString(),
        notes: [
          'Data sourced from the public DRAP registered product search.',
          'Generic and company enrichment is matched from DRAP generic search results and may be incomplete for some products.',
          'Dosage form and strength are normalized from DRAP display names where explicit detail records were not fetched.',
        ],
        totalEntries: entries.length,
        entries,
      },
      null,
      2
    )
  );

  console.log(`Saved ${entries.length} entries to ${path.relative(repoRoot, outputPath)}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
