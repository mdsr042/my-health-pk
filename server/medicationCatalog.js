import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const catalogPath = path.resolve(__dirname, '../data/drap-medicine-catalog.json');

let catalogCache = null;

function normalizeText(value) {
  return String(value ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/[^\p{L}\p{N}%+./ -]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

async function loadCatalog() {
  if (catalogCache) return catalogCache;

  try {
    const raw = await fs.readFile(catalogPath, 'utf8');
    const parsed = JSON.parse(raw);
    const entries = Array.isArray(parsed.entries) ? parsed.entries : [];

    catalogCache = {
      metadata: {
        generatedAt: parsed.generatedAt ?? null,
        source: parsed.source ?? 'DRAP Registered Product Data',
        totalEntries: entries.length,
      },
      entries: entries.map(entry => ({
        ...entry,
        _searchText: normalizeText([
          entry.brandName,
          entry.rawDisplayName,
          entry.genericName,
          entry.strengthText,
          entry.dosageForm,
          entry.route,
          entry.companyName,
          entry.registrationNo,
        ].filter(Boolean).join(' ')),
      })),
      entryByRegistrationNo: new Map(entries.map(entry => [String(entry.registrationNo), entry])),
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      catalogCache = {
        metadata: {
          generatedAt: null,
          source: 'DRAP Registered Product Data',
          totalEntries: 0,
        },
        entries: [],
        entryByRegistrationNo: new Map(),
      };
    } else {
      throw error;
    }
  }

  return catalogCache;
}

function scoreEntry(entry, query) {
  const normalizedBrand = normalizeText(entry.brandName);
  const normalizedGeneric = normalizeText(entry.genericName);
  const normalizedRegNo = normalizeText(entry.registrationNo);
  let score = 0;

  if (normalizedBrand === query) score += 120;
  if (normalizedGeneric === query) score += 100;
  if (normalizedRegNo === query) score += 95;
  if (normalizedBrand.startsWith(query)) score += 70;
  if (normalizedGeneric.startsWith(query)) score += 55;
  if (normalizedRegNo.startsWith(query)) score += 50;
  if (entry._searchText.includes(query)) score += 20;

  return score;
}

function toSummary(entry) {
  const { _searchText, rawDisplayName, source, sourceUrl, ...summary } = entry;
  return summary;
}

function toDetail(entry) {
  const { _searchText, ...detail } = entry;
  return detail;
}

export async function searchMedicationCatalog(query, limit = 20, cursor = 0) {
  const catalog = await loadCatalog();
  const normalizedQuery = normalizeText(query);
  const safeLimit = Math.max(1, Math.min(limit, 20));
  const safeCursor = Math.max(0, Number.parseInt(String(cursor ?? 0), 10) || 0);

  if (!normalizedQuery) {
    return {
      metadata: catalog.metadata,
      entries: [],
      hasMore: false,
      nextCursor: null,
    };
  }

  const allMatches = catalog.entries
    .map(entry => ({ entry, score: scoreEntry(entry, normalizedQuery) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.brandName.localeCompare(b.entry.brandName));

  const pagedMatches = allMatches
    .slice(safeCursor, safeCursor + safeLimit)
    .map(item => toSummary(item.entry));

  const nextCursor = safeCursor + safeLimit < allMatches.length ? safeCursor + safeLimit : null;

  return {
    metadata: catalog.metadata,
    entries: pagedMatches,
    hasMore: nextCursor !== null,
    nextCursor,
  };
}

export async function getMedicationCatalogEntry(registrationNo) {
  const catalog = await loadCatalog();
  const match = catalog.entryByRegistrationNo.get(String(registrationNo))
    ?? catalog.entries.find(entry => entry.registrationNo === registrationNo);
  if (!match) return null;

  return toDetail(match);
}

export async function getMedicationCatalogEntries(registrationNos) {
  const catalog = await loadCatalog();
  return registrationNos
    .map(registrationNo => catalog.entryByRegistrationNo.get(String(registrationNo)))
    .filter(Boolean)
    .map(entry => toSummary(entry));
}
