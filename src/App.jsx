'use client';

import { useState, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';

/** * SEO METADATA (For Next.js App Router)
 * Place this in your page.js or layout.js if possible, 
 * otherwise keep it here for reference.
 */
export const metadata = {
  title: 'DCA Investment Calculator | Visualize Your Wealth Growth',
  description: 'What if you had stayed invested? See how consistent DCA would have built your portfolio. Backtest any stock or ETF and visualize your wealth growth today.',
  keywords: 'DCA calculator, stock backtester, dividend reinvestment, wealth growth, investment forecast, compound interest calculator',
};

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt = n => '$' + Math.round(n).toLocaleString();
const pct = n => (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
const CURRENT_YEAR = new Date().getFullYear(); 
const HISTORICAL_YEARS = Array.from({ length: CURRENT_YEAR - 1993 + 1 }, (_, i) => 1993 + i);
const FUTURE_YEARS = Array.from({ length: 31 }, (_, i) => CURRENT_YEAR + 1 + i);
const ALL_YEARS = [...HISTORICAL_YEARS, ...FUTURE_YEARS];

const QUICK_TICKERS = ['SPY', 'QQQ', 'VTI', 'AAPL', 'MSFT', 'NVDA', 'BRK-B', 'VGT', 'ARKK'];

const getTerminalRate = (ticker) => {
  const t = ticker.toUpperCase();
  if (['QQQ', 'NVDA', 'AAPL', 'MSFT', 'VGT', 'ARKK'].includes(t)) return 0.09;
  if (['SPY', 'VTI'].includes(t)) return 0.07;
  return 0.05;
};

async function fetchMonthlyPrices(ticker, startYear, endYear) {
  const lastHistoryYear = Math.min(endYear, CURRENT_YEAR);
  const from = Math.floor(new Date(`${startYear}-01-01`).getTime() / 1000);
  const to   = Math.floor(new Date(`${lastHistoryYear}-12-31`).getTime() / 1000);
  const url  = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${from}&period2=${to}&interval=1mo`;
  const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;

  const res  = await fetch(proxy);
  if (!res.ok) throw new Error('Network error. Please try again.');
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(`No data found for "${ticker}".`);

  const timestamps = result.timestamps || result.timestamp;
  const closes     = result.indicators?.adjclose?.[0]?.adjclose || result.indicators?.quote?.[0]?.close;
  
  const monthly = {};
  if (timestamps && closes) {
    timestamps.forEach((ts, i) => {
      if (closes[i] == null) return;
      const d   = new Date(ts * 1000);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthly[key] = closes[i];
    });
  }
  return monthly;
}

function simulate(monthly, startYear, endYear, monthlyDeposit, initialInvestment, ticker) {
  let shares = 0;
  let invested = initialInvestment;
  const rows = [];
  let prevValue = null;
  const terminalRate = getTerminalRate(ticker);

  if (initialInvestment > 0) {
    const fp = monthly[`${startYear}-01`];
    if (fp) shares += initialInvestment / fp;
  }

  for (let y = startYear; y <= endYear; y++) {
    let portfolioVal = 0;
    let annRet = null;
    if (y <= CURRENT_YEAR) {
      for (let m = 1; m <= 12; m++) {
        const key = `${y}-${String(m).padStart(2, '0')}`;
        const price = monthly[key];
        if (!price) continue;
        shares += monthlyDeposit / price;
        invested += monthlyDeposit;
      }
      const yearKeys = Object.keys(monthly).filter(k => k.startsWith(`${y}-`)).sort();
      const lastKey = yearKeys[yearKeys.length - 1];
      const yearPrice = lastKey ? monthly[lastKey] : null;
      portfolioVal = yearPrice ? shares * yearPrice : (prevValue || 0);
      annRet = prevValue != null && prevValue !== 0 ? ((portfolioVal / prevValue) - 1) * 100 : null;
    } else {
      portfolioVal = (prevValue * (1 + terminalRate)) + (monthlyDeposit * 12 * (1 + terminalRate / 2));
      invested += (monthlyDeposit * 12);
      annRet = terminalRate * 100;
    }
    rows.push({ year: y, invested, portfolioVal, annRet, isForecast: y > CURRENT_YEAR });
    prevValue = portfolioVal;
  }
  return rows;
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#111518', border: '1px solid #1f2a33', borderRadius: 10, padding: '12px 16px', fontFamily: 'monospace', fontSize: 13 }}>
      <p style={{ color: '#EE8511', marginBottom: 6, fontWeight: 600 }}>{label} {label > CURRENT_YEAR ? '(Forecast)' : ''}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color, margin: '2px 0' }}>{p.name}: {fmt(p.value)}</p>
      ))}
    </div>
  );
}

export default function DCACalculator() {
  const [ticker, setTicker] = useState('');
  const [startYear, setStartYear] = useState(2010);
  const [endYear, setEndYear] = useState(CURRENT_YEAR + 5);
  const [monthly, setMonthly] = useState('');
  const [initial, setInitial] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const resultsRef = useRef(null);

  async function calculate() {
    setError('');
    setRows([]);
    setSummary(null);
    const sym = ticker.trim().toUpperCase();
    const mon = parseFloat(monthly) || 0;
    const init = parseFloat(initial) || 0;
    if (!sym) return setError('Please enter a ticker symbol.');
    if (+startYear >= +endYear) return setError('Start year must be before end year.');
    setLoading(true);
    try {
      const priceMap = await fetchMonthlyPrices(sym, startYear, endYear);
      const data = simulate(priceMap, +startYear, +endYear, mon, init, sym);
      const last = data[data.length - 1];
      setSummary({ label: `${sym} · ${startYear} → ${endYear}`, final: last.portfolioVal, invested: last.invested, gain: last.portfolioVal - last.invested, roi: ((last.portfolioVal - last.invested) / last.invested) * 100 });
      setRows(data);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (e) { setError(e.message || 'Something went wrong.'); }
    setLoading(false);
  }

  const chartData = rows.map(r => ({ year: r.year, 'Portfolio Value': Math.round(r.portfolioVal), 'Total Invested': Math.round(r.invested) }));

  const s = {
    page: { minHeight: '100vh', background: '#0a0d0f', color: '#e8e4dc', fontFamily: "'DM Sans', sans-serif", padding: '0 24px 80px' },
    container: { maxWidth: 900, margin: '0 auto' },
    header: { textAlign: 'center', padding: '56px 0 40px' },
    eyebrow: { fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.3em', color: '#EE8511', textTransform: 'uppercase', marginBottom: 16 },
    h1: { fontFamily: "'Playfair Display', serif", fontSize: 'clamp(36px, 6vw, 64px)', fontWeight: 900, lineHeight: 1.05, letterSpacing: '-0.02em', margin: '0 0 16px' },
    h2: { fontFamily: "'Playfair Display', serif", fontSize: '24px', color: '#e8e4dc', marginBottom: '16px', marginTop: '40px' },
    yellow: { color: '#EE8511', fontStyle: 'italic' },
    subtitle: { color: '#6b7a87', fontSize: 16, fontWeight: 300, maxWidth: '600px', margin: '0 auto' },
    card: { background: '#111518', border: '1px solid #1f2a33', borderRadius: 20, padding: '36px 40px', marginBottom: 32 },
    fullCol: { gridColumn: '1 / -1' },
    label: { display: 'block', fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#6b7a87', marginBottom: 8 },
    input: { width: '100%', background: '#181e23', border: '1px solid #1f2a33', borderRadius: 10, padding: '12px 16px', color: '#e8e4dc', fontFamily: 'monospace', fontSize: 15, outline: 'none', boxSizing: 'border-box' },
    btn: { width: '100%', marginTop: 28, padding: '17px', background: '#EE8511', color: '#0a0d0f', border: 'none', borderRadius: 12, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 15, cursor: 'pointer' },
    footer: { borderTop: '1px solid #1f2a33', marginTop: '60px', paddingTop: '40px', textAlign: 'left' },
    p: { color: '#6b7a87', fontSize: 14, lineHeight: '1.6', marginBottom: '20px' }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Playfair+Display:ital,wght@0,700;0,900;1,700&display=swap');
        .grid-container { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
        @media (max-width: 600px) { .grid-container { grid-template-columns: 1fr; } }
      `}</style>

      <div style={s.page}>
        <div style={s.container}>
          <header style={s.header}>
            <p style={s.eyebrow}>Historical Stock Return Simulator</p>
            <h1 style={s.h1}>What if you had<br /><span style={s.yellow}>stayed invested?</span></h1>
            <p style={s.subtitle}>Use our DCA Investment Calculator to visualize your wealth growth. See exactly what consistent investing would have built.</p>
          </header>

          <div style={s.card}>
            <div className="grid-container">
              <div style={s.fullCol}>
                <label style={s.label}>Stock / ETF Ticker</label>
                <input style={s.input} type="text" value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} placeholder="e.g. SPY, QQQ, AAPL" />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                  {QUICK_TICKERS.map(t => <button key={t} style={{ fontFamily: 'monospace', fontSize: 11, padding: '4px 10px', border: '1px solid #1f2a33', borderRadius: 20, color: '#6b7a87', cursor: 'pointer', background: 'transparent' }} onClick={() => setTicker(t)}>{t}</button>)}
                </div>
              </div>
              <div><label style={s.label}>Start Year</label><select style={s.input} value={startYear} onChange={e => setStartYear(e.target.value)}>{HISTORICAL_YEARS.map(y => <option key={y} value={y}>{y}</option>)}</select></div>
              <div><label style={s.label}>End Year (Forecast)</label><select style={s.input} value={endYear} onChange={e => setEndYear(e.target.value)}>{ALL_YEARS.map(y => <option key={y} value={y}>{y}</option>)}</select></div>
              <div><label style={s.label}>Monthly Deposit</label><input style={s.input} type="number" value={monthly} onChange={e => setMonthly(e.target.value)} placeholder="500" /></div>
              <div><label style={s.label}>Initial Investment</label><input style={s.input} type="number" value={initial} onChange={e => setInitial(e.target.value)} placeholder="0" /></div>
            </div>
            <button style={s.btn} onClick={calculate} disabled={loading}>{loading ? 'Calculating...' : 'Visualize My Wealth Growth'}</button>
          </div>

          {summary && (
            <div ref={resultsRef} style={s.card}>
                {/* Result sections remain the same... */}
                <h2 style={s.h2}>Your Portfolio Forecast</h2>
                <div style={{ height: 260, marginBottom: 32 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}><XAxis dataKey="year"/><YAxis/><Tooltip content={<CustomTooltip/>}/><Line type="monotone" dataKey="Portfolio Value" stroke="#2ecc71"/><Line type="monotone" dataKey="Total Invested" stroke="#EE8511"/></LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
          )}

          {/* SEO FOOTER SECTION */}
          <footer style={s.footer}>
            <h2 style={s.h2}>How our Compound Interest Calculator with Inflation Works</h2>
            <p style={s.p}>
              Our tool serves as a <strong>Historical stock return simulator</strong>, allowing you to backtest any asset. 
              By entering a ticker, you can answer the question: <em>"What if I invested in NVDA or Apple ten years ago?"</em>
              The logic incorporates real market data and accounts for consistent contributions, simulating the power of Dollar-Cost Averaging.
            </p>
            <p style={s.p}>
              <strong>Popular Tickers to Track:</strong> SPY (S&P 500 ETF), QQQ (Nasdaq 100), VTI (Total Stock Market), 
              Tesla (TSLA), Nvidia (NVDA), and Bitcoin (BTC). Whether you are looking for a <strong>What if I invested in [Ticker] calculator</strong> or a long-term wealth forecaster, 
              staying invested is the key to compounding success.
            </p>
          </footer>
        </div>
      </div>
    </>
  );
}