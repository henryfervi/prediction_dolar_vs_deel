import { loadRates } from './fetcher.js';
import { computeAnalysis } from './scorer.js';
import { renderAll } from './renderer.js';
import { generateHTMLReport } from './report.js';

// ─── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const withHTML = args.includes('--html');
const noCache = args.includes('--no-cache');

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n  Obteniendo datos de tasa de cambio USD/COP...');

  let daily, monthly, fromCache, stale;
  try {
    ({ daily, monthly, fromCache, stale } = await loadRates(noCache));
  } catch (err) {
    console.error(`\n  ERROR: ${err.message}\n`);
    process.exit(1);
  }

  console.log(`  ${daily.length} puntos diarios cargados (${daily[0].date} → ${daily.at(-1).date})`);
  if (fromCache && !stale) console.log('  (desde caché local)');
  if (stale) console.log('  AVISO: usando caché desactualizado (no se pudo conectar a la API)');

  const analysis = computeAnalysis(daily, monthly);

  // Pass raw series for rendering
  analysis.daily = daily;
  analysis.monthly = monthly;

  renderAll(analysis, { fromCache, stale });

  if (withHTML) {
    console.log('  Generando reporte HTML...');
    const outputPath = await generateHTMLReport(analysis);
    console.log(`  Reporte guardado en: ${outputPath}\n`);
  }
}

main().catch(err => {
  console.error('\n  ERROR inesperado:', err.message);
  process.exit(1);
});
