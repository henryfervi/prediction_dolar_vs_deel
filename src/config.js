export const CONFIG = {
  // Currencies
  BASE: 'USD',
  QUOTE: 'COP',

  // Deel spread: ~0.75% above mid-market (midpoint of 0.5-1% documented range)
  DEEL_SPREAD_PCT: 0.0075,

  // Data lookback: días corridos desde el 1 de enero del año actual hasta hoy
  LOOKBACK_CALENDAR_DAYS: Math.ceil((new Date() - new Date(new Date().getFullYear(), 0, 1)) / (1000 * 60 * 60 * 24)) + 1,

  // Cache
  CACHE_FILE: './cache/rates.json',
  CACHE_TTL_MS: 4 * 60 * 60 * 1000, // 4 hours

  // Technical indicator periods
  SMA_SHORT: 10,
  SMA_LONG: 50,
  EMA_PERIOD: 21,
  RSI_PERIOD: 14,

  // RSI thresholds tuned for COP (wider range than major pairs)
  RSI_OVERSOLD: 40,
  RSI_OVERBOUGHT: 60,

  // Forecast window (matches monthly payroll cycle)
  FORECAST_DAYS: 30,

  // Composite score weights (must sum to 1.0)
  // "level" = ¿el dólar está alto vs su historia? — señal más importante
  WEIGHTS: {
    level:    0.40,   // percentil histórico: ¿el dólar está caro ahora?
    seasonal: 0.20,   // ¿es buen mes históricamente?
    trend:    0.20,   // ¿el dólar está subiendo o bajando?
    momentum: 0.10,   // RSI: impulso reciente
    regression: 0.10, // desviación vs tendencia de largo plazo
  },

  // Recommendation thresholds
  SCORE_TRANSFER: 65,  // >= 65 → TRANSFERIR AHORA
  SCORE_MONITOR: 40,   // 40-64 → MONITOREAR
                       // < 40  → ESPERAR

  // ASCII chart display: last N trading days
  CHART_DAYS: 60,

  // Volatility window
  VOLATILITY_WINDOW: 20,
};
