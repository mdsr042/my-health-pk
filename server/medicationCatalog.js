import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const catalogPath = path.resolve(__dirname, '../data/drap-medicine-catalog.json');

let catalogCache = null;
const queryCache = new Map();
const MAX_QUERY_CACHE_SIZE = 200;

function normalizeText(value) {
  return String(value ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/[^\p{L}\p{N}%+./ -]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function cleanCatalogLabel(value) {
  const text = String(value ?? '')
    .replace(/^\s*[-:]+\s*\d+\s*[-:]+\s*/g, '')
    .replace(/^\s*[-:]+\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return text || String(value ?? '').trim();
}

async function loadCatalog() {
  if (catalogCache) return catalogCache;

  try {
    const raw = await fs.readFile(catalogPath, 'utf8');
    const parsed = JSON.parse(raw);
    const entries = Array.isArray(parsed.entries) ? parsed.entries : [];

    const indexedEntries = entries.map(entry => {
      const normalizedBrandName = cleanCatalogLabel(entry.brandName || entry.rawDisplayName || entry.registrationNo);
      const normalizedBrand = normalizeText(normalizedBrandName);
      const normalizedGeneric = normalizeText(entry.genericName);
      const normalizedCompany = normalizeText(entry.companyName);
      const normalizedRegNo = normalizeText(entry.registrationNo);
      const searchText = normalizeText([
        normalizedBrandName,
        entry.rawDisplayName,
        entry.genericName,
        entry.strengthText,
        entry.dosageForm,
        entry.route,
        entry.companyName,
        entry.registrationNo,
      ].filter(Boolean).join(' '));

      return {
        ...entry,
        brandName: normalizedBrandName,
        _normalizedBrand: normalizedBrand,
        _normalizedGeneric: normalizedGeneric,
        _normalizedCompany: normalizedCompany,
        _normalizedRegNo: normalizedRegNo,
        _searchText: searchText,
      };
    });

    const prefixIndex = new Map();

    indexedEntries.forEach((entry, index) => {
      const tokens = new Set(
        [
          ...entry._normalizedBrand.split(/[\s/+.-]+/),
          ...entry._normalizedGeneric.split(/[\s/+.-]+/),
          ...entry._normalizedCompany.split(/[\s/+.-]+/),
          ...entry._normalizedRegNo.split(/[\s/+.-]+/),
        ]
          .map(token => token.trim())
          .filter(token => token.length >= 2)
      );

      tokens.forEach(token => {
        const maxPrefix = Math.min(token.length, 5);
        for (let length = 2; length <= maxPrefix; length += 1) {
          const prefix = token.slice(0, length);
          const bucket = prefixIndex.get(prefix);
          if (bucket) {
            bucket.push(index);
          } else {
            prefixIndex.set(prefix, [index]);
          }
        }
      });
    });

    catalogCache = {
      metadata: {
        generatedAt: parsed.generatedAt ?? null,
        source: parsed.source ?? 'DRAP Registered Product Data',
        totalEntries: entries.length,
      },
      entries: indexedEntries,
      entryByRegistrationNo: new Map(indexedEntries.map(entry => [String(entry.registrationNo), entry])),
      prefixIndex,
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
        prefixIndex: new Map(),
      };
    } else {
      throw error;
    }
  }

  return catalogCache;
}

function scoreEntry(entry, query) {
  let score = 0;

  if (entry._normalizedBrand === query) score += 120;
  if (entry._normalizedGeneric === query) score += 100;
  if (entry._normalizedCompany === query) score += 95;
  if (entry._normalizedRegNo === query) score += 95;
  if (entry._normalizedBrand.startsWith(query)) score += 70;
  if (entry._normalizedGeneric.startsWith(query)) score += 55;
  if (entry._normalizedCompany.startsWith(query)) score += 45;
  if (entry._normalizedRegNo.startsWith(query)) score += 50;
  if (entry._searchText.includes(query)) score += 20;

  return score;
}

function toSummary(entry) {
  const {
    _searchText,
    _normalizedBrand,
    _normalizedGeneric,
    _normalizedCompany,
    _normalizedRegNo,
    rawDisplayName,
    source,
    sourceUrl,
    ...summary
  } = entry;
  return summary;
}

function toDetail(entry) {
  const { _searchText, _normalizedBrand, _normalizedGeneric, _normalizedCompany, _normalizedRegNo, ...detail } = entry;
  return detail;
}

function getCachedQueryResult(cacheKey) {
  const hit = queryCache.get(cacheKey);
  if (!hit) return null;
  queryCache.delete(cacheKey);
  queryCache.set(cacheKey, hit);
  return hit;
}

function setCachedQueryResult(cacheKey, result) {
  queryCache.set(cacheKey, result);
  if (queryCache.size <= MAX_QUERY_CACHE_SIZE) return;

  const firstKey = queryCache.keys().next().value;
  if (firstKey) {
    queryCache.delete(firstKey);
  }
}

function getCandidateEntries(catalog, normalizedQuery) {
  for (let length = Math.min(5, normalizedQuery.length); length >= 2; length -= 1) {
    const bucket = catalog.prefixIndex.get(normalizedQuery.slice(0, length));
    if (bucket?.length) {
      return bucket.map(index => catalog.entries[index]);
    }
  }

  return catalog.entries;
}

export async function searchMedicationCatalog(query, limit = 20, cursor = 0) {
  const catalog = await loadCatalog();
  const normalizedQuery = normalizeText(query);
  const safeLimit = Math.max(1, Math.min(limit, 20));
  const safeCursor = Math.max(0, Number.parseInt(String(cursor ?? 0), 10) || 0);
  const cacheKey = `${normalizedQuery}::${safeLimit}::${safeCursor}`;

  if (!normalizedQuery) {
    return {
      metadata: catalog.metadata,
      entries: [],
      hasMore: false,
      nextCursor: null,
    };
  }

  const cached = getCachedQueryResult(cacheKey);
  if (cached) {
    return cached;
  }

  const allMatches = getCandidateEntries(catalog, normalizedQuery)
    .map(entry => ({ entry, score: scoreEntry(entry, normalizedQuery) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.brandName.localeCompare(b.entry.brandName));

  const pagedMatches = allMatches
    .slice(safeCursor, safeCursor + safeLimit)
    .map(item => toSummary(item.entry));

  const nextCursor = safeCursor + safeLimit < allMatches.length ? safeCursor + safeLimit : null;

  const result = {
    metadata: catalog.metadata,
    entries: pagedMatches,
    hasMore: nextCursor !== null,
    nextCursor,
  };

  setCachedQueryResult(cacheKey, result);
  return result;
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

export async function warmMedicationCatalog() {
  await loadCatalog();
}
