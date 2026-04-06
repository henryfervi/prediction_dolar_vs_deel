// Pure functions — all operate on number[] (chronological order)

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function mean(arr) {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

export function stdDev(arr) {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// ─── SMA ──────────────────────────────────────────────────────────────────────

export function sma(rates, period) {
  return rates.map((_, i) => {
    if (i < period - 1) return null;
    return mean(rates.slice(i - period + 1, i + 1));
  });
}

// ─── EMA ──────────────────────────────────────────────────────────────────────

export function ema(rates, period) {
  const k = 2 / (period + 1);
  const result = [rates[0]];
  for (let i = 1; i < rates.length; i++) {
    result.push(rates[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

// Returns slope as % change per day averaged over last `window` days
export function emaSlope(emaValues, window = 5) {
  const recent = emaValues.slice(-window);
  const changes = [];
  for (let i = 1; i < recent.length; i++) {
    changes.push((recent[i] - recent[i - 1]) / recent[i - 1]);
  }
  const slope = changes.length > 0 ? mean(changes) : 0;
  return {
    slope,
    slopePct: slope * 100,
    direction: slope > 0.0002 ? 'up' : slope < -0.0002 ? 'down' : 'flat',
  };
}

// ─── RSI ──────────────────────────────────────────────────────────────────────

export function rsi(rates, period = 14) {
  const result = new Array(rates.length).fill(null);
  if (rates.length <= period) return result;

  const deltas = rates.slice(1).map((v, i) => v - rates[i]);

  // Seed with simple average of first `period` gains/losses
  let avgGain = mean(deltas.slice(0, period).map(d => (d > 0 ? d : 0)));
  let avgLoss = mean(deltas.slice(0, period).map(d => (d < 0 ? -d : 0)));

  function calcRSI(ag, al) {
    if (al === 0) return 100;
    return 100 - 100 / (1 + ag / al);
  }

  result[period] = calcRSI(avgGain, avgLoss);

  for (let i = period; i < deltas.length; i++) {
    const gain = deltas[i] > 0 ? deltas[i] : 0;
    const loss = deltas[i] < 0 ? -deltas[i] : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i + 1] = calcRSI(avgGain, avgLoss);
  }

  return result;
}

// ─── Linear Regression (OLS) ──────────────────────────────────────────────────

export function linearRegression(rates) {
  const n = rates.length;
  const xs = rates.map((_, i) => i);
  const meanX = mean(xs);
  const meanY = mean(rates);

  let ssXY = 0, ssXX = 0, ssYY = 0;
  for (let i = 0; i < n; i++) {
    ssXY += (xs[i] - meanX) * (rates[i] - meanY);
    ssXX += (xs[i] - meanX) ** 2;
    ssYY += (rates[i] - meanY) ** 2;
  }

  const slope = ssXX === 0 ? 0 : ssXY / ssXX;
  const intercept = meanY - slope * meanX;
  const rSquared = ssYY === 0 ? 0 : (ssXY ** 2) / (ssXX * ssYY);

  // Residuals stddev for forecast confidence interval
  const residuals = rates.map((r, i) => r - (intercept + slope * i));
  const residualStd = stdDev(residuals);

  function predict(x) {
    return intercept + slope * x;
  }

  const currentPredicted = predict(n - 1);
  const currentDevPct = (rates[n - 1] - currentPredicted) / currentPredicted * 100;

  return {
    slope,       // COP per day (positive = USD strengthening)
    intercept,
    rSquared: clamp(rSquared, 0, 1),
    residualStd,
    currentPredicted,
    currentDevPct,  // % above/below trend line (positive = above = favorable)
    predict,
  };
}

// Forecast future rates: returns array of { dayOffset, predicted, low, high }
export function forecast(regression, fromIndex, days) {
  const results = [];
  for (let d = 1; d <= days; d++) {
    const x = fromIndex + d;
    const predicted = regression.predict(x);
    results.push({
      dayOffset: d,
      predicted,
      low: predicted - regression.residualStd,
      high: predicted + regression.residualStd,
    });
  }
  return results;
}

// ─── Seasonality ──────────────────────────────────────────────────────────────

// Groups monthly data by month-of-year and computes avg vs overall avg
export function monthlySeasonality(monthlyRates) {
  const byMonth = {};
  for (const { date, rate } of monthlyRates) {
    const m = parseInt(date.split('-')[1], 10);
    if (!byMonth[m]) byMonth[m] = [];
    byMonth[m].push(rate);
  }

  const allRates = monthlyRates.map(e => e.rate);
  const overallMean = mean(allRates);

  const result = {};
  for (const [m, rates] of Object.entries(byMonth)) {
    const avgRate = mean(rates);
    result[parseInt(m)] = {
      avgRate,
      deviationPct: (avgRate - overallMean) / overallMean * 100,
      sampleCount: rates.length,
    };
  }
  return result; // key: 1-12
}

// Score for current month's seasonality (0-100)
// Higher = historically this month has a higher USD/COP (favorable to transfer)
export function seasonalScore(seasonality, currentMonth) {
  const entry = seasonality[currentMonth];
  if (!entry) return 50;
  // +2% above avg → score 80; -2% below → score 20; linear
  const raw = 50 + entry.deviationPct * 15;
  return clamp(Math.round(raw), 0, 100);
}

// ─── Volatility ───────────────────────────────────────────────────────────────

// Coefficient of variation of last N days (lower = more stable = better)
export function volatilityCV(rates, window = 20) {
  const recent = rates.slice(-window);
  const m = mean(recent);
  const sd = stdDev(recent);
  return m === 0 ? 0 : sd / m;
}

// Score: low volatility → high score (safer to transfer)
export function volatilityScore(cv) {
  // CV of 0.01 (1%) → score ~90; CV of 0.03 (3%) → score ~40
  const raw = 100 - cv * 3000;
  return clamp(Math.round(raw), 0, 100);
}
