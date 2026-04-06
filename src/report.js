import { writeFileSync } from 'fs';
import { join } from 'path';
import open from 'open';
import { CONFIG } from './config.js';
import { MONTH_NAMES } from './scorer.js';

function fmtCOP(n) {
  return n.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function scoreColor(score) {
  if (score >= CONFIG.SCORE_TRANSFER) return '#22c55e';
  if (score >= CONFIG.SCORE_MONITOR) return '#eab308';
  return '#ef4444';
}

export async function generateHTMLReport(analysis) {
  const {
    currentDate, currentRate, deelEffectiveRate, deelAvgRate,
    oportunidadPesos, ejemploUSD,
    composite, action, actionEmoji,
    max2yr, min2yr, avg2yr, maxDate, minDate, currentVsAvgPct, currentPercentile,
    signals, reasoning, reg, forecastPoints, forecastLow, forecastHigh, bestWindowDesc,
    daily, monthly, season, currentMonth,
  } = analysis;

  // Data for charts
  const dailyDates = daily.map(d => d.date);
  const dailyRates = daily.map(d => d.rate);
  const smaShortData = analysis.smaShort;
  const smaLongData = analysis.smaLong;

  // Forecast series (from today, next 30 days as pseudo-dates)
  const lastDate = new Date(currentDate);
  const forecastDates = forecastPoints.map((_, i) => {
    const d = new Date(lastDate);
    d.setDate(d.getDate() + i + 1);
    return d.toISOString().split('T')[0];
  });
  const forecastPredicted = forecastPoints.map(p => p.predicted.toFixed(0));
  const forecastLowArr = forecastPoints.map(p => p.low.toFixed(0));
  const forecastHighArr = forecastPoints.map(p => p.high.toFixed(0));

  // Seasonal bar data
  const seasonMonths = Object.entries(season).sort((a, b) => a[0] - b[0]);
  const seasonLabels = seasonMonths.map(([m]) => MONTH_NAMES[parseInt(m) - 1].slice(0, 3));
  const seasonAvgs = seasonMonths.map(([, d]) => d.avgRate.toFixed(0));
  const seasonColors = seasonMonths.map(([m]) => parseInt(m) === currentMonth ? '#06b6d4' : '#334155');

  const col = scoreColor(composite);

  // SIGNAL_NAMES map
  const SIGNAL_NAMES = {
    level:      'Nivel USD (percentil)',
    seasonal:   'Estacionalidad',
    trend:      'Tendencia (SMA/EMA)',
    momentum:   'Momentum (RSI-14)',
    regression: 'Regresión (OLS)',
  };

  const signalRows = Object.entries(signals).map(([key, s]) => {
    const barColor = scoreColor(s.score);
    return `
      <tr>
        <td>${SIGNAL_NAMES[key] || key}</td>
        <td style="color:${barColor};font-weight:bold">${s.score}/100</td>
        <td>${Math.round(s.weight * 100)}%</td>
        <td>
          <div style="background:#1e293b;border-radius:4px;height:8px;width:100%">
            <div style="background:${barColor};width:${s.score}%;height:8px;border-radius:4px"></div>
          </div>
        </td>
        <td style="color:#94a3b8;font-size:12px">${s.label}</td>
      </tr>`;
  }).join('');

  const forecastCheckRows = [7, 14, 21, 30]
    .filter(d => d <= CONFIG.FORECAST_DAYS)
    .map(d => {
      const p = forecastPoints[d - 1];
      if (!p) return '';
      return `
      <tr>
        <td>+${d} días</td>
        <td>${fmtCOP(p.predicted)}</td>
        <td>${fmtCOP(p.low)} – ${fmtCOP(p.high)}</td>
        <td>${fmtCOP(p.predicted * (1 - CONFIG.DEEL_SPREAD_PCT))}</td>
      </tr>`;
    }).join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>USD/COP Transfer Advisor — ${currentDate}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0f172a; color: #e2e8f0; font-family: 'Segoe UI', system-ui, sans-serif; padding: 24px; }
  h1 { font-size: 1.6rem; color: #06b6d4; }
  h2 { font-size: 1.1rem; color: #94a3b8; font-weight: 600; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1px; }
  .subtitle { color: #64748b; font-size: 0.85rem; margin-top: 4px; }
  .grid { display: grid; gap: 20px; }
  .grid-2 { grid-template-columns: 1fr 1fr; }
  .grid-3 { grid-template-columns: 1fr 1fr 1fr; }
  .card { background: #1e293b; border-radius: 12px; padding: 20px; border: 1px solid #334155; }
  .score-big { font-size: 4rem; font-weight: 900; color: ${col}; line-height: 1; }
  .action-big { font-size: 1.4rem; font-weight: 700; color: ${col}; margin-top: 8px; }
  .score-bar-wrap { background: #0f172a; border-radius: 99px; height: 14px; margin: 14px 0; overflow: hidden; }
  .score-bar { height: 14px; border-radius: 99px; background: ${col}; width: ${composite}%; }
  .stat { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #1e293b; font-size: 0.9rem; }
  .stat:last-child { border-bottom: none; }
  .stat-label { color: #64748b; }
  .stat-value { font-weight: 600; }
  .green { color: #22c55e; }
  .yellow { color: #eab308; }
  .red { color: #ef4444; }
  .cyan { color: #06b6d4; }
  .dim { color: #64748b; font-size: 0.8rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  th { text-align: left; color: #06b6d4; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; padding: 8px 6px; border-bottom: 1px solid #334155; }
  td { padding: 8px 6px; border-bottom: 1px solid #1e293b; vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  .chart-container { position: relative; height: 280px; }
  .forecast-container { position: relative; height: 220px; }
  .seasonal-container { position: relative; height: 220px; }
  .warning { background: #1c1204; border: 1px solid #854d0e; border-radius: 8px; padding: 14px; font-size: 0.82rem; color: #fbbf24; margin-top: 16px; }
  .tag { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 0.75rem; font-weight: 700; background: ${col}22; color: ${col}; }
  @media (max-width: 700px) { .grid-2, .grid-3 { grid-template-columns: 1fr; } }
</style>
</head>
<body>

<div style="max-width: 1100px; margin: 0 auto;">

  <!-- Header -->
  <div style="margin-bottom:24px; display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px">
    <div>
      <h1>USD/COP Transfer Advisor</h1>
      <div class="subtitle">Deel → Cuenta Bancaria Colombia &nbsp;|&nbsp; ${currentDate} &nbsp;|&nbsp; Frankfurter API</div>
    </div>
    <div class="tag">${composite >= CONFIG.SCORE_TRANSFER ? 'TRANSFERIR' : composite >= CONFIG.SCORE_MONITOR ? 'MONITOREAR' : 'ESPERAR'}</div>
  </div>

  <!-- Row 1: Score + Stats -->
  <div class="grid grid-2" style="margin-bottom:20px">

    <!-- Score card -->
    <div class="card">
      <h2>Recomendación</h2>
      <div class="score-big">${composite}</div>
      <div class="score-bar-wrap"><div class="score-bar"></div></div>
      <div class="action-big">${actionEmoji} ${action}</div>
      <div style="margin-top:16px; color:#94a3b8; font-size:0.85rem;">
        ${reasoning.map(r => `<div style="margin-bottom:4px">${r}</div>`).join('')}
      </div>
    </div>

    <!-- Stats card -->
    <div class="card">
      <h2>Tasas</h2>
      <div class="stat"><span class="stat-label">Tasa mid-market</span><span class="stat-value">${fmtCOP(currentRate)} COP/USD</span></div>
      <div class="stat"><span class="stat-label">Tasa efectiva Deel (-${(CONFIG.DEEL_SPREAD_PCT*100).toFixed(2)}%)</span><span class="stat-value yellow">${fmtCOP(deelEffectiveRate)} COP/USD</span></div>
      <div class="stat" style="margin-top:12px"><span class="stat-label">Máximo 2 años</span><span class="stat-value green">${fmtCOP(max2yr)} <span class="dim">(${maxDate})</span></span></div>
      <div class="stat"><span class="stat-label">Mínimo 2 años</span><span class="stat-value red">${fmtCOP(min2yr)} <span class="dim">(${minDate})</span></span></div>
      <div class="stat"><span class="stat-label">Promedio 2 años</span><span class="stat-value">${fmtCOP(avg2yr)}</span></div>
      <div class="stat"><span class="stat-label">Actual vs promedio</span><span class="stat-value ${currentVsAvgPct >= 0 ? 'green' : 'red'}">${currentVsAvgPct >= 0 ? '+' : ''}${currentVsAvgPct.toFixed(1)}%</span></div>
      <div class="stat"><span class="stat-label">Percentil histórico</span><span class="stat-value">${currentPercentile.toFixed(0)}°/100</span></div>
      <div style="margin-top:14px; padding:12px; background:#0f172a; border-radius:8px; border-left:3px solid ${oportunidadPesos > 0 ? '#eab308' : '#22c55e'}">
        <div style="font-size:0.75rem; color:#64748b; margin-bottom:4px">COSTO DE OPORTUNIDAD (por $${fmtCOP(ejemploUSD)} USD)</div>
        ${oportunidadPesos > 0
          ? `<div style="color:#eab308;font-weight:700;font-size:1.05rem">Si esperas al promedio histórico: +$${fmtCOP(oportunidadPesos)} pesos más</div>
             <div style="font-size:0.8rem;color:#64748b;margin-top:4px">Promedio Deel: ${fmtCOP(deelAvgRate)} vs hoy: ${fmtCOP(deelEffectiveRate)} COP/USD</div>`
          : `<div style="color:#22c55e;font-weight:700;font-size:1.05rem">El dólar está sobre el promedio: +$${fmtCOP(Math.abs(oportunidadPesos))} pesos extra</div>
             <div style="font-size:0.8rem;color:#64748b;margin-top:4px">Hoy: ${fmtCOP(deelEffectiveRate)} vs promedio: ${fmtCOP(deelAvgRate)} COP/USD</div>`
        }
      </div>
    </div>
  </div>

  <!-- Row 2: Rate chart -->
  <div class="card" style="margin-bottom:20px">
    <h2>Evolución tasa diaria — Últimos 2 años</h2>
    <div class="chart-container">
      <canvas id="rateChart"></canvas>
    </div>
  </div>

  <!-- Row 3: Signals + Forecast table -->
  <div class="grid grid-2" style="margin-bottom:20px">

    <!-- Signals -->
    <div class="card">
      <h2>Señales técnicas</h2>
      <table>
        <thead><tr><th>Señal</th><th>Score</th><th>Peso</th><th style="width:80px">Bar</th><th>Interpretación</th></tr></thead>
        <tbody>${signalRows}</tbody>
      </table>
    </div>

    <!-- Forecast table -->
    <div class="card">
      <h2>Proyección próximos ${CONFIG.FORECAST_DAYS} días</h2>
      <div class="stat"><span class="stat-label">Tendencia</span><span class="stat-value ${reg.slope > 0 ? 'green' : 'red'}">${reg.slope > 0 ? 'Alcista (USD sube)' : 'Bajista (COP sube)'}</span></div>
      <div class="stat"><span class="stat-label">Rango probable</span><span class="stat-value">${fmtCOP(forecastLow)} – ${fmtCOP(forecastHigh)}</span></div>
      <div class="stat" style="margin-bottom:12px"><span class="stat-label">Mejor ventana</span><span class="stat-value yellow">${bestWindowDesc}</span></div>
      <table>
        <thead><tr><th>Horizonte</th><th>Proyección</th><th>Rango</th><th>Deel efectivo</th></tr></thead>
        <tbody>${forecastCheckRows}</tbody>
      </table>
    </div>
  </div>

  <!-- Row 4: Forecast chart + Seasonal chart -->
  <div class="grid grid-2" style="margin-bottom:20px">
    <div class="card">
      <h2>Proyección con banda de confianza</h2>
      <div class="forecast-container">
        <canvas id="forecastChart"></canvas>
      </div>
    </div>
    <div class="card">
      <h2>Estacionalidad mensual histórica</h2>
      <div class="seasonal-container">
        <canvas id="seasonalChart"></canvas>
      </div>
    </div>
  </div>

  <!-- Footer / methodology -->
  <div class="card">
    <h2>Metodología</h2>
    <div class="grid grid-3" style="gap:12px; font-size:0.85rem">
      <div>
        <div style="color:#06b6d4;font-weight:600;margin-bottom:6px">Fuente de datos</div>
        <div class="dim">Frankfurter API (api.frankfurter.dev)</div>
        <div class="dim">Gratuita · Sin autenticación · Sin límite de llamadas</div>
        <div class="dim">Período: 2 años de días hábiles (~530 puntos)</div>
      </div>
      <div>
        <div style="color:#06b6d4;font-weight:600;margin-bottom:6px">Indicadores</div>
        <div class="dim">SMA-${CONFIG.SMA_SHORT}/${CONFIG.SMA_LONG} (cruce dorado/muerto)</div>
        <div class="dim">EMA-${CONFIG.EMA_PERIOD} (pendiente de tendencia)</div>
        <div class="dim">RSI-${CONFIG.RSI_PERIOD} (momentum)</div>
        <div class="dim">Regresión OLS + estacionalidad mensual</div>
      </div>
      <div>
        <div style="color:#06b6d4;font-weight:600;margin-bottom:6px">Spread Deel</div>
        <div class="dim">${(CONFIG.DEEL_SPREAD_PCT * 100).toFixed(2)}% sobre mid-market (estimado)</div>
        <div class="dim">Rango documentado: 0.5–1.0%</div>
        <div class="dim">Verificar tarifa real antes de transferir</div>
      </div>
    </div>
    <div class="warning">
      ⚠ El tipo de cambio es inherentemente impredecible. Esta herramienta identifica patrones
      históricos estadísticos, no garantiza resultados futuros. Eventos macroeconómicos
      (política monetaria, precio del petróleo, elecciones) no están modelados.
      Siempre verifica la tasa real en la app de Deel antes de transferir.
    </div>
  </div>

</div><!-- /max-width -->

<script>
// ── Data ─────────────────────────────────────────────────────────────────────
const dailyDates = ${JSON.stringify(dailyDates)};
const dailyRates = ${JSON.stringify(dailyRates)};
const smaShort   = ${JSON.stringify(smaShortData)};
const smaLong    = ${JSON.stringify(smaLongData)};
const forecastDates     = ${JSON.stringify(forecastDates)};
const forecastPredicted = ${JSON.stringify(forecastPredicted.map(Number))};
const forecastLowArr    = ${JSON.stringify(forecastLowArr.map(Number))};
const forecastHighArr   = ${JSON.stringify(forecastHighArr.map(Number))};
const seasonLabels = ${JSON.stringify(seasonLabels)};
const seasonAvgs   = ${JSON.stringify(seasonAvgs.map(Number))};
const seasonColors = ${JSON.stringify(seasonColors)};

const GRID_COLOR = '#334155';
const TEXT_COLOR = '#64748b';
const chartDefaults = {
  color: TEXT_COLOR,
  scales: {
    x: { ticks: { color: TEXT_COLOR, maxTicksLimit: 12 }, grid: { color: GRID_COLOR } },
    y: { ticks: { color: TEXT_COLOR }, grid: { color: GRID_COLOR } },
  },
  plugins: { legend: { labels: { color: '#94a3b8' } } },
};

// ── Rate history chart ────────────────────────────────────────────────────────
new Chart(document.getElementById('rateChart'), {
  type: 'line',
  data: {
    labels: dailyDates,
    datasets: [
      {
        label: 'USD/COP',
        data: dailyRates,
        borderColor: '#06b6d4',
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false,
        tension: 0.2,
      },
      {
        label: 'SMA-${CONFIG.SMA_SHORT}',
        data: smaShort,
        borderColor: '#f59e0b',
        borderWidth: 1,
        pointRadius: 0,
        fill: false,
        borderDash: [4, 2],
      },
      {
        label: 'SMA-${CONFIG.SMA_LONG}',
        data: smaLong,
        borderColor: '#8b5cf6',
        borderWidth: 1,
        pointRadius: 0,
        fill: false,
        borderDash: [6, 3],
      },
    ],
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    ...chartDefaults,
  },
});

// ── Forecast chart ────────────────────────────────────────────────────────────
new Chart(document.getElementById('forecastChart'), {
  type: 'line',
  data: {
    labels: [...dailyDates.slice(-30), ...forecastDates],
    datasets: [
      {
        label: 'Histórico reciente',
        data: [...dailyRates.slice(-30), ...new Array(forecastDates.length).fill(null)],
        borderColor: '#06b6d4',
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
      },
      {
        label: 'Proyección',
        data: [...new Array(30).fill(null), ...forecastPredicted],
        borderColor: '#22c55e',
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
        borderDash: [5, 3],
      },
      {
        label: 'Banda alta',
        data: [...new Array(30).fill(null), ...forecastHighArr],
        borderColor: 'transparent',
        backgroundColor: '#22c55e22',
        pointRadius: 0,
        fill: '+1',
      },
      {
        label: 'Banda baja',
        data: [...new Array(30).fill(null), ...forecastLowArr],
        borderColor: 'transparent',
        backgroundColor: '#22c55e22',
        pointRadius: 0,
        fill: false,
      },
    ],
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    ...chartDefaults,
    plugins: {
      ...chartDefaults.plugins,
      legend: { labels: { color: '#94a3b8', filter: item => !['Banda alta', 'Banda baja'].includes(item.text) } },
    },
  },
});

// ── Seasonal chart ────────────────────────────────────────────────────────────
new Chart(document.getElementById('seasonalChart'), {
  type: 'bar',
  data: {
    labels: seasonLabels,
    datasets: [{
      label: 'Promedio COP/USD',
      data: seasonAvgs,
      backgroundColor: seasonColors,
      borderRadius: 4,
    }],
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    ...chartDefaults,
    scales: {
      ...chartDefaults.scales,
      y: {
        ...chartDefaults.scales.y,
        min: Math.round(Math.min(...seasonAvgs) * 0.985),
        max: Math.round(Math.max(...seasonAvgs) * 1.015),
      },
    },
  },
});
</script>

</body>
</html>`;

  const filename = `report-${currentDate}.html`;
  const outputPath = join('./output', filename);
  writeFileSync(outputPath, html, 'utf8');

  try {
    await open(outputPath);
  } catch {
    // Non-fatal: open may fail in some environments
  }

  return outputPath;
}
