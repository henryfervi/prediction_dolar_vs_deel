import chalk from 'chalk';
import Table from 'cli-table3';
import asciichart from 'asciichart';
import { CONFIG } from './config.js';
import { MONTH_NAMES } from './scorer.js';

const W = 62; // output width

function line(char = '═') {
  return char.repeat(W);
}

function fmt(n, decimals = 0) {
  return n.toLocaleString('es-CO', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtPct(n, decimals = 1) {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(decimals)}%`;
}

function scoreBar(score, width = 24) {
  const filled = Math.round((score / 100) * width);
  const empty = width - filled;
  return '▓'.repeat(filled) + '░'.repeat(empty);
}

function colorByScore(score) {
  if (score >= CONFIG.SCORE_TRANSFER) return chalk.green.bold;
  if (score >= CONFIG.SCORE_MONITOR) return chalk.yellow.bold;
  return chalk.red.bold;
}

function colorByPct(pct) {
  if (pct >= 1) return chalk.green;
  if (pct >= -1) return chalk.yellow;
  return chalk.red;
}

function pad(str, width) {
  const len = str.replace(/\x1b\[[0-9;]*m/g, '').length; // strip ANSI
  return str + ' '.repeat(Math.max(0, width - len));
}

// ─── Sections ─────────────────────────────────────────────────────────────────

function renderHeader(analysis) {
  const col = colorByScore(analysis.composite);
  console.log('');
  console.log(chalk.cyan(line()));
  console.log(chalk.cyan.bold(`  USD/COP TRANSFER ADVISOR  —  ${analysis.currentDate}`));
  const fromDate = analysis.daily?.[0]?.date ?? '';
  const toDate = analysis.daily?.at(-1)?.date ?? '';
  const rangeDesc = fromDate ? `${fromDate} → ${toDate}` : 'Frankfurter API';
  console.log(chalk.dim(`  Deel → Cuenta Bancaria Colombia | Frankfurter API | ${rangeDesc}`));
  console.log(chalk.cyan(line()));
}

function renderRecommendation(analysis) {
  const { composite, action, actionEmoji, urgency, deelEffectiveRate, deelAvgRate,
    oportunidadPesos, ejemploUSD,
    currentRate, max2yr, min2yr, avg2yr, maxDate, minDate,
    currentVsAvgPct, currentPercentile, reasoning, daily } = analysis;

  const col = colorByScore(composite);

  // Nivel del dólar en palabras simples
  let nivelDolar, nivelCol;
  if (currentPercentile >= 70) {
    nivelDolar = `ALTO (percentil ${currentPercentile.toFixed(0)}°/100)`;
    nivelCol = chalk.green.bold;
  } else if (currentPercentile >= 40) {
    nivelDolar = `MEDIO (percentil ${currentPercentile.toFixed(0)}°/100)`;
    nivelCol = chalk.yellow.bold;
  } else {
    nivelDolar = `BAJO (percentil ${currentPercentile.toFixed(0)}°/100)`;
    nivelCol = chalk.red.bold;
  }

  console.log('');
  console.log(`  El dólar hoy está:  ${nivelCol(nivelDolar)}`);
  console.log('');
  console.log(`  RECOMENDACIÓN:  ${col(`${actionEmoji} ${action}`)}  ${chalk.dim(`(Score: ${composite}/100)`)}`);
  console.log(`  ${col(scoreBar(composite))}  ${col(`${composite}/100`)}`);
  console.log('');
  console.log(chalk.dim(`  ─ Por qué ──────────────────────────────────────────────`));
  for (const r of reasoning) {
    console.log(`  ${chalk.dim(r)}`);
  }
  console.log('');
  console.log(chalk.dim(`  ─ Tasas ────────────────────────────────────────────────`));
  console.log(`  Tasa hoy (mid-market):   ${chalk.white.bold(fmt(currentRate, 2))} COP/USD`);
  console.log(`  Lo que recibes con Deel: ${chalk.yellow.bold(fmt(deelEffectiveRate, 2))} COP/USD  ${chalk.dim(`(-${(CONFIG.DEEL_SPREAD_PCT * 100).toFixed(2)}% spread)`)}`);
  console.log('');
  console.log(chalk.dim(`  ─ Contexto histórico (${daily[0]?.date ?? ''} → ${daily.at(-1)?.date ?? ''}) ──────────`));
  console.log(`  Máximo:    ${chalk.green(fmt(max2yr, 2))} ${chalk.dim(`(${maxDate})`)}`);
  console.log(`  Promedio:  ${fmt(avg2yr, 2)} COP/USD`);
  console.log(`  Mínimo:    ${chalk.red(fmt(min2yr, 2))} ${chalk.dim(`(${minDate})`)}`);
  const pctCol = colorByPct(currentVsAvgPct);
  console.log(`  Actual vs promedio: ${pctCol(fmtPct(currentVsAvgPct))}`);
  console.log('');

  // Costo de oportunidad: la clave de la decisión
  console.log(chalk.dim(`  ─ Costo de oportunidad ─────────────────────────────────`));
  if (oportunidadPesos > 0) {
    console.log(`  Si esperas a que el dólar vuelva al promedio histórico:`);
    console.log(`  Ganarías ${chalk.green.bold('$' + fmt(oportunidadPesos))} pesos más por cada ${chalk.dim('$' + fmt(ejemploUSD) + ' USD')}`);
    console.log(`  ${chalk.dim(`(${fmt(deelAvgRate, 2)} vs ${fmt(deelEffectiveRate, 2)} COP/USD)`)}`);
  } else {
    const ganando = Math.abs(oportunidadPesos);
    console.log(`  El dólar está ${chalk.green.bold('por encima del promedio histórico')}:`);
    console.log(`  Retiras ${chalk.green.bold('$' + fmt(ganando))} pesos ${chalk.green('más')} de lo usual por ${chalk.dim('$' + fmt(ejemploUSD) + ' USD')}`);
    console.log(`  ${chalk.dim(`(${fmt(deelEffectiveRate, 2)} vs promedio ${fmt(deelAvgRate, 2)} COP/USD)`)}`);
  }
}

function renderSignalTable(analysis) {
  console.log('');
  console.log(chalk.cyan(line('─')));
  console.log(chalk.cyan.bold('  SEÑALES TÉCNICAS'));
  console.log(chalk.cyan(line('─')));
  console.log('');

  const table = new Table({
    head: [
      chalk.cyan('Señal'),
      chalk.cyan('Score'),
      chalk.cyan('Peso'),
      chalk.cyan('Interpretación'),
    ],
    colWidths: [14, 10, 8, 32],
    style: { head: [], border: [] },
  });

  const SIGNAL_NAMES = {
    level:      'Nivel USD',
    seasonal:   'Estacionalidad',
    trend:      'Tendencia',
    momentum:   'Momentum RSI',
    regression: 'Regresión',
  };

  for (const [key, s] of Object.entries(analysis.signals)) {
    const col = colorByScore(s.score);
    table.push([
      SIGNAL_NAMES[key],
      col(`${s.score}/100`),
      chalk.dim(`${Math.round(s.weight * 100)}%`),
      chalk.dim(s.label.length > 30 ? s.label.slice(0, 29) + '…' : s.label),
    ]);
  }

  // Total row
  const col = colorByScore(analysis.composite);
  table.push([
    chalk.bold('COMPUESTO'),
    col.bold(`${analysis.composite}/100`),
    '100%',
    col(scoreBar(analysis.composite, 16)),
  ]);

  console.log(table.toString());
}

function renderAsciiChart(daily) {
  const last = daily.slice(-CONFIG.CHART_DAYS);
  const rates = last.map(d => d.rate);
  const startDate = last[0].date.slice(0, 7); // YYYY-MM
  const endDate = last.at(-1).date.slice(0, 7);

  console.log('');
  console.log(chalk.cyan(line('─')));
  console.log(chalk.cyan.bold(`  EVOLUCIÓN TASA — Últimos ${CONFIG.CHART_DAYS} días hábiles`));
  console.log(chalk.dim(`  ${startDate}  →  ${endDate}`));
  console.log(chalk.cyan(line('─')));
  console.log('');

  try {
    const chart = asciichart.plot(rates, { height: 10, format: v => fmt(v, 0).padStart(7) });
    console.log(chart.split('\n').map(l => '  ' + l).join('\n'));
  } catch {
    console.log(chalk.dim('  (No se pudo renderizar el chart ASCII)'));
  }

  console.log('');
  console.log(chalk.dim(`  ← ${startDate}${' '.repeat(42)}${endDate} →`));
}

function renderForecast(analysis) {
  const { forecastPoints, forecastLow, forecastHigh, bestWindowDesc, reg } = analysis;

  console.log('');
  console.log(chalk.cyan(line('─')));
  console.log(chalk.cyan.bold(`  PROYECCIÓN — Próximos ${CONFIG.FORECAST_DAYS} días`));
  console.log(chalk.cyan(line('─')));
  console.log('');

  const col = colorByScore(reg.slope > 0 ? 70 : 35);

  console.log(`  Tendencia proyectada: ${col(reg.slope > 0 ? 'ALCISTA (USD se fortalece)' : 'BAJISTA (COP se recupera)')}`);
  console.log(`  Rango probable: ${fmt(forecastLow, 0)} – ${fmt(forecastHigh, 0)} COP/USD`);
  console.log(`  Mejor ventana:  ${chalk.yellow(bestWindowDesc)}`);
  console.log('');

  // Mini table: days 7, 14, 21, 30
  const checkpoints = [7, 14, 21, 30].filter(d => d <= CONFIG.FORECAST_DAYS);
  const table = new Table({
    head: [chalk.cyan('Día'), chalk.cyan('Proyección'), chalk.cyan('Rango'), chalk.cyan('Deel efectivo')],
    colWidths: [8, 14, 22, 16],
    style: { head: [], border: [] },
  });

  for (const day of checkpoints) {
    const p = forecastPoints[day - 1];
    if (!p) continue;
    table.push([
      `+${day}d`,
      fmt(p.predicted, 0),
      `${fmt(p.low, 0)} – ${fmt(p.high, 0)}`,
      fmt(p.predicted * (1 - CONFIG.DEEL_SPREAD_PCT), 0),
    ]);
  }
  console.log(table.toString());
}

function renderSeasonality(analysis) {
  const { season, currentMonth } = analysis;
  const months = Object.entries(season).sort((a, b) => a[0] - b[0]);
  if (months.length === 0) return;

  console.log('');
  console.log(chalk.cyan(line('─')));
  console.log(chalk.cyan.bold('  ESTACIONALIDAD — Promedio mensual histórico'));
  console.log(chalk.cyan(line('─')));
  console.log('');

  const table = new Table({
    head: [chalk.cyan('Mes'), chalk.cyan('Promedio COP'), chalk.cyan('vs Año'), chalk.cyan('Patrón'), chalk.cyan('n')],
    colWidths: [14, 14, 10, 18, 5],
    style: { head: [], border: [] },
  });

  for (const [m, data] of months) {
    const month = parseInt(m);
    const isCurrent = month === currentMonth;
    const bar = (data.deviationPct >= 0 ? '▲' : '▼').repeat(
      Math.min(8, Math.max(1, Math.round(Math.abs(data.deviationPct) * 2)))
    );
    const devCol = data.deviationPct >= 0 ? chalk.green : chalk.red;
    const nameCol = isCurrent ? chalk.cyan.bold : (s => s);

    table.push([
      nameCol(`${isCurrent ? '→ ' : '  '}${MONTH_NAMES[month - 1].slice(0, 9)}`),
      fmt(data.avgRate, 0),
      devCol(fmtPct(data.deviationPct)),
      devCol(bar),
      data.sampleCount,
    ]);
  }

  console.log(table.toString());
}

function renderFooter(fromCache, stale) {
  console.log('');
  console.log(chalk.cyan(line()));
  console.log(chalk.cyan.bold('  METODOLOGÍA'));
  console.log(chalk.cyan(line('─')));
  console.log(chalk.dim(`  Fuente:       Frankfurter API (api.frankfurter.dev) — Gratuita, sin auth`));
  console.log(chalk.dim(`  Indicadores:  SMA-${CONFIG.SMA_SHORT}/${CONFIG.SMA_LONG}, EMA-${CONFIG.EMA_PERIOD}, RSI-${CONFIG.RSI_PERIOD}, Regresión OLS, Estacionalidad`));
  console.log(chalk.dim(`  Spread Deel:  ${(CONFIG.DEEL_SPREAD_PCT * 100).toFixed(2)}% sobre mid-market (estimado, verificar en app)`));
  console.log(chalk.dim(`  Cache:        ${fromCache ? (stale ? 'Datos en caché (desactualizados)' : 'Desde caché local (< 4h)') : 'Datos frescos de API'}`));
  console.log('');
  console.log(chalk.yellow.dim(`  ⚠  El tipo de cambio es inherentemente impredecible. Esta herramienta`));
  console.log(chalk.yellow.dim(`     identifica patrones históricos, no garantiza resultados futuros.`));
  console.log(chalk.yellow.dim(`     Eventos macroeconómicos (política, petróleo, elecciones) no están modelados.`));
  console.log(chalk.cyan(line()));
  console.log('');
}

// ─── Main render ──────────────────────────────────────────────────────────────

export function renderAll(analysis, { fromCache, stale } = {}) {
  renderHeader(analysis);
  renderRecommendation(analysis);
  renderSignalTable(analysis);
  renderAsciiChart(analysis.daily ?? []);
  renderForecast(analysis);
  renderSeasonality(analysis);
  renderFooter(fromCache, stale);
}
