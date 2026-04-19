'use client';

import { useState, useRef, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt    = n => '$' + Math.round(n).toLocaleString();
const pct    = n => (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
const YEAR   = new Date().getFullYear();
const YEARS  = Array.from({ length: YEAR - 1993 }, (_, i) => 1993 + i);

const QUICK_TICKERS = ['SPY', 'QQQ', 'VTI', 'AAPL', 'MSFT', 'NVDA', 'BRK-B', 'VGT', 'ARKK'];

// ── Data fetching ─────────────────────────────────────────────────────────────
async function fetchMonthlyPrices(ticker, startYear, endYear) {
  const from = Math.floor(new Date(`${startYear}-01-01`).getTime() / 1000);
  const to   = Math.floor(new Date(`${endYear}-12-31`).getTime() / 1000);
  const url  = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${from}&period2=${to}&interval=1mo`;
  const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;

  const res  = await fetch(proxy);
  if (!res.ok) throw new Error('Network error. Please try again.');
  const data = await res.json();

  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(`No data found for "${ticker}". Check the ticker symbol.`);

  const timestamps = result.timestamps || result.timestamp;
  const closes     = result.indicators?.adjclose?.[0]?.adjclose
                  || result.indicators?.quote?.[0]?.close;
  if (!timestamps || !closes) throw new Error(`Incomplete data for "${ticker}".`);

  const monthly = {};
  timestamps.forEach((ts, i) => {
    if (closes[i] == null) return;
    const d   = new Date(ts * 1000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthly[key] = closes[i];
  });

  return monthly;
}

// ── DCA simulation ─────────────────────────────────────────────────────────────
function simulate(monthly, startYear, endYear, monthlyDeposit, initialInvestment) {
  let shares   = 0;
  let invested = initialInvestment;
  const rows   = [];
  let prevValue = null;

  if (initialInvestment > 0) {
    const fp = monthly[`${startYear}-01`];
    if (fp) shares += initialInvestment / fp;
  }

  for (let y = startYear; y <= endYear; y++) {
    for (let m = 1; m <= 12; m++) {
      const key   = `${y}-${String(m).padStart(2, '0')}`;
      const price = monthly[key];
      if (!price) continue;
      shares   += monthlyDeposit / price;
      invested += monthlyDeposit;
    }

    const yearKeys  = Object.keys(monthly).filter(k => k.startsWith(`${y}-`)).sort();
    const lastKey   = yearKeys[yearKeys.length - 1];
    const yearPrice = lastKey ? monthly[lastKey] : null;
    if (!yearPrice) continue;

    const portfolioVal = shares * yearPrice;
    const gain         = portfolioVal - invested;
    const annRet       = prevValue != null ? ((portfolioVal / prevValue) - 1) * 100 : null;
    prevValue = portfolioVal;

    rows.push({ year: y, invested, portfolioVal, gain, annRet });
  }

  return rows;
}

// ── Custom tooltip for chart ──────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#111518',
      border: '1px solid #1f2a33',
      borderRadius: 10,
      padding: '12px 16px',
      fontFamily: 'monospace',
      fontSize: 13,
    }}>
      <p style={{ color: '#EE8511', marginBottom: 6, fontWeight: 600 }}>{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color, margin: '2px 0' }}>
          {p.name}: {fmt(p.value)}
        </p>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function DCACalculator() {
  const [ticker,    setTicker]    = useState('');
  const [startYear, setStartYear] = useState(2010);
  const [endYear,   setEndYear]   = useState(YEAR - 1);
  const [monthly,   setMonthly]   = useState('');
  const [initial,   setInitial]   = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [rows,      setRows]      = useState([]);
  const [summary,   setSummary]   = useState(null);

  const resultsRef = useRef(null);

  async function calculate() {
    setError('');
    setRows([]);
    setSummary(null);

    const sym  = ticker.trim().toUpperCase();
    const mon  = parseFloat(monthly) || 0;
    const init = parseFloat(initial) || 0;

    if (!sym)               return setError('Please enter a ticker symbol.');
    if (+startYear >= +endYear) return setError('Start year must be before end year.');
    if (mon <= 0 && init <= 0)  return setError('Enter a monthly deposit or initial investment.');

    setLoading(true);
    try {
      const priceMap = await fetchMonthlyPrices(sym, startYear, endYear);
      const data     = simulate(priceMap, +startYear, +endYear, mon, init);
      if (!data.length) throw new Error('No data found for that date range.');

      const last      = data[data.length - 1];
      const totalGain = last.portfolioVal - last.invested;
      const roi       = (totalGain / last.invested) * 100;

      setSummary({
        label:  `${sym} · ${startYear} → ${endYear}`,
        final:  last.portfolioVal,
        invested: last.invested,
        gain:   totalGain,
        roi,
      });
      setRows(data);

      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.');
    }
    setLoading(false);
  }

  const chartData = rows.map(r => ({
    year:      r.year,
    'Portfolio Value': Math.round(r.portfolioVal),
    'Total Invested':  Math.round(r.invested),
  }));

  // ── Styles ─────────────────────────────────────────────────────────────────
  const s = {
    page: {
      minHeight: '100vh',
      background: '#0a0d0f',
      color: '#e8e4dc',
      fontFamily: "'DM Sans', sans-serif",
      padding: '0 24px 80px',
    },
    container: { maxWidth: 900, margin: '0 auto' },
    header: { textAlign: 'center', padding: '56px 0 40px' },
    eyebrow: {
      fontFamily: 'monospace',
      fontSize: 11,
      letterSpacing: '0.3em',
      color: '#EE8511',
      textTransform: 'uppercase',
      marginBottom: 16,
    },
    h1: {
      fontFamily: "'Playfair Display', serif",
      fontSize: 'clamp(36px, 6vw, 64px)',
      fontWeight: 900,
      lineHeight: 1.05,
      letterSpacing: '-0.02em',
      margin: '0 0 16px',
    },
    yellow: { color: '#EE8511', fontStyle: 'italic' },
    subtitle: { color: '#6b7a87', fontSize: 16, fontWeight: 300 },
    card: {
      background: '#111518',
      border: '1px solid #1f2a33',
      borderRadius: 20,
      padding: '36px 40px',
      marginBottom: 32,
    },
    grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 },
    fullCol: { gridColumn: '1 / -1' },
    label: {
      display: 'block',
      fontFamily: 'monospace',
      fontSize: 10,
      letterSpacing: '0.2em',
      textTransform: 'uppercase',
      color: '#6b7a87',
      marginBottom: 8,
    },
    inputWrap: { position: 'relative' },
    prefix: {
      position: 'absolute',
      left: 14,
      top: '50%',
      transform: 'translateY(-50%)',
      color: '#6b7a87',
      fontFamily: 'monospace',
      fontSize: 14,
      pointerEvents: 'none',
    },
    input: {
      width: '100%',
      background: '#181e23',
      border: '1px solid #1f2a33',
      borderRadius: 10,
      padding: '12px 16px',
      color: '#e8e4dc',
      fontFamily: 'monospace',
      fontSize: 15,
      outline: 'none',
      boxSizing: 'border-box',
    },
    inputPrefix: {
      paddingLeft: 32,
    },
    select: {
      width: '100%',
      background: '#181e23',
      border: '1px solid #1f2a33',
      borderRadius: 10,
      padding: '12px 16px',
      color: '#e8e4dc',
      fontFamily: 'monospace',
      fontSize: 15,
      outline: 'none',
      appearance: 'none',
      cursor: 'pointer',
    },
    chips: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 },
    chip: {
      fontFamily: 'monospace',
      fontSize: 11,
      padding: '4px 10px',
      border: '1px solid #1f2a33',
      borderRadius: 20,
      color: '#6b7a87',
      cursor: 'pointer',
      background: 'transparent',
    },
    btn: {
      width: '100%',
      marginTop: 28,
      padding: '17px',
      background: '#EE8511',
      color: '#0a0d0f',
      border: 'none',
      borderRadius: 12,
      fontFamily: "'DM Sans', sans-serif",
      fontWeight: 600,
      fontSize: 15,
      letterSpacing: '0.04em',
      cursor: 'pointer',
    },
    errorBox: {
      marginTop: 16,
      background: 'rgba(231,76,60,0.1)',
      border: '1px solid rgba(231,76,60,0.3)',
      borderRadius: 10,
      padding: '14px 18px',
      color: '#ff8a7a',
      fontSize: 14,
    },
    // Results
    resHeader: {
      textAlign: 'center',
      paddingBottom: 32,
      marginBottom: 32,
      borderBottom: '1px solid #1f2a33',
    },
    tickerLabel: {
      fontFamily: 'monospace',
      fontSize: 11,
      letterSpacing: '0.2em',
      color: '#EE8511',
      textTransform: 'uppercase',
      marginBottom: 12,
    },
    bigNum: {
      fontFamily: "'Playfair Display', serif",
      fontSize: 'clamp(44px, 8vw, 76px)',
      fontWeight: 700,
      color: '#2ecc71',
      lineHeight: 1,
      letterSpacing: '-0.02em',
    },
    bigLabel: { color: '#6b7a87', fontSize: 14, marginTop: 8 },
    statsRow: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 32 },
    statBox: {
      background: '#181e23',
      border: '1px solid #1f2a33',
      borderRadius: 12,
      padding: 20,
      textAlign: 'center',
    },
    statVal: { fontFamily: 'monospace', fontSize: 22, fontWeight: 500, marginBottom: 4 },
    statLabel: { fontSize: 11, color: '#6b7a87', letterSpacing: '0.05em' },
    chartWrap: { height: 260, marginBottom: 32 },
    tableTitle: {
      fontFamily: 'monospace',
      fontSize: 10,
      letterSpacing: '0.2em',
      textTransform: 'uppercase',
      color: '#6b7a87',
      marginBottom: 10,
    },
    tableWrap: {
      border: '1px solid #1f2a33',
      borderRadius: 12,
      overflow: 'hidden',
      maxHeight: 280,
      overflowY: 'auto',
    },
    table: { width: '100%', borderCollapse: 'collapse', fontFamily: 'monospace', fontSize: 13 },
    th: {
      background: '#181e23',
      color: '#6b7a87',
      fontSize: 10,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      padding: '11px 16px',
      textAlign: 'left',
      position: 'sticky',
      top: 0,
    },
    td: { padding: '10px 16px', borderTop: '1px solid #1f2a33', color: '#e8e4dc' },
    affiliateBar: {
      marginTop: 28,
      background: 'rgba(238,133,17,0.07)',
      border: '1px solid rgba(238,133,17,0.2)',
      borderRadius: 14,
      padding: '18px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      flexWrap: 'wrap',
    },
    affiliateBtn: {
      padding: '10px 20px',
      background: 'transparent',
      border: '1px solid #EE8511',
      borderRadius: 8,
      color: '#EE8511',
      fontSize: 13,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      fontFamily: "'DM Sans', sans-serif",
    },
    disclaimer: {
      textAlign: 'center',
      color: '#3a4a57',
      fontSize: 11,
      marginTop: 40,
      paddingTop: 24,
      borderTop: '1px solid #1f2a33',
      lineHeight: 1.7,
    },
  };

  return (
    <>
      {/* Google fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Playfair+Display:ital,wght@0,700;0,900;1,700&display=swap');
      `}</style>

      <div style={s.page}>
        <div style={s.container}>

          {/* Header */}
          <header style={s.header}>
            <p style={s.eyebrow}>Dollar-Cost Averaging Calculator</p>
            <h1 style={s.h1}>
              What if you had<br />
              <span style={s.yellow}>stayed invested?</span>
            </h1>
            <p style={s.subtitle}>
              Enter any stock or ETF — see exactly what consistent investing would have built.
            </p>
          </header>

          {/* Input Card */}
          <div style={s.card}>
            <div style={s.grid2}>

              {/* Ticker */}
              <div style={{ ...s.fullCol }}>
                <label style={s.label}>Stock / ETF Ticker</label>
                <input
                  style={s.input}
                  type="text"
                  value={ticker}
                  onChange={e => setTicker(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && calculate()}
                  placeholder="e.g. SPY, QQQ, AAPL, MSFT"
                  autoCapitalize="characters"
                  spellCheck={false}
                />
                <div style={s.chips}>
                  {QUICK_TICKERS.map(t => (
                    <button key={t} style={s.chip} onClick={() => setTicker(t)}>{t}</button>
                  ))}
                </div>
              </div>

              {/* Start Year */}
              <div>
                <label style={s.label}>Start Year</label>
                <select style={s.select} value={startYear} onChange={e => setStartYear(e.target.value)}>
                  {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>

              {/* End Year */}
              <div>
                <label style={s.label}>End Year</label>
                <select style={s.select} value={endYear} onChange={e => setEndYear(e.target.value)}>
                  {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>

              {/* Monthly Deposit */}
              <div>
                <label style={s.label}>Monthly Deposit</label>
                <div style={s.inputWrap}>
                  <span style={s.prefix}>$</span>
                  <input
                    style={{ ...s.input, ...s.inputPrefix }}
                    type="number"
                    value={monthly}
                    onChange={e => setMonthly(e.target.value)}
                    placeholder="500"
                    min="0"
                  />
                </div>
              </div>

              {/* Initial Investment */}
              <div>
                <label style={s.label}>Initial Investment (optional)</label>
                <div style={s.inputWrap}>
                  <span style={s.prefix}>$</span>
                  <input
                    style={{ ...s.input, ...s.inputPrefix }}
                    type="number"
                    value={initial}
                    onChange={e => setInitial(e.target.value)}
                    placeholder="0"
                    min="0"
                  />
                </div>
              </div>

            </div>

            <button style={s.btn} onClick={calculate} disabled={loading}>
              {loading ? 'Fetching data…' : 'Calculate My Wealth Growth →'}
            </button>

            {error && <div style={s.errorBox}>⚠ {error}</div>}
          </div>

          {/* Results */}
          {summary && (
            <div ref={resultsRef} style={s.card}>

              {/* Summary header */}
              <div style={s.resHeader}>
                <p style={s.tickerLabel}>{summary.label}</p>
                <p style={s.bigNum}>{fmt(summary.final)}</p>
                <p style={s.bigLabel}>Total Portfolio Value</p>
              </div>

              {/* Stats */}
              <div style={s.statsRow}>
                <div style={s.statBox}>
                  <p style={s.statVal}>{fmt(summary.invested)}</p>
                  <p style={s.statLabel}>Total Invested</p>
                </div>
                <div style={s.statBox}>
                  <p style={{ ...s.statVal, color: summary.gain >= 0 ? '#2ecc71' : '#e74c3c' }}>
                    {fmt(summary.gain)}
                  </p>
                  <p style={s.statLabel}>Investment Gain</p>
                </div>
                <div style={s.statBox}>
                  <p style={{ ...s.statVal, color: summary.roi >= 0 ? '#2ecc71' : '#e74c3c' }}>
                    {pct(summary.roi)}
                  </p>
                  <p style={s.statLabel}>Return on Investment</p>
                </div>
              </div>

              {/* Chart */}
              <div style={s.chartWrap}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="year" tick={{ fill: '#3a4a57', fontSize: 11, fontFamily: 'monospace' }} />
                    <YAxis
                      tick={{ fill: '#3a4a57', fontSize: 11, fontFamily: 'monospace' }}
                      tickFormatter={v => v >= 1e6 ? `$${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v/1e3).toFixed(0)}K` : `$${v}`}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ color: '#6b7a87', fontSize: 12, fontFamily: 'monospace' }} />
                    <Line type="monotone" dataKey="Portfolio Value" stroke="#2ecc71" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="Total Invested"  stroke="#EE8511" strokeWidth={1.5} strokeDasharray="5 4" dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Table */}
              <p style={s.tableTitle}>Year-by-Year Breakdown</p>
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      {['Year','Invested','Portfolio Value','Gain / Loss','Annual Return'].map(h => (
                        <th key={h} style={s.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.year}>
                        <td style={s.td}>{r.year}</td>
                        <td style={s.td}>{fmt(r.invested)}</td>
                        <td style={s.td}>{fmt(r.portfolioVal)}</td>
                        <td style={{ ...s.td, color: r.gain >= 0 ? '#2ecc71' : '#e74c3c' }}>{fmt(r.gain)}</td>
                        <td style={{ ...s.td, color: r.annRet == null ? '#6b7a87' : r.annRet >= 0 ? '#2ecc71' : '#e74c3c' }}>
                          {r.annRet != null ? pct(r.annRet) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Affiliate CTA */}
              <div style={s.affiliateBar}>
                <p style={{ fontSize: 14, color: '#6b7a87', margin: 0 }}>
                  Ready to start? <strong style={{ color: '#EE8511' }}>Open a commission-free account</strong> and begin your DCA journey today.
                </p>
                <button style={s.affiliateBtn} onClick={() => window.open('https://robinhood.com', '_blank')}>
                  Start Investing Free →
                </button>
              </div>

            </div>
          )}

          <p style={s.disclaimer}>
            Past performance does not guarantee future results. This tool uses historical price data for educational purposes only.<br />
            Not financial advice. Data via Yahoo Finance. Dividends and taxes not modeled.
          </p>

        </div>
      </div>
    </>
  );
}