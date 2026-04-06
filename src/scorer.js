import { CONFIG } from './config.js';
import {
  sma, ema, emaSlope, rsi, linearRegression, forecast,
  monthlySeasonality, seasonalScore, volatilityCV, volatilityScore,
  mean, stdDev,
} from './indicators.js';

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// RSI calculado sobre la tasa USD/COP:
//   RSI > 60 → tasa ha estado subiendo → dólar FUERTE → bueno para retirar (score ALTO)
//   RSI < 40 → tasa ha estado bajando → dólar DÉBIL  → esperar (score BAJO)
function rsiToScore(rsiValue) {
  if (rsiValue === null) return 50;
  if (rsiValue >= CONFIG.RSI_OVERBOUGHT) {
    // Dólar en impulso alcista: score 65-85
    const excess = rsiValue - CONFIG.RSI_OVERBOUGHT;
    return clamp(Math.round(65 + excess * 1.0), 0, 100);
  }
  if (rsiValue <= CONFIG.RSI_OVERSOLD) {
    // Dólar en impulso bajista: score 15-35
    const deficit = CONFIG.RSI_OVERSOLD - rsiValue;
    return clamp(Math.round(35 - deficit * 0.5), 0, 100);
  }
  // Zona neutral 40-60 → score 35-65 lineal
  const pct = (rsiValue - CONFIG.RSI_OVERSOLD) / (CONFIG.RSI_OVERBOUGHT - CONFIG.RSI_OVERSOLD);
  return clamp(Math.round(35 + pct * 30), 0, 100);
}

// Señal de nivel: ¿qué tan alto está el dólar vs su rango histórico? (lo más importante)
// Percentil 80+ → score 85+ (dólar muy alto → retirar)
// Percentil 20- → score 15- (dólar muy bajo → esperar)
function levelScore(percentile) {
  return clamp(Math.round(percentile), 0, 100);
}

export function computeAnalysis(daily, monthly) {
  const rates = daily.map(d => d.rate);
  const currentRate = rates.at(-1);
  const currentDate = new Date(daily.at(-1).date);
  const currentMonth = currentDate.getMonth() + 1; // 1-12

  // ── Stats ──────────────────────────────────────────────────────────────────
  const max2yr = Math.max(...rates);
  const min2yr = Math.min(...rates);
  const avg2yr = mean(rates);
  const maxDate = daily[rates.indexOf(max2yr)].date;
  const minDate = daily[rates.indexOf(min2yr)].date;
  const currentVsAvgPct = (currentRate - avg2yr) / avg2yr * 100;
  const currentPercentile = rates.filter(r => r <= currentRate).length / rates.length * 100;

  // ── Nivel histórico (señal principal) ─────────────────────────────────────
  const lvlScore = levelScore(currentPercentile);
  const lvlLabel = currentPercentile >= 70
    ? `Percentil ${currentPercentile.toFixed(0)}° — Dólar ALTO históricamente`
    : currentPercentile >= 40
    ? `Percentil ${currentPercentile.toFixed(0)}° — Dólar en rango medio`
    : `Percentil ${currentPercentile.toFixed(0)}° — Dólar BAJO históricamente`;

  // ── Trend (SMA + EMA) ──────────────────────────────────────────────────────
  const smaShort = sma(rates, CONFIG.SMA_SHORT);
  const smaLong = sma(rates, CONFIG.SMA_LONG);
  const emaValues = ema(rates, CONFIG.EMA_PERIOD);
  const slope = emaSlope(emaValues);

  const latestShort = smaShort.at(-1) ?? currentRate;
  const latestLong = smaLong.at(-1) ?? currentRate;
  const goldenCross = latestShort > latestLong;

  const smaCrossScore = goldenCross ? 72 : 30;
  const slopeScore = clamp(50 + slope.slopePct * 400, 0, 100);
  const trendScore = Math.round(smaCrossScore * 0.5 + slopeScore * 0.5);

  const trendLabel = goldenCross
    ? `Golden cross (SMA${CONFIG.SMA_SHORT} > SMA${CONFIG.SMA_LONG})`
    : `Death cross (SMA${CONFIG.SMA_SHORT} < SMA${CONFIG.SMA_LONG})`;

  // ── Momentum (RSI) ─────────────────────────────────────────────────────────
  const rsiValues = rsi(rates, CONFIG.RSI_PERIOD);
  const currentRSI = rsiValues.at(-1) ?? 50;
  const momentumScore = rsiToScore(currentRSI);

  let rsiLabel;
  if (currentRSI > CONFIG.RSI_OVERBOUGHT) {
    rsiLabel = `RSI ${currentRSI.toFixed(1)} — Dólar en impulso alcista`;
  } else if (currentRSI < CONFIG.RSI_OVERSOLD) {
    rsiLabel = `RSI ${currentRSI.toFixed(1)} — Dólar en impulso bajista`;
  } else {
    rsiLabel = `RSI ${currentRSI.toFixed(1)} — Sin impulso claro`;
  }

  // ── Regression ─────────────────────────────────────────────────────────────
  const reg = linearRegression(rates);
  const devPct = reg.currentDevPct;
  // Above trend → favorable (higher than expected) → score > 50
  const rawRegScore = clamp(50 + devPct * 8, 0, 100);
  // Weight down if R² is poor
  const regressionScore = Math.round(rawRegScore * reg.rSquared + 50 * (1 - reg.rSquared));

  const regLabel = devPct >= 0
    ? `+${devPct.toFixed(1)}% sobre línea de tendencia (R²=${reg.rSquared.toFixed(2)})`
    : `${devPct.toFixed(1)}% bajo línea de tendencia (R²=${reg.rSquared.toFixed(2)})`;

  // ── Seasonality ────────────────────────────────────────────────────────────
  const season = monthlySeasonality(monthly);
  const sScore = seasonalScore(season, currentMonth);
  const seasonEntry = season[currentMonth];
  const seasonLabel = seasonEntry
    ? `${MONTH_NAMES[currentMonth - 1]}: ${seasonEntry.deviationPct >= 0 ? '+' : ''}${seasonEntry.deviationPct.toFixed(1)}% vs promedio histórico`
    : 'Sin datos estacionales suficientes';

  // ── Volatility ─────────────────────────────────────────────────────────────
  const cv = volatilityCV(rates, CONFIG.VOLATILITY_WINDOW);
  const volScore = volatilityScore(cv);
  const annualizedVol = cv * Math.sqrt(252) * 100;
  const volLabel = cv < 0.008
    ? `Volatilidad baja (CV ${(cv * 100).toFixed(2)}%) — periodo estable`
    : cv < 0.015
    ? `Volatilidad moderada (CV ${(cv * 100).toFixed(2)}%)`
    : `Volatilidad alta (CV ${(cv * 100).toFixed(2)}%) — mayor incertidumbre`;

  // ── Composite Score ────────────────────────────────────────────────────────
  const signals = {
    level:      { score: lvlScore,        label: lvlLabel,      weight: CONFIG.WEIGHTS.level },
    seasonal:   { score: sScore,          label: seasonLabel,   weight: CONFIG.WEIGHTS.seasonal },
    trend:      { score: trendScore,      label: trendLabel,    weight: CONFIG.WEIGHTS.trend },
    momentum:   { score: momentumScore,   label: rsiLabel,      weight: CONFIG.WEIGHTS.momentum },
    regression: { score: regressionScore, label: regLabel,      weight: CONFIG.WEIGHTS.regression },
  };

  const composite = Math.round(
    Object.values(signals).reduce((sum, s) => sum + s.score * s.weight, 0)
  );

  // ── Costo de oportunidad ───────────────────────────────────────────────────
  // Por cada $1,000 USD: ¿cuántos pesos más recibirías si esperas al promedio?
  const EJEMPLO_USD = 1000;
  const deelEffectiveRate = currentRate * (1 - CONFIG.DEEL_SPREAD_PCT);
  const deelAvgRate = avg2yr * (1 - CONFIG.DEEL_SPREAD_PCT);
  const oportunidadPesos = Math.round((deelAvgRate - deelEffectiveRate) * EJEMPLO_USD);
  // negativo = ya estás por encima del promedio (estás ganando vs esperar)

  // ── Recommendation ─────────────────────────────────────────────────────────
  let action, actionEmoji, urgency, reasoning;
  if (composite >= CONFIG.SCORE_TRANSFER) {
    action = 'RETIRAR AHORA';
    actionEmoji = '✓';
    urgency = 'ALTA';
    reasoning = buildReasoning(signals, 'transfer');
  } else if (composite >= CONFIG.SCORE_MONITOR) {
    action = 'ESPERAR UN POCO';
    actionEmoji = '~';
    urgency = 'MEDIA';
    reasoning = buildReasoning(signals, 'monitor');
  } else {
    action = 'ESPERAR — DÓLAR BAJO';
    actionEmoji = '✗';
    urgency = 'BAJA';
    reasoning = buildReasoning(signals, 'wait');
  }

  // ── Forecast ───────────────────────────────────────────────────────────────
  const forecastPoints = forecast(reg, rates.length - 1, CONFIG.FORECAST_DAYS);
  const forecastLow = Math.min(...forecastPoints.map(p => p.low));
  const forecastHigh = Math.max(...forecastPoints.map(p => p.high));

  // Best window: days in forecast where predicted > avg2yr AND > currentRate (i.e., improving)
  const upTrend = reg.slope > 0;
  let bestWindowDesc;
  if (upTrend) {
    const peakDay = forecastPoints.reduce((best, p) =>
      p.predicted > best.predicted ? p : best, forecastPoints[0]);
    bestWindowDesc = `Días ${peakDay.dayOffset - 3}–${peakDay.dayOffset} del período (tendencia alcista)`;
  } else {
    bestWindowDesc = 'Transferir pronto — tendencia bajista proyectada';
  }

  return {
    currentDate: daily.at(-1).date,
    currentRate,
    deelEffectiveRate, deelAvgRate,
    oportunidadPesos, ejemploUSD: EJEMPLO_USD,
    max2yr, min2yr, avg2yr, maxDate, minDate,
    currentVsAvgPct,
    currentPercentile,
    signals,
    composite,
    action, actionEmoji, urgency, reasoning,
    reg,
    forecastPoints,
    forecastLow,
    forecastHigh,
    bestWindowDesc,
    // Raw series for rendering
    smaShort, smaLong, emaValues, rsiValues,
    season,
    currentMonth,
  };
}

function buildReasoning(signals, mode) {
  const sorted = Object.entries(signals).sort((a, b) => b[1].score - a[1].score);
  if (mode === 'transfer') {
    return sorted.slice(0, 2).map(([, s]) => `+ ${s.label}`);
  }
  if (mode === 'wait') {
    return sorted.slice(-2).map(([, s]) => `- ${s.label}`);
  }
  return [
    `+ ${sorted[0][1].label}`,
    `- ${sorted.at(-1)[1].label}`,
  ];
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export { MONTH_NAMES };
