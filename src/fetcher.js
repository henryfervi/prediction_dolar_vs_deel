import { readFileSync, writeFileSync, existsSync } from 'fs';
import { CONFIG } from './config.js';

const API_BASE = 'https://api.frankfurter.dev/v2';

function buildFromDate(calendarDays) {
  const d = new Date();
  d.setDate(d.getDate() - calendarDays);
  return d.toISOString().split('T')[0];
}

function toISO(date) {
  return date.toISOString().split('T')[0];
}

async function apiFetch(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Frankfurter API error ${res.status}: ${url}`);
  return res.json();
}

async function fetchDailyRates(fromDate) {
  const today = toISO(new Date());
  const url = `${API_BASE}/rates?from=${fromDate}&to=${today}&base=${CONFIG.BASE}&quotes=${CONFIG.QUOTE}`;
  const json = await apiFetch(url);

  // Frankfurter v2 returns array of { date, base, quote, rate } when range is requested
  if (Array.isArray(json)) {
    return json.map(e => ({ date: e.date, rate: e.rates ? e.rates[CONFIG.QUOTE] : e.rate }));
  }

  // Fallback: object with dates as keys
  if (json.rates) {
    return Object.entries(json.rates)
      .map(([date, rates]) => ({ date, rate: rates[CONFIG.QUOTE] ?? rates }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  throw new Error('Unexpected API response format');
}

async function fetchMonthlyRates(fromDate) {
  const today = toISO(new Date());
  const url = `${API_BASE}/rates?from=${fromDate}&to=${today}&base=${CONFIG.BASE}&quotes=${CONFIG.QUOTE}&group=month`;
  const json = await apiFetch(url);

  if (Array.isArray(json)) {
    return json.map(e => ({ date: e.date, rate: e.rates ? e.rates[CONFIG.QUOTE] : e.rate }));
  }
  if (json.rates) {
    return Object.entries(json.rates)
      .map(([date, rates]) => ({ date, rate: rates[CONFIG.QUOTE] ?? rates }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  throw new Error('Unexpected API response format (monthly)');
}

function isCacheValid(cache) {
  if (!cache || !cache.fetchedAt) return false;
  return Date.now() - cache.fetchedAt < CONFIG.CACHE_TTL_MS;
}

export async function loadRates(forceRefresh = false) {
  // Try cache first
  if (!forceRefresh && existsSync(CONFIG.CACHE_FILE)) {
    try {
      const cache = JSON.parse(readFileSync(CONFIG.CACHE_FILE, 'utf8'));
      if (isCacheValid(cache) && cache.daily?.length > 0) {
        return { daily: cache.daily, monthly: cache.monthly, fromCache: true };
      }
    } catch {
      // Corrupt cache — ignore and re-fetch
    }
  }

  const fromDate = buildFromDate(CONFIG.LOOKBACK_CALENDAR_DAYS);

  let daily, monthly;

  try {
    [daily, monthly] = await Promise.all([
      fetchDailyRates(fromDate),
      fetchMonthlyRates(fromDate),
    ]);
  } catch (err) {
    // If fetch fails and we have stale cache, use it with a warning
    if (existsSync(CONFIG.CACHE_FILE)) {
      try {
        const cache = JSON.parse(readFileSync(CONFIG.CACHE_FILE, 'utf8'));
        if (cache.daily?.length > 0) {
          return { daily: cache.daily, monthly: cache.monthly, fromCache: true, stale: true };
        }
      } catch {}
    }
    throw new Error(`No se pudo obtener datos y no hay cache disponible.\n${err.message}`);
  }

  // Normalize and sort
  daily = daily
    .filter(e => e.rate && !isNaN(e.rate))
    .sort((a, b) => a.date.localeCompare(b.date));

  monthly = monthly
    .filter(e => e.rate && !isNaN(e.rate))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Write cache
  const cache = { fetchedAt: Date.now(), fromDate, daily, monthly };
  try {
    writeFileSync(CONFIG.CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch {
    // Non-fatal: cache write failure
  }

  return { daily, monthly, fromCache: false };
}
