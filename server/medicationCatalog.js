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

export async function searchMedicationCatalog(query, limit = 50) {
  const catalog = await loadCatalog();
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) {
    return {
      metadata: catalog.metadata,
      entries: [],
    };
  }

  const matches = catalog.entries
    .map(entry => ({ entry, score: scoreEntry(entry, normalizedQuery) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.brandName.localeCompare(b.entry.brandName))
    .slice(0, Math.max(1, Math.min(limit, 100)))
    .map(item => {
      const { _searchText, ...entry } = item.entry;
      return entry;
    });

  return {
    metadata: catalog.metadata,
    entries: matches,
  };
}
