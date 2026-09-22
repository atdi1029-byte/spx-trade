// SPX Trade Dashboard - main app (split out of index.html). Loads before liquidity.js.
const DASH_VERSION = 'v2026-09-14c';
console.log('SPX dashboard ' + DASH_VERSION);
document.addEventListener('DOMContentLoaded', () => { const v = document.getElementById('dashVersion'); if (v) v.textContent = '· ' + DASH_VERSION; });
// ====== CONFIG ======
const API_URL = 'https://script.google.com/macros/s/AKfycbyeL8nGHmsRRG2uk7I3cuh2aWQ14RRKvJYwOblvOWw36_QIKyr9KaA4jXK1K5pyySNiBg/exec?action=dashboard';
const REFRESH_INTERVAL = 60000; // 60 seconds
const DASH_FETCH_TIMEOUT_MS = 45000; // give up on a dashboard read after this so the refresh loop can never wedge

// Optional shared secret. Leave '' until you set API_KEY in the Apps Script's Script Properties
// (see apps_script_additions.gs); once both sides have it, writes without the key are rejected.
const API_KEY = '';

// The one word the Close button writes to the Outcome column. Win/loss is carried by the sign of the P&L
// in the profit column. The Apps Script must treat this word as "closed" and count it in the stats; if it
// still keys on the old pair, set this back to 'TP Hit' / 'Stopped Out' by sign (see closeTrade).
const CLOSE_OUTCOME = 'Closed';

// Uniform SL/TP levels (same as crypto — guardrails, not overfitted per-ticker)
const BT_DEFAULTS = { buy: { sl:14.5, tp:15, halfTp:7 }, sell: { sl:20, tp:13, halfTp:7 } };

// Per-ticker winners from the backtests in notes.txt (4h, 50-bar lookforward). A ticker listed here
// shows its tested levels; anything else falls back to BT_DEFAULTS. sell:null = no profitable sell config.
const BT_OVERRIDES = {
    'TSM':    { buy: { sl:14, tp:8,  halfTp:4   }, sell: { sl:13, tp:4, halfTp:2   } },
    'K2I1!':  { buy: { sl:13, tp:3,  halfTp:1.5 }, sell: { sl:8,  tp:2, halfTp:1   } },
    'QQQ':    { buy: { sl:14, tp:4,  halfTp:2   }, sell: { sl:9,  tp:2, halfTp:1   } },
    '005930': { buy: { sl:14, tp:5,  halfTp:2.5 }, sell: { sl:14, tp:3, halfTp:1.5 } },
    '000660': { buy: { sl:14, tp:8,  halfTp:4   }, sell: { sl:14, tp:3, halfTp:1.5 } },
    '011760': { buy: { sl:14, tp:9,  halfTp:4.5 }, sell: { sl:14, tp:8, halfTp:4   } },
    '11760':  { buy: { sl:14, tp:9,  halfTp:4.5 }, sell: { sl:14, tp:8, halfTp:4   } },
    'HAFC':   { buy: { sl:14, tp:5,  halfTp:2.5 }, sell: { sl:14, tp:5, halfTp:2.5 } },
    'AVGO':   { buy: { sl:14, tp:10, halfTp:5   }, sell: null },
    'WMT':    { buy: { sl:14, tp:4,  halfTp:2   }, sell: { sl:12, tp:4, halfTp:2   } }
};
// Levels for a ticker/side: { sl, tp, halfTp, tested, noEdge }
function btFor(ticker, side) {
    const o = BT_OVERRIDES[String(ticker || '').toUpperCase()];
    if (o && o[side]) return Object.assign({ tested: true, noEdge: false }, o[side]);
    if (o && o[side] === null) return Object.assign({ tested: false, noEdge: true }, BT_DEFAULTS[side]);
    return Object.assign({ tested: false, noEdge: false }, BT_DEFAULTS[side]);
}
function btTag(bt) {
    return bt.tested ? '<span style="opacity:0.55;font-size:0.5rem;color:var(--green-bright)">tested</span>'
         : bt.noEdge ? '<span style="opacity:0.8;font-size:0.5rem;color:var(--red-bright)">no tested edge</span>'
         : '<span style="opacity:0.45;font-size:0.5rem">default</span>';
}
function recalcLevels(actionId) {
    const input = document.getElementById(actionId + '-entry');
    if (!input) return;
    const card = input.closest('.action-item');
    const levelsEl = card.querySelector('.bt-levels');
    if (!levelsEl) return;
    const p = parseFloat(input.value.replace(/,/g, ''));
    if (!p || p <= 0) return;
    const sl = parseFloat(levelsEl.dataset.sl);
    const tp = parseFloat(levelsEl.dataset.tp);
    const half = parseFloat(levelsEl.dataset.half);
    const isBuy = levelsEl.dataset.side === 'buy';
    const slP = isBuy ? p * (1 - sl / 100) : p * (1 + sl / 100);
    const tpP = isBuy ? p * (1 + tp / 100) : p * (1 - tp / 100);
    const halfP = isBuy ? p * (1 + half / 100) : p * (1 - half / 100);
    const fmt = v => v >= 100 ? v.toFixed(2) : v >= 1 ? v.toFixed(4) : v.toPrecision(4);
    levelsEl.querySelector('.bt-sl').textContent = fmt(slP);
    levelsEl.querySelector('.bt-half').textContent = fmt(halfP);
    levelsEl.querySelector('.bt-tp').textContent = fmt(tpP);
}

function calcQuickLevels() {
    const ticker = document.getElementById('quickTicker').value.trim().toUpperCase();
    const side = document.getElementById('quickSide').value;
    const p = parseFloat(document.getElementById('quickPrice').value.replace(/,/g, ''));
    const out = document.getElementById('quickLevelsResult');
    if (!ticker || !p || p <= 0) { out.style.display = 'none'; return; }
    const bt = btFor(ticker, side);
    const isBuy = side === 'buy';
    const fmt = v => v >= 100 ? v.toFixed(2) : v >= 1 ? v.toFixed(4) : v.toPrecision(4);
    const slP = isBuy ? p * (1 - bt.sl / 100) : p * (1 + bt.sl / 100);
    const halfP = isBuy ? p * (1 + bt.halfTp / 100) : p * (1 - bt.halfTp / 100);
    const tpP = isBuy ? p * (1 + bt.tp / 100) : p * (1 - bt.tp / 100);
    out.style.display = 'block';
    out.innerHTML = `<strong style="color:var(--pumpkin)">${ticker}</strong> <span style="opacity:0.6">${side.toUpperCase()} @ $${p}</span><br>
        <span style="color:var(--red-bright)">SL: $<span class="tap-copy" onclick="copyVal(this)">${fmt(slP)}</span></span> &nbsp;
        <span style="color:var(--green-bright)">TP1: $<span class="tap-copy" onclick="copyVal(this)">${fmt(halfP)}</span></span> &nbsp;
        <span style="color:var(--green-bright)">TP2: $<span class="tap-copy" onclick="copyVal(this)">${fmt(tpP)}</span></span>
        <span style="opacity:0.5;font-size:0.65rem"> (${bt.sl}% / ${bt.halfTp}% / ${bt.tp}%)</span> ${btTag(bt)}`;
}

// DCA state
let dcaMode = localStorage.getItem('spx_dca_mode') === 'true';
let dcaTotal = parseFloat(localStorage.getItem('spx_dca_total')) || 0;
let stockCount = parseInt(localStorage.getItem('spx_stock_count')) || 25;

let refreshTimer = null;
let lastGoodData = null;      // last successful dashboard payload (never fall back to sample data once we have real data)
const DASH_CACHE_KEY = 'spx_dashboard_cache';
let fetchInFlight = false;
let fetchQueued = false;
let fetchForceQueued = false;
let allTickers = [];

// "$1,234.56" / "-$12.30" / 12.3 -> number (strips every comma, not just the first)
function parseDollar(v) {
    if (v == null) return 0;
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    const num = parseFloat(String(v).replace(/[$,\s]/g, ''));
    return isFinite(num) ? num : 0;
}
function fmtSigned(n) { return (n >= 0 ? '+$' : '-$') + Math.abs(n).toFixed(2); }

function showBanner(msg) {
    const b = document.getElementById('errorBanner');
    if (!b) return;
    b.textContent = msg;
    b.className = 'error-banner show';
}
function hideBanner() {
    const b = document.getElementById('errorBanner');
    if (b) b.className = 'error-banner';
}

// Coalesced refresh: replaces the pending timer instead of stacking N fetches
function scheduleRefresh(ms) {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(fetchData, Math.max(0, ms || 0));
}
let showAllTickers = false;
let openTradeFilter = 'all'; // all, no-0x0, no-tp
const TICKER_LIMIT = 8;
const LOGO_URL = 'https://financialmodelingprep.com/image-stock/';
const TV_LOGO = 'https://s3-symbol-logo.tradingview.com/';
const TV_LOGO_MAP = {
    'AAPL': 'apple', 'GOOGL': 'alphabet', 'AMD': 'advanced-micro-devices',
    'AMZN': 'amazon', 'BABA': 'alibaba', 'CL1!': 'crude-oil',
    'COIN': 'coinbase', 'COPPER': 'metal/copper', 'CRCL': 'circle',
    'CRWV': 'coreweave', 'HOOD': 'robinhood', 'INTC': 'intel',
    'META': 'meta-platforms', 'MSFT': 'microsoft', 'MSTR': 'microstrategy',
    'MU': 'micron-technology', 'NFLX': 'netflix', 'NG1!': 'natural-gas',
    'NVDA': 'nvidia', 'ORCL': 'oracle', 'PLATINUM': 'metal/platinum',
    'PLTR': 'palantir', 'RIVN': 'rivian', 'SILVER': 'silver',
    'SNDK': 'sandisk', 'TSLA': 'tesla', 'USAR': 'usa-rare-earth',
    'PALLADIUM': 'metal/palladium', 'USOIL': 'crude-oil'
};
// Korean stocks use numeric tickers — map to readable names
const KR_NAME_MAP = {
    '005930': 'Samsung', '000660': 'SK Hynix',
    '005380': 'Hyundai Motor', '005490': 'POSCO',
    '035420': 'Naver', '035720': 'Kakao',
    '006400': 'Samsung SDI', '051910': 'LG Chem',
    '003550': 'LG', '066570': 'LG Electronics',
    '055550': 'Shinhan Fin', '105560': 'KB Financial',
    '012330': 'Hyundai Mobis', '028260': 'Samsung C&T',
    '009150': 'Samsung Electro', '034730': 'SK Inc',
    '000270': 'Kia', '018260': 'Samsung SDS',
    '086790': 'Hana Financial', '316140': 'Woori Financial',
    '003670': 'POSCO Future M', '247540': 'Ecopro BM',
    '373220': 'LG Energy Sol', '352820': 'Hive',
    '259960': 'Krafton', '036570': 'NCsoft',
    '251270': 'Netmarble', '263750': 'Pearl Abyss',
    '011200': 'HMM', '010950': 'S-Oil',
    '096770': 'SK Innovation', '034020': 'Doosan Enerbility',
    '032830': 'Samsung Life', '010130': 'Korea Zinc',
    '030200': 'KT', '017670': 'SK Telecom',
    '015760': 'Korea Electric', '047050': 'Posco Intl',
    '326030': 'SK Biopharm', '068270': 'Celltrion',
    '207940': 'Samsung Bio', '302440': 'SK Bioscience',
    '011760': 'Hyundai Corp', '11760': 'Hyundai Corp'
};
function displayName(ticker) {
    return KR_NAME_MAP[ticker] || ticker;
}
function logoUrl(ticker) {
    const tv = TV_LOGO_MAP[ticker.toUpperCase()];
    if (tv) return TV_LOGO + tv + '.svg';
    return LOGO_URL + ticker + '.png';
}

// Signal label mapping
function signalLabel(sig) {
    const s = (sig || '').toLowerCase();
    if (s === 'add') return 'BUY DCA';
    if (s === 'reduce') return 'SELL DCA';
    return s.toUpperCase();
}
function signalClass(sig) {
    const s = (sig || '').toLowerCase();
    if (s === 'add') return 'add';
    if (s === 'reduce') return 'reduce';
    return s;
}

// ====== PUSH NOTIFICATIONS ======
const NOTIF_KEY = 'spx_known_signals';
function getKnownSignals() {
    try { return JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]'); } catch { return []; }
}
function setKnownSignals(keys) {
    localStorage.setItem(NOTIF_KEY, JSON.stringify(keys));
}
function checkNewSignals(data) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const actions = (data.actionNeeded || []).filter(a => a.type === 'mark_action');
    const keys = actions.map(a => (a.ticker || '') + '|' + (a.signal || '') + '|' + (a.price || ''));
    const known = getKnownSignals();
    const newOnes = keys.filter(k => !known.includes(k));
    if (newOnes.length > 0 && known.length > 0) {
        newOnes.forEach(k => {
            const [ticker, sig] = k.split('|');
            if (navigator.serviceWorker && navigator.serviceWorker.ready) {
                navigator.serviceWorker.ready.then(reg => {
                    reg.showNotification('Trade Alert: ' + ticker, {
                        body: (sig || '').toUpperCase() + ' signal',
                        icon: 'icon-192.png',
                        tag: k
                    });
                });
            } else {
                new Notification('Trade Alert: ' + ticker, {
                    body: (sig || '').toUpperCase() + ' signal',
                    icon: 'icon-192.png',
                    tag: k
                });
            }
        });
    }
    setKnownSignals(keys);
}
if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
}

// ====== LOCAL SKIP TRACKING ======
const ACTED_KEY = 'spx_acted_items_v2';
function getActedItems() {
    try { return JSON.parse(localStorage.getItem(ACTED_KEY) || '[]'); } catch { return []; }
}
function addActedItem(ticker, signal, price) {
    const items = getActedItems().filter(i => Date.now() - i.ts < 86400000);
    items.push({ t: ticker.toUpperCase(), s: signal.toLowerCase(), p: String(price), ts: Date.now() });
    localStorage.setItem(ACTED_KEY, JSON.stringify(items));
    markStateDirty(ACTED_KEY);
}
function removeActedItem(ticker, signal, price) {
    const items = getActedItems().filter(i => !(i.t === ticker.toUpperCase() && i.s === signal.toLowerCase() && i.p === String(price)));
    localStorage.setItem(ACTED_KEY, JSON.stringify(items));
    markStateDirty(ACTED_KEY);
}
function isActed(ticker, signal, price) {
    return getActedItems().some(i => i.t === ticker.toUpperCase() && i.s === signal.toLowerCase() && i.p === String(price));
}

// ====== FETCH DATA ======
async function fetchData(force) {
    force = force === true; // setTimeout / scheduleRefresh pass nothing
    if (fetchInFlight) { fetchQueued = true; if (force) fetchForceQueued = true; return; }
    fetchInFlight = true;
    if (fetchForceQueued) { force = true; fetchForceQueued = false; }
    const t0 = Date.now();
    if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
    const dot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    dot.className = 'status-dot loading';
    // While the last real numbers are on screen say so; "Fetching..." only when there is nothing to show yet
    statusText.textContent = lastGoodData ? 'Updating\u2026' : 'Fetching...';

    let renderError = null;
    const ctrl = ('AbortController' in window) ? new AbortController() : null;
    const abortTimer = setTimeout(() => ctrl && ctrl.abort(), DASH_FETCH_TIMEOUT_MS);
    try {
        const resp = await fetch(API_URL + (force ? '&nocache=1' : ''), { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        if (data.status !== 'ok') throw new Error(data.message || 'Bad response');

        lastGoodData = data;
        try { localStorage.setItem(DASH_CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch (e) { /* quota - ignore */ }
        try { renderDashboard(data); } catch (e) { renderError = e; console.error('Render error:', e); }
        try { checkNewSignals(data); } catch (e) { console.warn('Notification check failed:', e); }

        dot.className = 'status-dot';
        statusText.textContent = 'Live';
        const secs = ((Date.now() - t0) / 1000).toFixed(1);
        const lu = document.getElementById('lastUpdate');
        lu.textContent = 'Updated ' + new Date().toLocaleTimeString() + ' \u00b7 ' + secs + 's';
        const c = data._cache;
        lu.title = c ? (c.hit ? 'Served from the script cache (built ' + new Date(c.builtAt).toLocaleTimeString() + '). Refresh forces a rebuild.'
                             : 'Rebuilt by the script in ' + ((c.buildMs || 0) / 1000).toFixed(1) + 's')
                     : 'Sheet round-trip ' + secs + 's (no script cache - dashboard_additions.gs not deployed)';
        if (data._stats_engine) lu.title += '\nStats engine: ' + data._stats_engine;
        if (data._stats_engine && /^error/.test(data._stats_engine)) showToast('Stats engine: ' + data._stats_engine, 'error', 8000);
        if (renderError) showBanner('Data loaded but part of the page failed to draw: ' + renderError.message);
        else hideBanner();
    } catch (err) {
        if (err && err.name === 'AbortError') err = new Error('Sheet did not answer within ' + (DASH_FETCH_TIMEOUT_MS / 1000) + 's');
        console.error('Dashboard error:', err);
        if (!lastGoodData) {
            // Nothing real to show yet - render the empty placeholder so the page isn't blank
            try { renderDashboard(SAMPLE_DATA); } catch (e) { console.error('Render error:', e); }
            statusText.textContent = 'Preview';
            document.getElementById('lastUpdate').textContent = 'Sample data';
        } else {
            // Keep the last real numbers on screen instead of wiping them with zeros
            statusText.textContent = 'Offline';
            document.getElementById('lastUpdate').textContent = 'Refresh failed ' + new Date().toLocaleTimeString();
        }
        dot.className = 'status-dot';
        showBanner('Could not load the sheet: ' + err.message);
    } finally {
        clearTimeout(abortTimer);
        document.getElementById('loading').className = 'loading-overlay hidden';
        fetchInFlight = false;
        if (fetchQueued) { fetchQueued = false; scheduleRefresh(500); }
        else scheduleRefresh(REFRESH_INTERVAL);
    }
}

// ====== RENDER ======
function renderDashboard(data) {
    let { tickers, recentSignals, actionNeeded, stats } = data;

    // Sync DCA pokemon state from server (cross-device)
    if (stats.dcaMode !== undefined) {
        dcaMode = stats.dcaMode;
        dcaTotal = stats.dcaTotal || 0;
        localStorage.setItem('spx_dca_mode', dcaMode ? 'true' : 'false');
        localStorage.setItem('spx_dca_total', String(dcaTotal));
    }

    // Filter out locally acted items
    actionNeeded = actionNeeded.filter(a => !isActed(a.ticker || '', a.signal || '', a.price || ''));

    // --- Quick Stats ---
    const trEl = document.getElementById('statTrades');
    const trN = parseInt(stats.totalTrades) || 0;
    trEl.textContent = trN;
    const beN = parseInt(stats.breakeven) || 0;
    trEl.title = (parseInt(stats.wins) || 0) + ' wins / ' + (parseInt(stats.losses) || 0) + ' losses' + (beN ? ' / ' + beN + ' breakeven' : '') + (stats.statsStartDate ? ' since ' + stats.statsStartDate : '');
    document.getElementById('statOpen').textContent = stats.openPositions || 0;
    const wrEl = document.getElementById('statWinRate');
    wrEl.textContent = stats.winRate || '0%';
    wrEl.className = 'stat-value' + (parseFloat(stats.winRate) >= 50 ? ' green' : parseFloat(stats.winRate) > 0 ? ' red' : '');

    const pnlEl = document.getElementById('statPnl');
    pnlEl.textContent = (stats.netPnl == null || stats.netPnl === '') ? '$0.00' : String(stats.netPnl);
    const pnlNum = parseDollar(stats.netPnl);
    pnlEl.className = 'stat-value' + (pnlNum >= 0 ? ' green' : ' red');

    document.getElementById('statToday').textContent = stats.todaySignals || 0;

    const streakEl = document.getElementById('statStreak');
    const streakStr = String(stats.currentStreak == null || stats.currentStreak === '' ? '0' : stats.currentStreak);
    const streakDisplay = streakStr.includes('W') ? streakStr.replace('W', ' Win') : streakStr.includes('L') ? streakStr.replace('L', ' Loss') : streakStr;
    streakEl.textContent = streakDisplay;
    streakEl.className = 'stat-value' + (streakStr.includes('W') ? ' green' : streakStr.includes('L') ? ' red' : '');

    // Drop blank rows (an empty ticker cell in the sheet would otherwise throw and blank the page)
    tickers = (tickers || []).filter(t => t && t.ticker != null && String(t.ticker).trim() !== '');
    recentSignals = (recentSignals || []).filter(x => x && x.ticker != null);
    actionNeeded = (actionNeeded || []).filter(a => a && a.ticker != null);

    // --- Build set of tickers with open positions ---
    const openTickerSides = new Set();
    tickers.forEach(t => {
        const tk = String(t.ticker).toUpperCase();
        const bs = t.buyStatus || '';
        const ss = t.sellStatus || '';
        if (bs === 'OPEN') openTickerSides.add(tk + '_buy');
        if (ss === 'OPEN') openTickerSides.add(tk + '_sell');
    });

    // --- Action Needed (only new signals, not outcomes) ---
    const actionList = document.getElementById('actionList');
    const actionCount = document.getElementById('actionCount');
    let newSignals = actionNeeded.filter(a => a.type === 'mark_action');
    actionCount.textContent = newSignals.length;
    document.getElementById('skipAllBtn').style.display = newSignals.length >= 1 ? '' : 'none';
    if (newSignals.length === 0) {
        actionList.innerHTML = '<div class="no-actions">All caught up - no actions needed</div>';
    } else {
        actionList.innerHTML = newSignals.map((a, i) => {
            const id = 'action-' + i;
            const logo = logoUrl(a.ticker);
            const logoHtml = `<img src="${logo}" class="stock-logo" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex'"><span class="stock-logo-fallback" style="display:none">${esc(a.ticker.slice(0,2))}</span>`;
            // Find effective size from tickers data
            const isBuy = ['buy','add'].includes((a.signal || '').toLowerCase());
            const matchTicker = tickers.find(t => t.ticker.toUpperCase() === a.ticker.toUpperCase());
            const effSize = matchTicker ? (isBuy ? matchTicker.buyEffectiveSize : matchTicker.sellEffectiveSize) : 0;
            const effSizeStr = effSize === 'SIT OUT' ? 'SIT OUT' : Number(effSize || 0).toFixed(2);
            const stops = matchTicker ? (isBuy ? Number(matchTicker.buyStopouts || 0) : Number(matchTicker.sellStopouts || 0)) : 0;
            const warnHtml = stops >= 3 ? `<div style="background:#c44b3f22;border:1px solid #c44b3f55;border-radius:4px;padding:4px 8px;margin:4px 0;font-size:0.65rem;color:var(--red-bright)">&#9888; ${stops} consecutive stop-outs on this ticker — be careful</div>` : '';
            // Earnings warning
            const earnDate = matchTicker ? matchTicker.earningsDate : null;
            const earnDays = matchTicker ? matchTicker.earningsDaysAway : null;
            let earnHtml = '';
            if (earnDate != null && earnDays != null && earnDays <= 7) {
                const earnLabel = new Date(earnDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                if (earnDays === 0) {
                    earnHtml = `<div style="background:#c44b3f22;border:1px solid #c44b3f55;border-radius:4px;padding:4px 8px;margin:4px 0;font-size:0.65rem;color:var(--red-bright);font-weight:700">&#9888; EARNINGS TODAY — HIGH RISK</div>`;
                } else if (earnDays <= 3) {
                    earnHtml = `<div style="background:#d4843e33;border:1px solid #d4843e88;border-radius:4px;padding:4px 8px;margin:4px 0;font-size:0.65rem;color:var(--pumpkin-glow);font-weight:700">&#9888; CAUTION: EARNINGS ${earnLabel} (${earnDays}d)</div>`;
                } else {
                    earnHtml = `<div style="background:#d4843e22;border:1px solid #d4843e55;border-radius:4px;padding:4px 8px;margin:4px 0;font-size:0.65rem;color:var(--pumpkin)">&#9888; EARNINGS ${earnLabel} (${earnDays}d)</div>`;
                }
            }
            let p = Number(String(a.price).replace(/,/g, ''));
            // Fallback: if signal has no price, use ticker's current price
            if (!p && matchTicker) {
                p = Number(matchTicker.currentPrice || matchTicker.price || 0);
            }
            const btSide = isBuy ? 'buy' : 'sell';
            const bt = btFor(a.ticker, btSide);
            const btDataAttr = `data-sl="${bt.sl}" data-tp="${bt.tp}" data-half="${bt.halfTp}" data-side="${btSide}"`;
            const noEdgeHtml = bt.noEdge ? `<div style="background:#c44b3f22;border:1px solid #c44b3f55;border-radius:4px;padding:4px 8px;margin:4px 0;font-size:0.65rem;color:var(--red-bright)">&#9888; Backtest found no profitable ${btSide.toUpperCase()} config for ${esc(a.ticker)} — consider skipping</div>` : '';
            // Stale-signal guard: age of the signal and how far price has moved since it fired
            const staleInfo = signalStaleness(a, matchTicker, p);
            let btLevelsHtml = '';
            if (p > 0) {
                const slP = isBuy ? p * (1 - bt.sl / 100) : p * (1 + bt.sl / 100);
                const tpP = isBuy ? p * (1 + bt.tp / 100) : p * (1 - bt.tp / 100);
                const halfP = isBuy ? p * (1 + bt.halfTp / 100) : p * (1 - bt.halfTp / 100);
                const fmt = v => v >= 100 ? v.toFixed(2) : v >= 1 ? v.toFixed(4) : v.toPrecision(4);
                btLevelsHtml = `<div class="meta" style="margin-top:0.2rem"><span class="bt-levels" ${btDataAttr}><span style="color:var(--red-bright)">SL <span class="bt-sl tap-copy" onclick="copyVal(this)">${fmt(slP)}</span> <span style="opacity:0.6;font-size:0.55rem">(${bt.sl}%)</span></span> &middot; <span style="color:var(--green-bright)">TP1 <span class="bt-half tap-copy" onclick="copyVal(this)">${fmt(halfP)}</span> <span style="opacity:0.6;font-size:0.55rem">(${bt.halfTp}%)</span></span> &middot; <span style="color:var(--green-bright)">TP2 <span class="bt-tp tap-copy" onclick="copyVal(this)">${fmt(tpP)}</span> <span style="opacity:0.6;font-size:0.55rem">(${bt.tp}%)</span></span> ${btTag(bt)}</span></div>`;
            }
            const aoSide = isBuy ? 'buy' : 'sell';
            const isAlreadyOpen = openTickerSides.has(a.ticker.toUpperCase() + '_' + aoSide);
            // QQQ proxy for NASDAQ signals
            let proxyHtml = '';
            if (a.ticker.toUpperCase() === 'NASDAQ' && p > 0) {
                const qqqTicker = tickers.find(t => t.ticker.toUpperCase() === 'QQQ');
                const qqqP = qqqTicker ? Number(qqqTicker.currentPrice || qqqTicker.price || 0) : 0;
                if (qqqP > 0) {
                    const qbt = btFor('QQQ', btSide);
                    const qSl = isBuy ? qqqP * (1 - qbt.sl / 100) : qqqP * (1 + qbt.sl / 100);
                    const qTp = isBuy ? qqqP * (1 + qbt.tp / 100) : qqqP * (1 - qbt.tp / 100);
                    const qHalf = isBuy ? qqqP * (1 + qbt.halfTp / 100) : qqqP * (1 - qbt.halfTp / 100);
                    const qFmt = v => v.toFixed(2);
                    proxyHtml = `<div style="background:#2d304033;border:1px solid #4a423855;border-radius:4px;padding:6px 8px;margin:4px 0">
                        <div style="font-size:0.7rem;font-weight:700;color:var(--cream);margin-bottom:2px">QQQ <span style="color:var(--text-dim);font-weight:400">@ $${qFmt(qqqP)}</span> ${btTag(qbt)}</div>
                        <div style="font-size:0.65rem"><span style="color:var(--red-bright)">SL <span class="tap-copy" onclick="copyVal(this)">${qFmt(qSl)}</span></span> &middot; <span style="color:var(--green-bright)">TP1 <span class="tap-copy" onclick="copyVal(this)">${qFmt(qHalf)}</span></span> &middot; <span style="color:var(--green-bright)">TP2 <span class="tap-copy" onclick="copyVal(this)">${qFmt(qTp)}</span></span></div>
                    </div>`;
                }
            }
            return `
                <div class="action-item" id="${id}"${staleInfo.stale ? ' style="opacity:0.75"' : ''}>
                    <div>
                        <div>${logoHtml}<span class="ticker-badge">${esc(a.ticker)}</span><span class="signal-badge ${signalClass(a.signal)}" style="margin-left:0.5rem">${signalLabel(a.signal)}</span>${isAlreadyOpen ? '<span class="ao-badge" style="margin-left:0.5rem">A.O.</span>' : ''}${staleInfo.stale ? '<span class="ao-badge" style="margin-left:0.5rem;background:#5a4a30;color:var(--pumpkin-glow)">STALE</span>' : ''}<span style="margin-left:0.5rem;font-size:0.65rem;color:var(--green-bright);font-weight:700">${effSizeStr !== 'SIT OUT' ? 'Enter at $' + effSizeStr : 'SIT OUT'}</span></div>
                        <div class="meta">@ $${p}${a.timestamp ? ' &middot; ' + esc(a.timestamp) : ''}${staleInfo.ageLabel ? ' &middot; ' + staleInfo.ageLabel + ' ago' : ''}</div>
                        ${staleInfo.driftHtml}
                        ${btLevelsHtml}
                        ${proxyHtml}
                        <div class="action-buttons">
                            <input type="text" class="entry-input" placeholder="Size $" id="${id}-size" value="${effSizeStr !== 'SIT OUT' ? effSizeStr : ''}">
                            <input type="text" class="entry-input" placeholder="Entry $" id="${id}-entry" value="${p}" style="width:80px" oninput="recalcLevels('${id}')">
                            <button class="action-btn entered" onclick="markAction('${esc(a.ticker)}','${esc(a.signal)}',${p},'Entered','${id}')">Entered</button>
                            <button class="action-btn skipped" onclick="markAction('${esc(a.ticker)}','${esc(a.signal)}',${p},'Skipped','${id}')">Skipped</button>
                        </div>
                    </div>
                    ${warnHtml}${earnHtml}${noEdgeHtml}
                </div>`;
        }).join('');
    }

    // --- Open Trades (per-side) — hide a side only while ITS OWN signal is still pending in Action Needed.
    // (Previously a pending SELL signal hid the open BUY card of the same ticker, and vice versa.)
    const pendingSides = new Set(newSignals.map(a => a.ticker.toUpperCase() + '_' + (['sell', 'reduce'].includes((a.signal || '').toLowerCase()) ? 'sell' : 'buy')));
    let openTrades = [];
    tickers.forEach(t => {
        const bs = t.buyStatus || '';
        const ss = t.sellStatus || '';
        const tk = String(t.ticker).toUpperCase();
        if (bs === 'OPEN' && !pendingSides.has(tk + '_buy')) {
            openTrades.push({ ticker: t.ticker, lastSignal: t.buyLastSignal || 'buy', price: parseDollar(t.buyPrice || t.price), phase: t.buyPhase || t.phase, nextSize: t.buyNextSize != null ? t.buyNextSize : t.nextSize, status: bs, side: 'buy', outcome: t.buyOutcome || '', profitLocked: parseDollar(t.buyProfitLocked) });
        }
        if (ss === 'OPEN' && !pendingSides.has(tk + '_sell')) {
            openTrades.push({ ticker: t.ticker, lastSignal: t.sellLastSignal || 'sell', price: parseDollar(t.sellPrice || t.price), phase: t.sellPhase || '', nextSize: t.sellNextSize || 0, status: ss, side: 'sell', outcome: t.sellOutcome || '', profitLocked: parseDollar(t.sellProfitLocked) });
        }
    });
    renderOpenTrades(openTrades);
    checkPendingWrites(openTrades, stats);

    // --- Ticker Grid (sort by most recent signal first) ---
    const signalOrder = {};
    recentSignals.forEach((s, i) => {
        const tk = String(s.ticker).toUpperCase();
        if (!(tk in signalOrder)) signalOrder[tk] = i;
    });
    tickers.sort((a, b) => {
        const ai = signalOrder[a.ticker] !== undefined ? signalOrder[a.ticker] : 9999;
        const bi = signalOrder[b.ticker] !== undefined ? signalOrder[b.ticker] : 9999;
        return ai - bi;
    });
    allTickers = tickers;
    document.getElementById('tickerCount').textContent = tickers.length;
    renderTickerGrid();

    // --- Recent Signals ---
    document.getElementById('signalCount').textContent = recentSignals.length;
    const tbody = document.getElementById('signalsBody');
    tbody.innerHTML = recentSignals.map(s => `
        <tr>
            <td>${esc(s.timestamp)}</td>
            <td style="font-weight:700;color:var(--cream)">${esc(displayName(s.ticker))}</td>
            <td><span class="signal-badge ${s.signal}">${esc(s.signal)}</span></td>
            <td>$${Number(s.price || 0).toFixed(2)}</td>
            <td>${esc(s.timeframe || '-')}</td>
            <td>${s.rsi != null ? Number(s.rsi).toFixed(1) : '-'}</td>
        </tr>
    `).join('');

    // --- Graveyard Of Wins ---
    try { renderVictories(data); } catch (e) { console.error('Graveyard render failed:', e); }

    // --- Performance Summary ---
    const perfGrid = document.getElementById('perfGrid');
    perfGrid.innerHTML = `
        <div class="perf-item">
            <div class="perf-val">${stats.totalTrades}</div>
            <div class="perf-label">Total Trades</div>
        </div>
        <div class="perf-item">
            <div class="perf-val" style="color:${parseFloat(stats.winRate) >= 50 ? 'var(--green-bright)' : 'var(--red-bright)'}">${stats.winRate}</div>
            <div class="perf-label">Win Rate</div>
        </div>
        <div class="perf-item">
            <div class="perf-val glow-green" style="color:var(--green-bright)">${stats.totalProfit}</div>
            <div class="perf-label">Total Profit</div>
        </div>
        <div class="perf-item">
            <div class="perf-val glow-red" style="color:var(--red-bright)">${stats.totalLost}</div>
            <div class="perf-label">Total Lost</div>
        </div>
        <div class="perf-item">
            <div class="perf-val glow-green" style="color:var(--green-bright)">${stats.bestWinStreak} Win</div>
            <div class="perf-label">Best Win Streak</div>
        </div>
        <div class="perf-item">
            <div class="perf-val glow-red" style="color:var(--red-bright)">${stats.worstLossStreak} Loss</div>
            <div class="perf-label">Worst Loss Streak</div>
        </div>
        <div class="perf-item">
            <div class="perf-val">${stats.bestTicker}</div>
            <div class="perf-label">Best Ticker</div>
        </div>
        <div class="perf-item">
            <div class="perf-val">${stats.worstTicker}</div>
            <div class="perf-label">Worst Ticker</div>
        </div>
    `;
    // Next review indicator
    const totalTr = parseInt(stats.totalTrades) || 0;
    const lastRev = parseInt(
        localStorage.getItem(REVIEW_KEY) || '0'
    );
    const nextRev = lastRev + REVIEW_INTERVAL;
    if (totalTr < nextRev) {
        perfGrid.innerHTML += `
            <div class="perf-item" style="grid-column:1/-1;
                text-align:center">
                <span style="color:#b39ddb;font-size:0.65rem">
                    Next review: ${nextRev} trades
                    (${nextRev - totalTr} to go)
                </span>
            </div>`;
    }

    // --- Strategy Review Milestone ---
    try { checkReviewDue(parseInt(stats.totalTrades) || 0); } catch (e) { console.error('Review check failed:', e); }

    // --- Pokemon Scaling ---
    try { renderPokemon(stats); } catch (e) { console.error('Pokemon render failed:', e); }

    // --- Kelly Edge Optimizer ---
    try { renderKelly(stats); } catch (e) { console.error('Kelly render failed:', e); }

    // --- DCA Controls ---
    try { updateDCAControls(); } catch (e) { console.error('DCA controls failed:', e); }
}

// ====== SIDE FLIP ======
function flipSide(cardId, side) {
    const card = document.getElementById(cardId);
    if (!card) return;

    const raw = side === 'sell' ? card.dataset.sellData : card.dataset.buyData;
    if (!raw) return;
    const data = JSON.parse(raw);
    card.dataset.side = side;

    // Toggle buttons
    const btns = card.querySelectorAll('.side-toggle button');
    btns[0].className = side === 'buy' ? 'active-buy' : '';
    btns[1].className = side === 'sell' ? 'active-sell' : '';

    // Status badge
    const statusEl = card.querySelector('.ticker-status');
    if (statusEl) {
        const sc = (data.status || 'IDLE').replace(/\s+/g, '_');
        statusEl.className = 'ticker-status ' + sc;
        statusEl.textContent = data.status || 'IDLE';
    }

    // Signal badge
    const sigEl = card.querySelector('.side-signal');
    if (sigEl) sigEl.innerHTML = '<span class="signal-badge ' + signalClass(data.lastSignal) + '" style="font-size:0.55rem;padding:2px 6px">' + signalLabel(data.lastSignal) + '</span>';

    // Price
    const priceEl = card.querySelector('.side-price');
    if (priceEl) priceEl.textContent = data.price ? '$' + Number(data.price).toFixed(2) : '-';

    // Base size
    const baseEl = card.querySelector('.side-base');
    if (baseEl) baseEl.textContent = '$' + Number(data.base || 0).toFixed(2);

    // Effective size
    const nextEl = card.querySelector('.side-next');
    if (nextEl) nextEl.innerHTML = data.effectiveSize === 'SIT OUT' ? '<span class="red">SIT OUT</span>' : '$' + Number(data.effectiveSize || 0).toFixed(2);

    // Locked profit
    const lockedEl = card.querySelector('.side-locked');
    if (lockedEl) {
        lockedEl.textContent = Number(data.locked) > 0 ? '$' + Number(data.locked).toFixed(2) : '$0.00';
        lockedEl.className = 'side-locked' + (Number(data.locked) > 0 ? ' green' : '');
    }

    // Stop-outs
    const stopsEl = card.querySelector('.side-stops');
    if (stopsEl) {
        stopsEl.textContent = data.stopouts || 0;
        stopsEl.className = 'side-stops' + (Number(data.stopouts) > 0 ? ' red' : '');
    }

    // SL / TP levels
    const levelsEl = card.querySelector('.side-levels');
    if (levelsEl) {
        const p = Number(data.price);
        if (!p || !data.lastSignal) {
            levelsEl.innerHTML = '—';
            levelsEl.style.color = 'var(--muted-fg)';
        } else {
            const isBuy = data.lastSignal !== 'sell' && data.lastSignal !== 'reduce';
            const bt = btFor(data.ticker, isBuy ? 'buy' : 'sell');
            const fmtP = v => v >= 100 ? v.toFixed(2) : v >= 1 ? v.toFixed(4) : v.toPrecision(4);
            const slP = isBuy ? p * (1 - bt.sl / 100) : p * (1 + bt.sl / 100);
            const halfP = isBuy ? p * (1 + bt.halfTp / 100) : p * (1 - bt.halfTp / 100);
            const tpP = isBuy ? p * (1 + bt.tp / 100) : p * (1 - bt.tp / 100);
            levelsEl.style.color = '';
            levelsEl.innerHTML = `<span style="color:var(--red-bright)">${fmtP(slP)}</span> / <span style="color:var(--green-bright)">${fmtP(halfP)}</span> / <span style="color:var(--green-bright)">${fmtP(tpP)}</span> ${btTag(bt)}`;
        }
    }

    // Phase + action
    const phaseEl = card.querySelector('.ticker-phase');
    if (phaseEl) phaseEl.textContent = data.phase || 'No data';
    const actionEl = card.querySelector('.ticker-action');
    if (actionEl) actionEl.textContent = data.nextAction || '';
}

// ====== HELPERS ======
// How old is a signal, and how far has price moved since? SL/TP and sizing were computed at signal time.
const STALE_AFTER_MS = 12 * 60 * 60 * 1000, DRIFT_WARN_PCT = 3;
function signalStaleness(a, matchTicker, signalPrice) {
    const out = { stale: false, ageLabel: '', driftHtml: '' };
    if (a && a.timestamp) {
        const ts = new Date(a.timestamp);
        if (!isNaN(ts.getTime())) {
            const age = Date.now() - ts.getTime();
            if (age > 0) {
                const h = age / 3600000;
                out.ageLabel = h < 1 ? Math.round(h * 60) + 'm' : h < 48 ? Math.round(h) + 'h' : Math.round(h / 24) + 'd';
                out.stale = age > STALE_AFTER_MS;
            }
        }
    }
    const cur = matchTicker ? parseDollar(matchTicker.currentPrice) : 0;
    if (cur > 0 && signalPrice > 0) {
        const drift = (cur - signalPrice) / signalPrice * 100;
        if (Math.abs(drift) >= DRIFT_WARN_PCT) {
            out.driftHtml = `<div style="background:#d4843e22;border:1px solid #d4843e55;border-radius:4px;padding:4px 8px;margin:4px 0;font-size:0.65rem;color:var(--pumpkin-glow)">&#9888; Price now $${cur.toFixed(2)} (${drift >= 0 ? '+' : ''}${drift.toFixed(1)}% since signal) — levels and size below were computed at $${signalPrice}</div>`;
        }
    }
    return out;
}

function copyVal(el) {
    const v = el.textContent.trim();
    navigator.clipboard.writeText(v).then(() => {
        const orig = el.style.cssText;
        el.style.cssText += 'background:var(--green-dim);border-radius:4px;transition:background 0.2s';
        const lbl = el.parentElement;
        const tag = document.createElement('span');
        tag.textContent = ' Copied!';
        tag.style.cssText = 'color:var(--green-bright);font-size:0.6rem;opacity:1;transition:opacity 0.3s';
        lbl.appendChild(tag);
        setTimeout(() => { tag.style.opacity = '0'; }, 600);
        setTimeout(() => { el.style.cssText = orig; tag.remove(); }, 900);
    });
}

function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}

// ====== TOAST ======
function showToast(msg, type = 'error', duration = 3500) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = msg;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 350);
    }, duration);
}

// ====== STATS RESET ======
function setStatsStart(dateStr) {
    if (dateStr === 'clear') {
        if (!confirm('Reset stats to all-time? This will include all historical trades in Kelly/stats.')) return;
    }
    const url = POST_URL + '?action=set_stats_start&date=' + encodeURIComponent(dateStr);
    apiGet(url).then(r => {
        if (r.ok === false) { showToast('Stats start not saved: ' + writeErr(r), 'error', 7000); return; }
        showToast(dateStr === 'clear' ? 'Stats reset to all-time' : 'Stats start: ' + dateStr, 'success');
        scheduleRefresh(500);
    });
}

function promptStatsDate() {
    const d = prompt('Stats start date (YYYY-MM-DD):');
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
        setStatsStart(d);
    } else if (d) {
        showToast('Invalid date format — use YYYY-MM-DD');
    }
}

// ====== API WRITE FUNCTIONS ======
const POST_URL = 'https://script.google.com/macros/s/AKfycbyeL8nGHmsRRG2uk7I3cuh2aWQ14RRKvJYwOblvOWw36_QIKyr9KaA4jXK1K5pyySNiBg/exec';

function buildUpdateUrl(params) {
    const url = new URL(POST_URL);
    url.searchParams.set('action', 'update_position');
    for (const [k, v] of Object.entries(params)) {
        if (v !== '' && v != null) url.searchParams.set(k, v);
    }
    return url.toString();
}

// Last-resort fire-and-forget GET via <img>. The dashboard never sees the sheet's reply this way,
// so it is only used when a real fetch() can't be made.
function beaconGet(url) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = resolve;
        img.onerror = resolve; // Apps Script returns JSON not an image, so onerror = request completed
        setTimeout(() => resolve(), 5000); // 5s safety timeout
        img.src = url;
    });
}

// Verified write. GET via fetch() - the exact same path the dashboard read already uses, so CORS is
// fine - and hand back what the sheet actually said. Result shape:
//   { ok: true,  verified: true,  data }   sheet accepted it
//   { ok: false, verified: true,  data }   sheet answered with an error (data.message has the reason)
//   { ok: null,  verified: false, data }   couldn't confirm (non-JSON reply, or fetch failed and the beacon was used)
async function apiGet(url, opts = {}) {
    if (API_KEY && !/[?&]key=/.test(url)) url += (url.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(API_KEY);
    const timeoutMs = opts.timeoutMs || 20000;
    const ctrl = ('AbortController' in window) ? new AbortController() : null;
    const timer = setTimeout(() => ctrl && ctrl.abort(), timeoutMs);
    let resp, text;
    try {
        resp = await fetch(url, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined });
        text = await resp.text();
    } catch (err) {
        clearTimeout(timer);
        const aborted = err && err.name === 'AbortError';
        console.warn('apiGet: fetch failed' + (aborted ? ' (timeout)' : '') + ':', err);
        // A timed-out request was almost certainly delivered - don't double-send it.
        if (aborted || opts.beacon === false) {
            return { ok: null, verified: false, data: { message: aborted ? 'Timed out waiting for the sheet' : 'Network error: ' + err.message } };
        }
        await beaconGet(url);
        return { ok: null, verified: false, data: { message: 'Sent via fallback beacon (no confirmation)' } };
    }
    clearTimeout(timer);
    let data = null;
    try { data = JSON.parse(text); } catch (e) { data = null; }
    if (!resp.ok) {
        return { ok: false, verified: true, data: { message: 'HTTP ' + resp.status + (data && data.message ? ': ' + data.message : '') } };
    }
    if (!data || typeof data !== 'object') {
        // Not JSON (e.g. an HTML login/redirect page). Delivered, but we can't read the verdict.
        return { ok: null, verified: false, data: { message: 'Non-JSON reply: ' + String(text || '').replace(/<[^>]+>/g, ' ').trim().slice(0, 80) } };
    }
    const statusStr = data.status != null ? String(data.status).toLowerCase() : null;
    const failed = (statusStr && statusStr !== 'ok' && statusStr !== 'success') || data.success === false || !!data.error;
    if (failed) data.message = data.message || data.error || data.msg || ('Sheet returned status "' + (statusStr || 'error') + '"');
    return { ok: !failed, verified: true, data };
}
// Old name kept for anything that still calls it
const fireGet = apiGet;

function writeErr(r) { return (r && r.data && (r.data.message || r.data.error)) || 'unknown error'; }

// ====== SCRIPT VERSION PROBE ======
// Needs `action=version` in the Apps Script (apps_script_additions.gs). Old scripts answer with the
// health-check JSON instead, which is how you know a redeploy hasn't landed.
async function checkScriptVersion() {
    const el = document.getElementById('scriptVersion');
    if (!el) return;
    const r = await apiGet(POST_URL + '?action=version', { beacon: false, timeoutMs: 12000 });
    const v = r.data && r.data.script_version;
    el.textContent = v ? 'script \u2713' : 'script \u2717';
    el.title = v ? 'Apps Script ' + v + (r.data.auth ? ' (key required)' : '') : 'No ?action=version endpoint - the Apps Script additions are not deployed at this URL';
    el.style.color = v ? 'var(--green-bright)' : 'var(--pumpkin-glow)';
    if (v && r.data.auth && !API_KEY) showToast('The script requires an API key but API_KEY is empty in index.html - writes will be rejected', 'error', 10000);
}

// ====== CROSS-DEVICE STATE SYNC ======
// Device-local state (skipped signals, 4-day timers, ticker links, review milestone, unlocked level)
// is mirrored to the sheet so the Mac and the phone agree. Per-key last-writer-wins by timestamp.
// Needs get_state / set_state in the Apps Script; degrades silently to local-only without them.
const SYNC_KEYS = ['spx_acted_items_v2', 'spx_4day_checks', 'spx_ticker_links', 'spx_last_review_trades', 'spx_pokemon_level'];
const SYNC_META_KEY = 'spx_state_meta';
let pushTimer = null;
function getSyncMeta() { try { return JSON.parse(localStorage.getItem(SYNC_META_KEY) || '{}'); } catch (e) { return {}; } }
function markStateDirty(key) {
    const meta = getSyncMeta();
    meta[key] = Date.now();
    localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(pushState, 1500);
}
function collectState() {
    const meta = getSyncMeta();
    const out = {};
    SYNC_KEYS.forEach(k => {
        const v = localStorage.getItem(k);
        if (v != null) out[k] = { v, ts: meta[k] || 0 };
    });
    return out;
}
function applyRemoteState(remote) {
    if (!remote || typeof remote !== 'object') return false;
    const meta = getSyncMeta();
    let changed = false;
    SYNC_KEYS.forEach(k => {
        const r = remote[k];
        if (!r || typeof r.v !== 'string') return;
        if ((r.ts || 0) > (meta[k] || 0) && localStorage.getItem(k) !== r.v) {
            localStorage.setItem(k, r.v);
            meta[k] = r.ts || 0;
            changed = true;
        }
    });
    localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));
    return changed;
}
async function pushState() {
    pushTimer = null;
    const payload = JSON.stringify(collectState());
    const r = await apiGet(POST_URL + '?action=set_state&data=' + encodeURIComponent(payload), { beacon: false, timeoutMs: 15000 });
    if (r.ok && r.data && r.data.state && applyRemoteState(r.data.state) && lastGoodData) renderDashboard(lastGoodData);
}
async function pullState() {
    const r = await apiGet(POST_URL + '?action=get_state', { beacon: false, timeoutMs: 15000 });
    if (r.ok && r.data && r.data.state && applyRemoteState(r.data.state) && lastGoodData) renderDashboard(lastGoodData);
}

// ====== PENDING-WRITE WATCHDOG ======
// After a close / partial TP we remember what the sheet should show next. When a refresh comes back
// and the sheet disagrees, say so instead of leaving a silently-unchanged P&L.
const pendingCloses = {};    // key ticker_side -> { ts, pnl, netBefore, label }
const WATCHDOG_MIN_AGE = 12000, WATCHDOG_MAX_AGE = 10 * 60 * 1000;
function sideOf(signal) { return ['sell', 'reduce'].includes(String(signal || '').toLowerCase()) ? 'sell' : 'buy'; }
function checkPendingWrites(openTrades, stats) {
    const now = Date.now();
    const openKeys = new Set(openTrades.map(t => String(t.ticker).toUpperCase() + '_' + t.side));
    Object.keys(pendingCloses).forEach(k => {
        const pc = pendingCloses[k];
        const age = now - pc.ts;
        if (age > WATCHDOG_MAX_AGE) { delete pendingCloses[k]; return; }
        if (age < WATCHDOG_MIN_AGE) return; // give the sheet a moment
        if (openKeys.has(k)) {
            showToast(pc.label + ' still shows OPEN on the sheet after Close - the update_position write did not match its row', 'error', 9000);
        } else if (Math.abs(pc.pnl) >= 0.005 && Math.abs(parseDollar(stats.netPnl) - pc.netBefore) < 0.005) {
                            showToast(pc.label + ' closed on the sheet, but Net P&L did not move (' + fmtSigned(pc.pnl) + ' expected) - the script is not counting "' + pc.outcome + '" rows', 'error', 9000);
        }
        delete pendingCloses[k];
    });
}


function skipAllActions() {
    const items = document.querySelectorAll('#actionList .action-item');
    items.forEach(el => {
        const btn = el.querySelector('.action-btn.skipped');
        if (btn) btn.click();
    });
}

async function markAction(ticker, signal, price, value, elemId) {
    const sizeInput = document.getElementById(elemId + '-size');
    const entrySize = sizeInput ? sizeInput.value : '';
    const el = document.getElementById(elemId);

    // Reset 4-day timer on entry
    if (value === 'Entered') {
        const states = get4DayStates();
        states[ticker] = Date.now();
        set4DayStates(states);
    }

    // Instant hide via localStorage
    addActedItem(ticker, signal, price);
    el.style.transition = 'opacity 0.3s';
    el.style.opacity = '0';
    setTimeout(() => el.style.display = 'none', 300);

    // Send to the sheet and check the answer
    apiGet(buildUpdateUrl({ ticker, signal, price, field: 'action', value, entrySize })).then(r => {
        if (r.ok === false) {
            showToast(ticker + ' ' + value + ' was not saved: ' + writeErr(r), 'error', 7000);
            removeActedItem(ticker, signal, price);
            el.style.display = ''; el.style.opacity = '1';
            return;
        }
        scheduleRefresh(1500);
    });
}

// Open-trade cards keep their trade object here; buttons pass only the card id.
// (Inline arguments broke on any price containing a comma - "1,234.50" split the argument list
// and every button on that card threw before doing anything.)
const openTradeById = new Map();

// Close — the only exit. Type the P&L with its sign (-0.34 for a loss). The Outcome column gets
// CLOSE_OUTCOME; the sign of the profit column says whether it was a win or a loss.
async function closeTrade(elemId) {
    const t = openTradeById.get(elemId);
    const el = document.getElementById(elemId);
    if (!t || !el) { showToast('Card is stale - refreshing'); scheduleRefresh(0); return; }
    const profitInput = document.getElementById(elemId + '-profit');
    const raw = profitInput ? profitInput.value.trim() : '';
    const inputVal = parseDollar(raw);
    const locked = parseDollar(t.profitLocked); // anything already banked on the sheet for this trade
    const grandTotal = Math.round((locked + inputVal) * 100) / 100;
    if (raw === '' && locked === 0 && !confirm('No P&L entered. Close ' + displayName(t.ticker) + ' at $0.00?')) return;
    const verdict = grandTotal > 0 ? 'WIN' : grandTotal < 0 ? 'LOSS' : 'BREAKEVEN';
    if (!confirm('Close ' + displayName(t.ticker) + ' as ' + verdict + ' ' + fmtSigned(grandTotal) + (locked ? ' (includes ' + fmtSigned(locked) + ' already banked)' : '') + '?')) return;
    // Legacy pair, if the script ever needs it back: grandTotal > 0 ? 'TP Hit' : 'Stopped Out'
    const outcomeValue = CLOSE_OUTCOME;

    const ticker = t.ticker, signal = t.lastSignal || '', price = t.price || 0;
    const key = String(ticker).toUpperCase() + '_' + t.side;
    const buttons = el.querySelectorAll('.action-btn');
    buttons.forEach(b => b.disabled = true);
    const netBefore = parseDollar(lastGoodData && lastGoodData.stats ? lastGoodData.stats.netPnl : 0);

    const r = await apiGet(buildUpdateUrl({ ticker, signal, price, field: 'outcome', value: outcomeValue, profitLocked: grandTotal.toFixed(2) }));
    if (r.ok === false) {
        buttons.forEach(b => b.disabled = false);
        showToast(ticker + ' close was NOT saved: ' + writeErr(r), 'error', 9000);
        return;
    }
    el.style.borderLeftColor = grandTotal >= 0 ? 'var(--green-candle)' : 'var(--red-bright)';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 600);
    openTradeById.delete(el.id);
    pendingCloses[key] = { ts: Date.now(), pnl: grandTotal, netBefore, outcome: outcomeValue, label: displayName(ticker) + ' ' + t.side.toUpperCase() };
    showToast(displayName(ticker) + ' closed ' + fmtSigned(grandTotal) + (r.verified ? ' - saved to sheet' : ' - sent (unconfirmed)'), r.verified ? 'success' : 'error', 3500);
    scheduleRefresh(1500);
    setTimeout(() => scheduleRefresh(0), WATCHDOG_MIN_AGE + 3000);
}


// Reopen trade — resets outcome back to Open on the sheet
async function reopenTrade(ticker, signal) {
    const url = new URL(POST_URL);
    url.searchParams.set('action', 'update_position');
    url.searchParams.set('ticker', ticker);
    url.searchParams.set('signal', signal);
    url.searchParams.set('field', 'reopen');
    const r = await apiGet(url.toString());
    if (r.ok === false) { showToast(ticker + ' reopen failed: ' + writeErr(r), 'error', 7000); return; }
    showToast(ticker + ' reopened', 'success', 2000);
    scheduleRefresh(1500);
}

// ====== OPEN TRADE FILTERS ======
function setOpenFilter(filter, btn) {
    openTradeFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filterOpenTrades();
}
function filterOpenTrades() {
    const search = (document.getElementById('otSearch').value || '').toUpperCase().trim();
    document.querySelectorAll('#openTradesList .action-item').forEach(el => {
        const ticker = (el.dataset.ticker || '').toUpperCase();
        const matchSearch = !search || ticker.includes(search);
        el.style.display = matchSearch ? '' : 'none';
    });
}

// ====== EMPTY FALLBACK (shows when Apps Script not yet deployed) ======
const SAMPLE_DATA = {
    status: 'ok',
    tickers: [],
    recentSignals: [],
    actionNeeded: [],
    stats: {
        totalTrades: 0, wins: 0, losses: 0, winRate: '0%',
        netPnl: '$0', totalProfit: '$0', totalLost: '$0',
        openPositions: 0, todaySignals: 0, bestWinStreak: 0,
        worstLossStreak: 0, currentStreak: '-',
        bestTicker: '-', worstTicker: '-'
    }
};

// ====== OPEN TRADES RENDERING ======
function renderOpenTrades(trades) {
    const el = document.getElementById('openTradesList');
    document.getElementById('openCount').textContent = trades.length;
    if (trades.length === 0) {
        el.innerHTML = '<div class="no-actions">No open trades right now.</div>';
        return;
    }
    openTradeById.clear();
    el.innerHTML = trades.map((t, i) => {
        const id = 'open-' + i;
        openTradeById.set(id, t);
        const logo = logoUrl(t.ticker);
        const pnl = parseDollar(t.profitLocked);
        return `
            <div class="action-item" id="${id}" data-ticker="${esc(t.ticker)}" data-side="${t.side}" data-pnl="${pnl}">
                <div>
                    <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.5rem">
                        <img src="${logo}" class="stock-logo" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex'" style="margin-right:0">
                        <span class="stock-logo-fallback" style="display:none;margin-right:0">${esc(displayName(t.ticker).slice(0,2))}</span>
                        <span class="ticker-badge" style="margin-right:0">${esc(displayName(t.ticker))}</span>
                        <span class="signal-badge ${signalClass(t.lastSignal)}" style="font-size:0.4rem;padding:1px 4px;opacity:0.7">${signalLabel(t.lastSignal)}</span>
                        ${pnl ? `<span class="pnl-badge ${pnl > 0 ? 'positive' : 'negative'}" style="font-size:0.4rem;padding:1px 4px;opacity:0.7;margin-left:auto" title="Already banked on the sheet - added to whatever you close with">banked ${fmtSigned(pnl)}</span>` : ''}
                    </div>
                    <div class="action-buttons">
                        <input type="text" class="entry-input" placeholder="P&L $ (- for loss)" id="${id}-profit" inputmode="decimal">
                        <button class="action-btn won" id="${id}-close" onclick="closeTrade('${id}')">Close</button>
                        <button class="action-btn four-day-btn" id="${id}-4day" onclick="toggle4DayCheck('${id}')">4 Day</button>
                    </div>
                </div>
                <div class="meta">${esc(t.phase || '')} · ${t.side === 'sell' ? 'SHORT ' : ''}$${parseDollar(t.price).toFixed(2)} · Next: $${t.nextSize === 'SIT OUT' ? 'SIT OUT' : parseDollar(t.nextSize).toFixed(2)}</div>
            </div>`;
    }).join('');
}

// ====== TICKER LINKS (editable, saved to localStorage) ======
// ====== TICKER GRID RENDERING ======
function renderTickerCard(t, i) {
    const tid = 'ticker-' + i;
    const activeSide = (t.lastSignal === 'sell' || t.lastSignal === 'reduce') ? 'sell' : 'buy';

    // Build per-side data objects
    const buyData = {
        ticker: t.ticker,
        base: Number(t.buyBase || t.base || 30),
        phase: t.buyPhase || t.phase || 'No trades',
        nextSize: t.buyNextSize != null ? t.buyNextSize : (activeSide === 'buy' ? t.nextSize : 0),
        locked: Number(t.buyLocked || (activeSide === 'buy' ? t.locked : 0)),
        stopouts: Number(t.buyStopouts || (activeSide === 'buy' ? t.stopouts : 0)),
        status: t.buyStatus || 'IDLE',
        nextAction: t.buyNextAction || (activeSide === 'buy' ? t.nextAction : ''),
        lastSignal: t.buyLastSignal || (activeSide === 'buy' ? t.lastSignal : ''),
        price: t.buyPrice || (activeSide === 'buy' ? t.price : 0),
        effectiveSize: t.buyEffectiveSize || 0
    };
    const sellData = {
        ticker: t.ticker,
        base: Number(t.sellBase || 0),
        phase: t.sellPhase || 'No trades',
        nextSize: t.sellNextSize != null ? t.sellNextSize : (activeSide === 'sell' ? t.nextSize : 0),
        locked: Number(t.sellLocked || (activeSide === 'sell' ? t.locked : 0)),
        stopouts: Number(t.sellStopouts || (activeSide === 'sell' ? t.stopouts : 0)),
        status: t.sellStatus || 'IDLE',
        nextAction: t.sellNextAction || (activeSide === 'sell' ? t.nextAction : ''),
        lastSignal: t.sellLastSignal || (activeSide === 'sell' ? t.lastSignal : ''),
        price: t.sellPrice || (activeSide === 'sell' ? t.price : 0),
        effectiveSize: t.sellEffectiveSize || 0
    };

    const sd = activeSide === 'sell' ? sellData : buyData;
    const statusClass = (sd.status || 'IDLE').replace(/\s+/g, '_');
    const lockedClass = sd.locked > 0 ? 'green' : '';
    const stopClass = sd.stopouts > 0 ? 'red' : '';
    const effSize = sd.effectiveSize;

    return `
        <div class="ticker-card" id="${tid}" data-side="${activeSide}"
             data-buy-data='${JSON.stringify(buyData).replace(/'/g, "&#39;")}'
             data-sell-data='${JSON.stringify(sellData).replace(/'/g, "&#39;")}'>
            <div class="ticker-card-header">
                <div style="display:flex;align-items:center;gap:0.5rem">
                    <img src="${logoUrl(t.ticker)}" class="stock-logo" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex'"><span class="stock-logo-fallback" style="display:none">${esc(t.ticker.slice(0,2))}</span>
                    <span class="ticker-name">${esc(displayName(t.ticker))}</span>
                    <span class="ticker-status ${statusClass}">${esc(sd.status || 'IDLE')}</span>
                </div>
                <div class="side-toggle">
                    <button class="${activeSide === 'buy' ? 'active-buy' : ''}" onclick="flipSide('${tid}','buy')">Buy</button>
                    <button class="${activeSide === 'sell' ? 'active-sell' : ''}" onclick="flipSide('${tid}','sell')">Sell</button>
                </div>
            </div>
            <dl class="ticker-detail">
                <dt>Last Signal</dt><dd class="side-signal"><span class="signal-badge ${signalClass(sd.lastSignal)}" style="font-size:0.55rem;padding:2px 6px">${signalLabel(sd.lastSignal)}</span></dd>
                <dt>Price</dt><dd class="side-price">${sd.price ? '$' + Number(sd.price).toFixed(2) : '-'}</dd>
                ${(()=>{ const p=Number(sd.price); if(!p||!sd.lastSignal||sd.lastSignal==='')return '<dt>SL / TP1 / TP2</dt><dd class="side-levels" style="color:var(--muted-fg)">—</dd>'; const isBuy=(sd.lastSignal!=='sell'&&sd.lastSignal!=='reduce'); const bt=btFor(t.ticker, isBuy?'buy':'sell'); const fmtP=v=>v>=100?v.toFixed(2):v>=1?v.toFixed(4):v.toPrecision(4); const slP=isBuy?p*(1-bt.sl/100):p*(1+bt.sl/100); const halfP=isBuy?p*(1+bt.halfTp/100):p*(1-bt.halfTp/100); const tpP=isBuy?p*(1+bt.tp/100):p*(1-bt.tp/100); return `<dt>SL / TP1 / TP2</dt><dd class="side-levels"><span style="color:var(--red-bright)">${fmtP(slP)}</span> / <span style="color:var(--green-bright)">${fmtP(halfP)}</span> / <span style="color:var(--green-bright)">${fmtP(tpP)}</span> ${btTag(bt)}</dd>`; })()}
                <dt>Base Size</dt><dd class="side-base">$${sd.base.toFixed(2)}</dd>
                <dt>Effective Size</dt><dd class="side-next">${effSize === 'SIT OUT' ? '<span class="red">SIT OUT</span>' : '$' + Number(effSize || 0).toFixed(2)}</dd>
                <dt>Locked Profit</dt><dd class="side-locked ${lockedClass}">${sd.locked > 0 ? '$' + sd.locked.toFixed(2) : '$0.00'}</dd>
                <dt>Stop-outs</dt><dd class="side-stops ${stopClass}">${sd.stopouts || 0}</dd>
            </dl>
            <div class="ticker-phase">${esc(sd.phase || 'No data')}</div>
            ${sd.nextAction ? '<div class="ticker-action">' + esc(sd.nextAction) + '</div>' : ''}
            ${(sd.status === 'PROFIT' || sd.status === 'STOPPED') && sd.lastSignal ? `<div style="margin-top:0.4rem"><button class="reopen-btn" onclick="reopenTrade('${esc(t.ticker)}','${esc(sd.lastSignal)}')">↺ Reopen</button></div>` : ''}
            <div class="ticker-links">
                <a class="ticker-link tv" href="${getTickerLink(t.ticker, 'tv')}" target="_blank">TradingView</a>
                <a class="ticker-link hl" href="${getTickerLink(t.ticker, 'hl')}" target="_blank">Hyperliquid</a>
                <button class="ticker-link" onclick="editLinks('${esc(t.ticker)}')" title="Edit links">&#9998;</button>
            </div>
        </div>
    `;
}

function renderTickerGrid(filtered) {
    const grid = document.getElementById('tickerGrid');
    const btn = document.getElementById('tickerShowAll');
    const search = document.getElementById('tickerSearch').value.trim().toUpperCase();
    let tickers = filtered || allTickers;

    if (search) {
        // When searching, show all matches
        tickers = allTickers.filter(t => t.ticker.toUpperCase().includes(search) || displayName(t.ticker).toUpperCase().includes(search));
        btn.textContent = `${tickers.length} match${tickers.length !== 1 ? 'es' : ''}`;
        btn.classList.remove('active');
    } else if (!showAllTickers && tickers.length > TICKER_LIMIT) {
        // Default: show most recent 8
        tickers = tickers.slice(0, TICKER_LIMIT);
        btn.textContent = `Show All (${allTickers.length})`;
        btn.classList.remove('active');
    } else {
        btn.textContent = 'Show Recent';
        btn.classList.add('active');
    }

    grid.innerHTML = tickers.map((t, i) => renderTickerCard(t, i)).join('');
}

function filterTickers() {
    showAllTickers = false;
    renderTickerGrid();
}

function toggleShowAll() {
    const search = document.getElementById('tickerSearch');
    if (search.value.trim()) {
        search.value = '';
    }
    showAllTickers = !showAllTickers;
    renderTickerGrid();
}

// ====== TICKER LINKS ======
const TV_EXCHANGE_MAP = {
    'AAPL':'NASDAQ','AMD':'NASDAQ','AMZN':'NASDAQ','BABA':'NYSE','BOTZ':'NASDAQ',
    'CL1!':'NYMEX','COIN':'NASDAQ','COPPER':'CAPITALCOM','CRCL':'NYSE','CRWV':'NASDAQ',
    'GOOGL':'NASDAQ','HOOD':'NASDAQ','INTC':'NASDAQ','ITA':'CBOE','IWM':'AMEX',
    'MAGS':'CBOE','META':'NASDAQ','MSFT':'NASDAQ','MSTR':'NASDAQ','MU':'NASDAQ',
    'NFLX':'NASDAQ','NG1!':'NYMEX','NLR':'AMEX','NVDA':'NASDAQ','ORCL':'NYSE',
    'PLATINUM':'CAPITALCOM','PLTR':'NASDAQ','RIVN':'NASDAQ','SILVER':'CAPITALCOM',
    'SMH':'NASDAQ','SNDK':'NASDAQ','TLT':'NASDAQ','TSLA':'NASDAQ','URNM':'AMEX',
    'USAR':'NASDAQ','USOIL':'TVC','VOO':'AMEX','XBI':'AMEX','XLE':'AMEX',
    'XLK':'AMEX','XPDUSD':'OANDA',
    'K2I1!':'KRX','QQQ':'NASDAQ','005930':'KRX','000660':'KRX','011760':'KRX','HAFC':'NASDAQ'
};
const DEFAULT_TV = ticker => {
    const ex = TV_EXCHANGE_MAP[ticker.toUpperCase()] || 'NASDAQ';
    return `https://www.tradingview.com/chart/rVtW3nNy/?symbol=${encodeURIComponent(ex)}%3A${encodeURIComponent(ticker.toUpperCase())}`;
};
const HL_TICKER_MAP = {
    'AAPL':'flx:APPL','AMD':'flx:AMD','AMZN':'flx:AMZN','BABA':'flx:BABA','BOTZ':'flx:ROBOT',
    'CL1!':'flx:OIL','COIN':'flx:COIN','COPPER':'flx:COPPER','CRCL':'flx:CRCL','CRWV':'flx:CRWV',
    'GOOGL':'flx:GOOGL','HOOD':'flx:HOOD','INTC':'flx:INTC','ITA':'flx:DEFENSE','IWM':'flx:SMALL2000',
    'MAGS':'flx:MAG7','META':'flx:META','MSFT':'flx:MSFT','MSTR':'flx:MSTR','MU':'flx:MU',
    'NFLX':'flx:NFLX','NG1!':'flx:NATGAS','NLR':'flx:NUCLEAR','NVDA':'flx:NVDA','ORCL':'flx:ORCL',
    'PLATINUM':'flx:PLATINUM','PLTR':'flx:PLTR','RIVN':'xyz:RIVN','SILVER':'flx:SILVER',
    'SMH':'flx:SEMIS','SNDK':'flx:SNDK','TLT':'flx:USBOND','TSLA':'flx:TSLA','URNM':'flx:URNM',
    'USAR':'flx:USAR','USOIL':'flx:USOIL','VOO':'flx:USA500','XBI':'flx:BIOTECH','XLE':'flx:ENERGY',
    'XLK':'flx:INFOTECH','XPDUSD':'flx:PALLADIUM'
};
const DEFAULT_HL = ticker => {
    const path = HL_TICKER_MAP[ticker.toUpperCase()] || 'flx:' + ticker.toUpperCase();
    return `https://app.hyperliquid.xyz/trade/${encodeURIComponent(path)}`;
};

function getTickerLinks() {
    try { return JSON.parse(localStorage.getItem('spx_ticker_links') || '{}'); }
    catch { return {}; }
}

function saveTickerLinks(links) {
    localStorage.setItem('spx_ticker_links', JSON.stringify(links));
    markStateDirty('spx_ticker_links');
}

function getTickerLink(ticker, platform) {
    const links = getTickerLinks();
    const key = ticker.toUpperCase();
    if (links[key] && links[key][platform]) return links[key][platform];
    return platform === 'tv' ? DEFAULT_TV(ticker) : DEFAULT_HL(ticker);
}

function editLinks(ticker) {
    const key = ticker.toUpperCase();
    const links = getTickerLinks();
    const current = links[key] || {};

    const tvUrl = prompt(
        `TradingView URL for ${key}:\n(Leave empty for default)`,
        current.tv || DEFAULT_TV(ticker)
    );
    if (tvUrl === null) return; // cancelled

    const hlUrl = prompt(
        `Hyperliquid URL for ${key}:\n(Leave empty for default)`,
        current.hl || DEFAULT_HL(ticker)
    );
    if (hlUrl === null) return;

    if (!links[key]) links[key] = {};
    links[key].tv = tvUrl || '';
    links[key].hl = hlUrl || '';

    // Clean up empty entries
    if (!links[key].tv) delete links[key].tv;
    if (!links[key].hl) delete links[key].hl;
    if (Object.keys(links[key]).length === 0) delete links[key];

    saveTickerLinks(links);
    fetchData(); // re-render with new links
}

// ====== VICTORY GARDEN ======
// ============ STRATEGY REVIEW MILESTONE ============
const REVIEW_KEY = 'spx_last_review_trades';
const REVIEW_INTERVAL = 50;

function checkReviewDue(totalTrades) {
    const banner = document.getElementById('reviewBanner');
    const sub = document.getElementById('reviewSub');
    if (!banner) return;
    const lastReview = parseInt(
        localStorage.getItem(REVIEW_KEY) || '0'
    );
    const nextReview = lastReview + REVIEW_INTERVAL;
    if (totalTrades >= nextReview) {
        const milestone = Math.floor(
            totalTrades / REVIEW_INTERVAL
        ) * REVIEW_INTERVAL;
        sub.textContent = milestone +
            ' trades reached — tap to mark reviewed';
        banner.classList.add('visible');
    } else {
        banner.classList.remove('visible');
    }
}

function dismissReview() {
    const banner = document.getElementById('reviewBanner');
    const perfVal = document.querySelector(
        '#perfGrid .perf-item .perf-val'
    );
    const total = parseInt(perfVal?.textContent) || 0;
    const milestone = Math.floor(
        total / REVIEW_INTERVAL
    ) * REVIEW_INTERVAL;
    localStorage.setItem(REVIEW_KEY, String(milestone));
    markStateDirty(REVIEW_KEY);
    apiGet(POST_URL + '?action=set_review&milestone=' + milestone)
        .then(r => { if (r.ok === false) showToast('Review milestone not saved: ' + writeErr(r)); });
    banner.classList.remove('visible');
}

function renderVictories(data) {
    const garden = document.getElementById('graveyard');
    const countEl = document.getElementById('graveyardCount');
    const wins = (data.closedTrades || []).map(t => ({
        ticker: t.ticker,
        profit: parseDollar(t.profit),
        date: t.date || '',
        signal: t.signal || 'buy'
    }));
    countEl.textContent = wins.length;
    if (wins.length === 0) {
        garden.innerHTML = '<div class="victory-empty">No wins buried yet — your first victory will rise here</div>';
        return;
    }
    garden.innerHTML = wins.map(w => `
        <div class="victory-stone">
            <div class="stone-marker">
                <svg viewBox="0 0 90 130" xmlns="http://www.w3.org/2000/svg">
                    <!-- Ground -->
                    <rect x="0" y="115" width="90" height="15" fill="#2a3828" rx="1"/>
                    <path d="M0,115 Q15,112 30,115 Q45,111 60,115 Q75,112 90,115" fill="#3a4a35" opacity="0.6"/>

                    <!-- Gravestone body — woodblock style with bold outlines -->
                    <path d="M18,50 L18,108 L72,108 L72,50 Q72,18 45,18 Q18,18 18,50 Z" fill="#4a6068" stroke="#1a1815" stroke-width="2.5"/>
                    <!-- Inner border line (woodblock double-line style) -->
                    <path d="M23,52 L23,103 L67,103 L67,52 Q67,26 45,26 Q23,26 23,52 Z" fill="none" stroke="#5a7a80" stroke-width="1" opacity="0.5"/>

                    <!-- Moss & lichen patches (ukiyo-e organic shapes) -->
                    <ellipse cx="25" cy="55" rx="8" ry="5" fill="#5a8a5a" opacity="0.5"/>
                    <ellipse cx="62" cy="65" rx="7" ry="4" fill="#6a9a5a" opacity="0.4"/>
                    <ellipse cx="30" cy="95" rx="6" ry="3" fill="#5a8a5a" opacity="0.35"/>
                    <ellipse cx="55" cy="45" rx="5" ry="4" fill="#4a7a4a" opacity="0.3"/>
                    <circle cx="22" cy="40" r="3" fill="#6a9a5a" opacity="0.25"/>

                    <!-- Pedestal base -->
                    <rect x="12" y="105" width="66" height="12" rx="1" fill="#3a4a50" stroke="#1a1815" stroke-width="2"/>
                    <line x1="14" y1="108" x2="76" y2="108" stroke="#5a7a80" stroke-width="0.5" opacity="0.4"/>

                    <!-- Engraved text -->
                    <text x="45" y="58" text-anchor="middle" font-family="'Noto Serif JP',serif" font-size="14" font-weight="900" fill="#e8d5a8" stroke="#1a1815" stroke-width="0.3">${esc(displayName(w.ticker))}</text>
                    <text x="45" y="76" text-anchor="middle" font-family="'Space Mono',monospace" font-size="10" font-weight="700" fill="${w.profit >= 0 ? '#8ae08a' : '#e08a8a'}" stroke="#1a1815" stroke-width="0.2">${fmtSigned(w.profit)}</text>
                    <text x="45" y="92" text-anchor="middle" font-family="'Noto Serif JP',serif" font-size="7" fill="#c8d8d0" opacity="0.8">R.I.P.</text>

                    <!-- Grass & reeds (susuki style) -->
                    <path d="M5,118 Q8,100 10,85" stroke="#6a9a50" stroke-width="1.2" fill="none" opacity="0.7"/>
                    <path d="M8,118 Q12,102 13,90" stroke="#5a8a48" stroke-width="1" fill="none" opacity="0.6"/>
                    <path d="M2,118 Q4,105 3,92" stroke="#7aaa58" stroke-width="1" fill="none" opacity="0.5"/>
                    <!-- Plume -->
                    <ellipse cx="10" cy="83" rx="2.5" ry="8" fill="#a8b878" opacity="0.5" transform="rotate(-5,10,83)"/>
                    <ellipse cx="3" cy="90" rx="2" ry="7" fill="#a8b878" opacity="0.4" transform="rotate(3,3,90)"/>

                    <!-- Right grass -->
                    <path d="M82,118 Q84,104 86,88" stroke="#6a9a50" stroke-width="1.2" fill="none" opacity="0.7"/>
                    <path d="M85,118 Q82,106 80,93" stroke="#5a8a48" stroke-width="1" fill="none" opacity="0.6"/>
                    <ellipse cx="86" cy="86" rx="2.5" ry="8" fill="#a8b878" opacity="0.45" transform="rotate(5,86,86)"/>

                    <!-- Fallen leaves (ukiyo-e style) -->
                    <ellipse cx="15" cy="116" rx="3" ry="1.5" fill="#d4843e" opacity="0.6" transform="rotate(20,15,116)"/>
                    <ellipse cx="70" cy="117" rx="2.5" ry="1.2" fill="#c47830" opacity="0.5" transform="rotate(-15,70,117)"/>
                    <ellipse cx="40" cy="118" rx="2" ry="1" fill="#e8a04c" opacity="0.4" transform="rotate(30,40,118)"/>

                    <!-- Firefly / spirit wisp -->
                    <circle cx="75" cy="40" r="2" fill="#e8d5a8" opacity="0.5">
                        <animate attributeName="opacity" values="0.2;0.6;0.2" dur="3s" repeatCount="indefinite"/>
                    </circle>
                    <circle cx="75" cy="40" r="4" fill="#e8d5a8" opacity="0.15">
                        <animate attributeName="opacity" values="0.05;0.2;0.05" dur="3s" repeatCount="indefinite"/>
                    </circle>
                </svg>
            </div>
            <div class="stone-date">${esc(w.date)}</div>
            <button class="reopen-btn" style="margin-top:0.3rem" onclick="reopenTrade('${esc(w.ticker)}','${esc(w.signal)}')">↺ Reopen</button>
        </div>
    `).join('');
}

// ====== OMIKUJI ======
const OMIKUJI = [
    { level: 'great', label: 'Great Blessing', tip: 'The market favors the prepared mind today. Trust your setups and size with confidence.' },
    { level: 'great', label: 'Great Blessing', tip: 'A strong trend awaits you. Let winners run and do not cut them early.' },
    { level: 'good', label: 'Good Fortune', tip: 'Patience will be rewarded. Wait for the signal — do not chase.' },
    { level: 'good', label: 'Good Fortune', tip: 'Your discipline is your edge. Stick to the plan and profits will follow.' },
    { level: 'good', label: 'Good Fortune', tip: 'A reversal brings opportunity. Watch RSI for the trendline break.' },
    { level: 'small', label: 'Small Blessing', tip: 'Small gains compound into great wealth. Do not underestimate the power of consistency.' },
    { level: 'small', label: 'Small Blessing', tip: 'Today is for learning. Review your past trades and find the pattern.' },
    { level: 'small', label: 'Small Blessing', tip: 'Protect your capital. A smaller position today means a bigger one tomorrow.' },
    { level: 'uncertain', label: 'Uncertain Fortune', tip: 'The market is choppy. Sometimes the best trade is no trade at all.' },
    { level: 'uncertain', label: 'Uncertain Fortune', tip: 'Beware of overtrading. Step away from the screen and return with fresh eyes.' },
    { level: 'great', label: 'Great Blessing', tip: 'The pumpkin trader smiles upon you. Multiple setups align — be ready to act.' },
    { level: 'good', label: 'Good Fortune', tip: 'Cut the losers early and you will find the winners take care of themselves.' },
    { level: 'small', label: 'Small Blessing', tip: 'A DCA add at the right moment turns a good trade into a great one.' },
    { level: 'uncertain', label: 'Uncertain Fortune', tip: 'Three stops in a row means sit out. The market will be there tomorrow.' },
    { level: 'great', label: 'Great Blessing', tip: 'Your locked profits are seeds. Reinvest them wisely and watch them grow.' },
];

function drawOmikuji() {
    const slip = document.getElementById('omikujiSlip');
    const result = document.getElementById('omikujiResult');
    const fortune = document.getElementById('omikujiFortune');
    const tip = document.getElementById('omikujiTip');

    const o = OMIKUJI[Math.floor(Math.random() * OMIKUJI.length)];
    fortune.textContent = o.label;
    fortune.className = 'omikuji-fortune ' + o.level;
    tip.textContent = o.tip;

    slip.style.display = 'none';
    result.className = 'omikuji-result';
}

function resetOmikuji() {
    document.getElementById('omikujiSlip').style.display = 'flex';
    document.getElementById('omikujiResult').className = 'omikuji-result hidden';
}

// ====== QUOTES ======
const QUOTES = [
    { text: "The stock market is a device for transferring money from the impatient to the patient.", author: "Warren Buffett" },
    { text: "The trend is your friend until the end when it bends.", author: "Ed Seykota" },
    { text: "It's not whether you're right or wrong, but how much money you make when you're right and how much you lose when you're wrong.", author: "George Soros" },
    { text: "The goal of a successful trader is to make the best trades. Money is secondary.", author: "Alexander Elder" },
    { text: "Cut your losses short and let your profits run.", author: "Jesse Livermore" },
    { text: "Markets can remain irrational longer than you can remain solvent.", author: "John Maynard Keynes" },
    { text: "In trading, the impossible happens about twice a year.", author: "Henri M. Simoes" },
    { text: "The elements of good trading are: cutting losses, cutting losses, and cutting losses.", author: "Ed Seykota" },
    { text: "Risk comes from not knowing what you are doing.", author: "Warren Buffett" },
    { text: "Plan your trade and trade your plan.", author: "Richard Dennis" },
    { text: "The market is never wrong — opinions often are.", author: "Jesse Livermore" },
    { text: "Amateurs think about how much money they can make. Professionals think about how much money they could lose.", author: "Jack Schwager" },
    { text: "You don't need to know what is going to happen next in order to make money.", author: "Mark Douglas" },
    { text: "The most important thing in making money is not letting your losses get out of hand.", author: "Marty Schwartz" },
    { text: "Win or lose, everybody gets what they want out of the market.", author: "Ed Seykota" },
    { text: "There is a time to go long, a time to go short, and a time to go fishing.", author: "Jesse Livermore" },
    { text: "The hard work in trading comes in the preparation. The actual process of trading should be effortless.", author: "Jack Schwager" },
    { text: "Every battle is won before it is fought.", author: "Sun Tzu" },
    { text: "Discipline is the bridge between goals and accomplishment.", author: "Jim Rohn" },
    { text: "Do not anticipate and move without market confirmation.", author: "Jesse Livermore" }
];

function showQuote() {
    const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    const textEl = document.getElementById('quoteText');
    const authEl = document.getElementById('quoteAuthor');
    textEl.style.opacity = '0';
    authEl.style.opacity = '0';
    setTimeout(() => {
        textEl.textContent = '"' + q.text + '"';
        authEl.textContent = '— ' + q.author;
        textEl.style.opacity = '0.7';
        authEl.style.opacity = '0.6';
    }, 300);
}
showQuote();

// ====== WEEKLY TASKS ======
function getMonday() {
    const d = new Date(); d.setHours(0,0,0,0);
    const day = d.getDay(); const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff); return d.toISOString().slice(0,10);
}
function getCheckedTasks() { try { return JSON.parse(localStorage.getItem('spx_weekly_todos_' + getMonday()) || '[]'); } catch(e) { return []; } }
function setCheckedTasks(arr) { localStorage.setItem('spx_weekly_todos_' + getMonday(), JSON.stringify(arr)); }
async function fetchWeeklyTasks() {
    try {
        const resp = await fetch(POST_URL + '?action=tasks');
        const data = await resp.json();
        if (data.status === 'ok' && data.tasks && data.tasks.length > 0) renderWeeklyTasks(data.tasks);
    } catch(e) { console.error('Weekly tasks error:', e); }
}
function renderWeeklyTasks(tasks) {
    _lastTasks = tasks;
    const checked = getCheckedTasks();
    // Auto-check parents whose children are all checked, and build hidden set
    const hiddenSet = new Set();
    for (let i = 0; i < tasks.length; i++) {
        if (tasks[i].startsWith('>')) continue;
        const children = [];
        for (let j = i + 1; j < tasks.length && tasks[j].startsWith('>'); j++) children.push(j);
        if (children.length > 0 && children.every(c => checked.includes(c))) {
            if (!checked.includes(i)) { checked.push(i); setCheckedTasks(checked); }
            hiddenSet.add(i);
            children.forEach(c => hiddenSet.add(c));
        }
    }
    const allDone = tasks.every((_, i) => checked.includes(i));
    const container = document.getElementById('weeklyTasks');
    container.style.display = '';
    const resetEl = document.getElementById('weeklyReset');
    resetEl.style.display = hiddenSet.size > 0 || allDone ? '' : 'none';
    if (allDone) {
        document.getElementById('weeklyTasksList').innerHTML = '';
        document.getElementById('weeklyTasksCount').textContent = tasks.length + '/' + tasks.length;
        return;
    }
    const doneCount = checked.filter(c => c < tasks.length).length;
    document.getElementById('weeklyTasksCount').textContent = doneCount + '/' + tasks.length;
    document.getElementById('weeklyTasksList').innerHTML = tasks.map((task, i) => {
        if (hiddenSet.has(i)) return ''; // hide completed groups
        const isDone = checked.includes(i);
        const isSub = task.startsWith('>');
        const displayText = isSub ? task.slice(1).trim() : task;
        return `<div class="weekly-task-item${isDone ? ' checked' : ''}${isSub ? ' sub-task' : ''}" onclick="toggleTask(${i}, ${JSON.stringify(tasks).replace(/"/g, '&quot;')})">
            <div class="weekly-task-checkbox"></div>
            <span class="task-text">${esc(displayText)}</span>
        </div>`;
    }).join('');
}
var _lastTasks = [];
function resetWeeklyTasks() {
    setCheckedTasks([]);
    renderWeeklyTasks(_lastTasks);
}
function toggleTask(idx, tasks) {
    const checked = getCheckedTasks();
    const pos = checked.indexOf(idx);
    if (pos === -1) checked.push(idx); else checked.splice(pos, 1);
    setCheckedTasks(checked);
    renderWeeklyTasks(tasks);
}

// ====== 4-DAY CHECK ======
function get4DayStates() { try { return JSON.parse(localStorage.getItem('spx_4day_checks') || '{}'); } catch(e) { return {}; } }
function set4DayStates(obj) { localStorage.setItem('spx_4day_checks', JSON.stringify(obj)); markStateDirty('spx_4day_checks'); }
function toggle4DayCheck(cardId) {
    const el = document.getElementById(cardId);
    const ticker = el ? el.dataset.ticker : '';
    if (!ticker) return;
    const states = get4DayStates();
    states[ticker] = Date.now();
    set4DayStates(states);
    update4DayBtn(ticker, cardId);
    updateNeed4DayCount();
}
function update4DayBtn(ticker, cardId) {
    const btn = document.getElementById(cardId + '-4day');
    if (!btn) return;
    const states = get4DayStates();
    const ts = states[ticker];
    if (!ts) {
        // Auto-start timer
        states[ticker] = Date.now();
        set4DayStates(states);
    }
    const elapsed = Date.now() - (states[ticker] || Date.now());
    const fourDays = 4 * 24 * 60 * 60 * 1000;
    const remaining = fourDays - elapsed;
    if (remaining <= 0) {
        btn.className = 'action-btn four-day-btn needs-check';
        btn.textContent = 'CHECK!';
    } else {
        btn.className = 'action-btn four-day-btn checked';
        const hoursLeft = Math.ceil(remaining / (1000 * 60 * 60));
        if (hoursLeft > 24) {
            btn.textContent = Math.ceil(hoursLeft / 24) + 'd';
        } else {
            btn.textContent = hoursLeft + 'h';
        }
    }
}
function restore4DayStates() {
    document.querySelectorAll('#openTradesList .action-item').forEach(el => {
        const ticker = el.dataset.ticker;
        if (ticker) update4DayBtn(ticker, el.id);
    });
    updateNeed4DayCount();
}
function updateNeed4DayCount() {
    const states = get4DayStates();
    const fourDays = 4 * 24 * 60 * 60 * 1000;
    let count = 0;
    document.querySelectorAll('#openTradesList .action-item').forEach(el => {
        const ticker = el.dataset.ticker;
        if (ticker && states[ticker]) {
            const remaining = fourDays - (Date.now() - states[ticker]);
            if (remaining <= 0) count++;
        }
    });
    const btn = document.querySelector('.need-4day-btn');
    if (btn) {
        btn.textContent = count > 0 ? 'Need 4 Day (' + count + ')' : 'Need 4 Day';
        btn.classList.toggle('has-alerts', count > 0);
    }
    notify4DayDue(count);
}
let last4DayDueCount = null;
function notify4DayDue(count) {
    const prev = last4DayDueCount;
    last4DayDueCount = count;
    if (prev === null || count <= prev) return; // only when the number of due checks goes up
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const title = '4-day check due';
    const opts = { body: count + (count === 1 ? ' open trade needs' : ' open trades need') + ' its 4-day review', icon: 'icon-192.png', tag: 'spx-4day' };
    try {
        if (navigator.serviceWorker && navigator.serviceWorker.ready) navigator.serviceWorker.ready.then(reg => reg.showNotification(title, opts));
        else new Notification(title, opts);
    } catch (e) { console.warn('4-day notification failed:', e); }
}

// Override filterOpenTrades to handle need-4day + search
const _origFilterOpen = filterOpenTrades;
filterOpenTrades = function() {
    const states = get4DayStates();
    const fourDays = 4 * 24 * 60 * 60 * 1000;
    const search = (document.getElementById('otSearch').value || '').toUpperCase().trim();
    document.querySelectorAll('#openTradesList .action-item').forEach(el => {
        const ticker = (el.dataset.ticker || '').toUpperCase();
        const matchSearch = !search || ticker.includes(search);
        let matchFilter = true;
        if (openTradeFilter === 'need-4day') {
            const ts = el.dataset.ticker;
            const tsState = ts && states[ts];
            matchFilter = tsState && (fourDays - (Date.now() - tsState)) <= 0;
        }
        el.style.display = (matchSearch && matchFilter) ? '' : 'none';
    });
};

// Hook into renderOpenTrades to restore 4-day states after render
const _origRenderOpen = renderOpenTrades;
renderOpenTrades = function(trades) {
    _origRenderOpen(trades);
    setTimeout(restore4DayStates, 50);
};

// ====== POKEMON SCALING ======
const POKE_SPRITE = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;

// Location backgrounds from FireRed/LeafGreen
const LOCATION_BG = {
    pallet:   'locations/pallet.png',
    pewter:   'locations/pewter.png',
    cerulean: 'locations/cerulean.png',
    vermilion:'locations/vermilion.png',
    celadon:  'locations/celadon.png',
    fuchsia:  'locations/fuchsia.png',
    cinnabar: 'locations/cinnabar.png',
    indigo:   'locations/indigo.png'
};

const POKEMON_LEVELS = [
    // Pallet Town — Starters
    { min:     0, pokemon: 'Bulbasaur',   pokeId:   1, location: 'pallet' },
    { min:     4, pokemon: 'Ivysaur',     pokeId:   2, location: 'pallet' },
    { min:     7, pokemon: 'Venusaur',    pokeId:   3, location: 'pallet' },
    { min:    11, pokemon: 'Charmander',  pokeId:   4, location: 'pallet' },
    { min:    14, pokemon: 'Charmeleon',  pokeId:   5, location: 'pallet' },
    { min:    20, pokemon: 'Charizard',   pokeId:   6, location: 'pallet' },
    { min:    27, pokemon: 'Squirtle',    pokeId:   7, location: 'pallet' },
    { min:    35, pokemon: 'Wartortle',   pokeId:   8, location: 'pallet' },
    { min:    45, pokemon: 'Blastoise',   pokeId:   9, location: 'pallet' },
    // Viridian to Pewter — Early Routes
    { min:    57, pokemon: 'Caterpie',    pokeId:  10, location: 'pewter' },
    { min:    69, pokemon: 'Metapod',     pokeId:  11, location: 'pewter' },
    { min:    78, pokemon: 'Butterfree',  pokeId:  12, location: 'pewter' },
    { min:    96, pokemon: 'Weedle',      pokeId:  13, location: 'pewter' },
    { min:   106, pokemon: 'Kakuna',      pokeId:  14, location: 'pewter' },
    { min:   128, pokemon: 'Beedrill',    pokeId:  15, location: 'pewter' },
    { min:   142, pokemon: 'Pidgey',      pokeId:  16, location: 'pewter' },
    { min:   156, pokemon: 'Pidgeotto',   pokeId:  17, location: 'pewter' },
    { min:   186, pokemon: 'Pidgeot',     pokeId:  18, location: 'pewter' },
    { min:   204, pokemon: 'Rattata',     pokeId:  19, location: 'pewter' },
    { min:   234, pokemon: 'Raticate',    pokeId:  20, location: 'pewter' },
    { min:   252, pokemon: 'Spearow',     pokeId:  21, location: 'pewter' },
    { min:   278, pokemon: 'Fearow',      pokeId:  22, location: 'pewter' },
    { min:   318, pokemon: 'Ekans',       pokeId:  23, location: 'pewter' },
    { min:   344, pokemon: 'Arbok',       pokeId:  24, location: 'pewter' },
    { min:   379, pokemon: 'Pikachu',     pokeId:  25, location: 'pewter' },
    { min:   419, pokemon: 'Raichu',      pokeId:  26, location: 'pewter' },
    { min:   459, pokemon: 'Sandshrew',   pokeId:  27, location: 'pewter' },
    { min:   485, pokemon: 'Sandslash',   pokeId:  28, location: 'pewter' },
    { min:   513, pokemon: 'Nidoran\u2640', pokeId: 29, location: 'pewter' },
    { min:   548, pokemon: 'Nidorina',    pokeId:  30, location: 'pewter' },
    { min:   598, pokemon: 'Nidoqueen',   pokeId:  31, location: 'pewter' },
    { min:   628, pokemon: 'Nidoran\u2642', pokeId: 32, location: 'pewter' },
    { min:   673, pokemon: 'Nidorino',    pokeId:  33, location: 'pewter' },
    { min:   738, pokemon: 'Nidoking',    pokeId:  34, location: 'pewter' },
    // Cerulean to Vermilion — Gym Challenge
    { min:   773, pokemon: 'Clefairy',    pokeId:  35, location: 'cerulean' },
    { min:   853, pokemon: 'Clefable',    pokeId:  36, location: 'cerulean' },
    { min:   893, pokemon: 'Vulpix',      pokeId:  37, location: 'cerulean' },
    { min:   943, pokemon: 'Ninetales',   pokeId:  38, location: 'cerulean' },
    { min:  1028, pokemon: 'Jigglypuff',  pokeId:  39, location: 'cerulean' },
    { min:  1073, pokemon: 'Wigglytuff',  pokeId:  40, location: 'cerulean' },
    { min:  1143, pokemon: 'Zubat',       pokeId:  41, location: 'vermilion' },
    { min:  1203, pokemon: 'Golbat',      pokeId:  42, location: 'vermilion' },
    { min:  1278, pokemon: 'Oddish',      pokeId:  43, location: 'vermilion' },
    { min:  1353, pokemon: 'Gloom',       pokeId:  44, location: 'vermilion' },
    { min:  1443, pokemon: 'Vileplume',   pokeId:  45, location: 'vermilion' },
    { min:  1533, pokemon: 'Paras',       pokeId:  46, location: 'vermilion' },
    { min:  1613, pokemon: 'Parasect',    pokeId:  47, location: 'vermilion' },
    { min:  1678, pokemon: 'Venonat',     pokeId:  48, location: 'vermilion' },
    { min:  1773, pokemon: 'Venomoth',    pokeId:  49, location: 'vermilion' },
    { min:  1828, pokemon: 'Diglett',     pokeId:  50, location: 'vermilion' },
    { min:  1918, pokemon: 'Dugtrio',     pokeId:  51, location: 'vermilion' },
    { min:  1973, pokemon: 'Meowth',      pokeId:  52, location: 'vermilion' },
    { min:  2053, pokemon: 'Persian',     pokeId:  53, location: 'vermilion' },
    { min:  2183, pokemon: 'Psyduck',     pokeId:  54, location: 'vermilion' },
    { min:  2258, pokemon: 'Golduck',     pokeId:  55, location: 'vermilion' },
    { min:  2323, pokemon: 'Mankey',      pokeId:  56, location: 'vermilion' },
    { min:  2423, pokemon: 'Primeape',    pokeId:  57, location: 'vermilion' },
    { min:  2523, pokemon: 'Growlithe',   pokeId:  58, location: 'vermilion' },
    { min:  2663, pokemon: 'Arcanine',    pokeId:  59, location: 'vermilion' },
    { min:  2783, pokemon: 'Poliwag',     pokeId:  60, location: 'vermilion' },
    { min:  2923, pokemon: 'Poliwhirl',   pokeId:  61, location: 'vermilion' },
    { min:  3008, pokemon: 'Poliwrath',   pokeId:  62, location: 'vermilion' },
    { min:  3158, pokemon: 'Abra',        pokeId:  63, location: 'vermilion' },
    { min:  3298, pokemon: 'Kadabra',     pokeId:  64, location: 'vermilion' },
    { min:  3448, pokemon: 'Alakazam',    pokeId:  65, location: 'vermilion' },
    // Celadon to Fuchsia — Building Power
    { min:  3618, pokemon: 'Machop',      pokeId:  66, location: 'celadon' },
    { min:  3768, pokemon: 'Machoke',     pokeId:  67, location: 'celadon' },
    { min:  3863, pokemon: 'Machamp',     pokeId:  68, location: 'celadon' },
    { min:  4003, pokemon: 'Bellsprout',  pokeId:  69, location: 'celadon' },
    { min:  4183, pokemon: 'Weepinbell',  pokeId:  70, location: 'celadon' },
    { min:  4353, pokemon: 'Victreebel',  pokeId:  71, location: 'celadon' },
    { min:  4543, pokemon: 'Tentacool',   pokeId:  72, location: 'celadon' },
    { min:  4633, pokemon: 'Tentacruel',  pokeId:  73, location: 'celadon' },
    { min:  4743, pokemon: 'Geodude',     pokeId:  74, location: 'celadon' },
    { min:  4923, pokemon: 'Graveler',    pokeId:  75, location: 'celadon' },
    { min:  5053, pokemon: 'Golem',       pokeId:  76, location: 'celadon' },
    { min:  5233, pokemon: 'Ponyta',      pokeId:  77, location: 'celadon' },
    { min:  5443, pokemon: 'Rapidash',    pokeId:  78, location: 'celadon' },
    { min:  5653, pokemon: 'Slowpoke',    pokeId:  79, location: 'celadon' },
    { min:  5793, pokemon: 'Slowbro',     pokeId:  80, location: 'celadon' },
    { min:  6013, pokemon: 'Magnemite',   pokeId:  81, location: 'fuchsia' },
    { min:  6233, pokemon: 'Magneton',    pokeId:  82, location: 'fuchsia' },
    { min:  6473, pokemon: "Farfetch\u2019d", pokeId: 83, location: 'fuchsia' },
    { min:  6583, pokemon: 'Doduo',       pokeId:  84, location: 'fuchsia' },
    { min:  6693, pokemon: 'Dodrio',      pokeId:  85, location: 'fuchsia' },
    { min:  6913, pokemon: 'Seel',        pokeId:  86, location: 'fuchsia' },
    { min:  7163, pokemon: 'Dewgong',     pokeId:  87, location: 'fuchsia' },
    { min:  7383, pokemon: 'Grimer',      pokeId:  88, location: 'fuchsia' },
    { min:  7503, pokemon: 'Muk',         pokeId:  89, location: 'fuchsia' },
    { min:  7733, pokemon: 'Shellder',    pokeId:  90, location: 'fuchsia' },
    { min:  7923, pokemon: 'Cloyster',    pokeId:  91, location: 'fuchsia' },
    { min:  8083, pokemon: 'Gastly',      pokeId:  92, location: 'fuchsia' },
    { min:  8323, pokemon: 'Haunter',     pokeId:  93, location: 'fuchsia' },
    { min:  8603, pokemon: 'Gengar',      pokeId:  94, location: 'fuchsia' },
    { min:  8833, pokemon: 'Onix',        pokeId:  95, location: 'fuchsia' },
    { min:  8993, pokemon: 'Drowzee',     pokeId:  96, location: 'fuchsia' },
    { min:  9263, pokemon: 'Hypno',       pokeId:  97, location: 'fuchsia' },
    { min:  9483, pokemon: 'Krabby',      pokeId:  98, location: 'fuchsia' },
    { min:  9653, pokemon: 'Kingler',     pokeId:  99, location: 'fuchsia' },
    // Cinnabar Island — Scaling Up
    { min:  9943, pokemon: 'Voltorb',     pokeId: 100, location: 'cinnabar' },
    { min: 10103, pokemon: 'Electrode',   pokeId: 101, location: 'cinnabar' },
    { min: 10373, pokemon: 'Exeggcute',   pokeId: 102, location: 'cinnabar' },
    { min: 10523, pokemon: 'Exeggutor',   pokeId: 103, location: 'cinnabar' },
    { min: 10773, pokemon: 'Cubone',      pokeId: 104, location: 'cinnabar' },
    { min: 10993, pokemon: 'Marowak',     pokeId: 105, location: 'cinnabar' },
    { min: 11203, pokemon: 'Hitmonlee',   pokeId: 106, location: 'cinnabar' },
    { min: 11413, pokemon: 'Hitmonchan',  pokeId: 107, location: 'cinnabar' },
    { min: 11713, pokemon: 'Lickitung',   pokeId: 108, location: 'cinnabar' },
    { min: 11973, pokemon: 'Koffing',     pokeId: 109, location: 'cinnabar' },
    { min: 12183, pokemon: 'Weezing',     pokeId: 110, location: 'cinnabar' },
    { min: 12353, pokemon: 'Rhyhorn',     pokeId: 111, location: 'cinnabar' },
    { min: 12533, pokemon: 'Rhydon',      pokeId: 112, location: 'cinnabar' },
    { min: 12883, pokemon: 'Chansey',     pokeId: 113, location: 'cinnabar' },
    { min: 13073, pokemon: 'Tangela',     pokeId: 114, location: 'cinnabar' },
    { min: 13343, pokemon: 'Kangaskhan',  pokeId: 115, location: 'cinnabar' },
    { min: 13613, pokemon: 'Horsea',      pokeId: 116, location: 'cinnabar' },
    { min: 13893, pokemon: 'Seadra',      pokeId: 117, location: 'cinnabar' },
    { min: 14123, pokemon: 'Goldeen',     pokeId: 118, location: 'cinnabar' },
    { min: 14373, pokemon: 'Seaking',     pokeId: 119, location: 'cinnabar' },
    { min: 14723, pokemon: 'Staryu',      pokeId: 120, location: 'cinnabar' },
    { min: 14903, pokemon: 'Starmie',     pokeId: 121, location: 'cinnabar' },
    { min: 15278, pokemon: 'Mr. Mime',    pokeId: 122, location: 'cinnabar' },
    { min: 15468, pokemon: 'Scyther',     pokeId: 123, location: 'cinnabar' },
    { min: 15728, pokemon: 'Jynx',        pokeId: 124, location: 'cinnabar' },
    { min: 15998, pokemon: 'Electabuzz',  pokeId: 125, location: 'cinnabar' },
    { min: 16268, pokemon: 'Magmar',      pokeId: 126, location: 'cinnabar' },
    { min: 16668, pokemon: 'Pinsir',      pokeId: 127, location: 'cinnabar' },
    { min: 17043, pokemon: 'Tauros',      pokeId: 128, location: 'cinnabar' },
    { min: 17343, pokemon: 'Magikarp',    pokeId: 129, location: 'cinnabar' },
    { min: 17743, pokemon: 'Gyarados',    pokeId: 130, location: 'cinnabar' },
    // Victory Road — Elite Territory
    { min: 18193, pokemon: 'Lapras',      pokeId: 131, location: 'indigo' },
    { min: 18523, pokemon: 'Ditto',       pokeId: 132, location: 'indigo' },
    { min: 18787, pokemon: 'Eevee',       pokeId: 133, location: 'indigo' },
    { min: 19227, pokemon: 'Vaporeon',    pokeId: 134, location: 'indigo' },
    { min: 19694, pokemon: 'Jolteon',     pokeId: 135, location: 'indigo' },
    { min: 20002, pokemon: 'Flareon',     pokeId: 136, location: 'indigo' },
    { min: 20310, pokemon: 'Porygon',     pokeId: 137, location: 'indigo' },
    { min: 20596, pokemon: 'Omanyte',     pokeId: 138, location: 'indigo' },
    { min: 20827, pokemon: 'Omastar',     pokeId: 139, location: 'indigo' },
    { min: 21212, pokemon: 'Kabuto',      pokeId: 140, location: 'indigo' },
    { min: 21679, pokemon: 'Kabutops',    pokeId: 141, location: 'indigo' },
    { min: 22009, pokemon: 'Aerodactyl',  pokeId: 142, location: 'indigo' },
    { min: 22421, pokemon: 'Snorlax',     pokeId: 143, location: 'indigo' },
    // Indigo Plateau — Pokemon League
    { min: 22696, pokemon: 'Articuno',    pokeId: 144, location: 'indigo' },
    { min: 23219, pokemon: 'Zapdos',      pokeId: 145, location: 'indigo' },
    { min: 23460, pokemon: 'Moltres',     pokeId: 146, location: 'indigo' },
    { min: 23873, pokemon: 'Dratini',     pokeId: 147, location: 'indigo' },
    { min: 24285, pokemon: 'Dragonair',   pokeId: 148, location: 'indigo' },
    { min: 24643, pokemon: 'Dragonite',   pokeId: 149, location: 'indigo' },
    { min: 25000, pokemon: 'Mewtwo',      pokeId: 150, location: 'indigo' },
    { min: 30000, pokemon: 'Mew',         pokeId: 151, location: 'indigo' }
];

function getPokemonLevel(pnl) {
    let level = POKEMON_LEVELS[0];
    for (const l of POKEMON_LEVELS) {
        if (pnl >= l.min) level = l;
    }
    return level;
}

function getNextPokemonLevel(currentLevel) {
    const idx = POKEMON_LEVELS.indexOf(currentLevel);
    if (idx >= 0 && idx < POKEMON_LEVELS.length - 1) return POKEMON_LEVELS[idx + 1];
    return null;
}

// Compute 5 trade sizes for any profit level (same curve as crypto)
function getStockSizes(profit) {
    const p = Math.max(0, profit);
    const SIZE_TABLE = [
        [0,[1,1,1,1,1]], [4,[2,1,1,1,1]], [8,[2,2,1,1,1]], [12,[2,2,2,1,1]],
        [16,[2,2,2,2,1]], [20,[2,2,2,2,2]], [28,[3,2,2,2,2]], [35,[3,3,2,2,2]],
        [45,[3,3,3,2,2]], [55,[3,3,3,3,2]], [65,[3,3,3,3,3]], [72,[4,3,3,3,3]],
        [78,[4,4,3,3,3]], [84,[4,4,4,3,3]], [92,[4,4,4,4,3]], [100,[4,4,4,4,4]],
        [105,[5,4,4,4,4]], [110,[5,5,4,4,4]], [115,[5,5,5,4,4]], [120,[5,5,5,5,4]],
        [125,[5,5,5,5,5]]
    ];
    if (p <= 125) {
        let sizes = SIZE_TABLE[0][1];
        for (const [min, s] of SIZE_TABLE) { if (p >= min) sizes = s; }
        return sizes.slice();
    }
    const base = Math.round(5 + Math.pow((p - 125) / 47, 0.87));
    const spread = Math.max(1, Math.round(base * 0.05));
    const t1 = base + spread;
    const t2 = base;
    const t3 = base;
    const t4 = Math.max(1, base - spread);
    const t5 = Math.max(1, Math.ceil(base / 2));
    return [t1, t2, t3, t4, t5];
}

// Level-up detection
const POKE_LEVEL_KEY = 'spx_pokemon_level';
function getUnlockedPokeLevel() { return parseFloat(localStorage.getItem(POKE_LEVEL_KEY) || '0'); }
function setUnlockedPokeLevel(val) { localStorage.setItem(POKE_LEVEL_KEY, String(val)); markStateDirty(POKE_LEVEL_KEY); }

function checkPokemonLevelUp(pnl) {
    const current = getPokemonLevel(pnl);
    const unlocked = getUnlockedPokeLevel();
    if (current.min > unlocked && unlocked >= 0) {
        showLevelUp(current);
        setUnlockedPokeLevel(current.min);
    }
}

function showLevelUp(level) {
    const overlay = document.getElementById('levelupOverlay');
    const sprite = document.getElementById('levelupSprite');
    const detail = document.getElementById('levelupDetail');
    const pokename = document.getElementById('levelupPokename');
    sprite.src = POKE_SPRITE(level.pokeId);
    sprite.className = 'levelup-pokemon evolving';
    const sizes = getStockSizes(level.min);
    detail.innerHTML = `Profit hit <span style="color:var(--green-bright);font-weight:700">$${level.min}</span><br>Trade sizes: <span style="color:var(--pumpkin-glow);font-weight:700">${sizes.map(v => '$' + v).join(' / ')}</span>`;
    pokename.textContent = level.pokemon;
    overlay.style.display = 'flex';
    setTimeout(() => { sprite.className = 'levelup-pokemon'; }, 1500);
}

function dismissLevelUp() {
    const overlay = document.getElementById('levelupOverlay');
    overlay.style.transition = 'opacity 0.4s';
    overlay.style.opacity = '0';
    setTimeout(() => {
        overlay.style.display = 'none';
        overlay.style.opacity = '';
        overlay.style.transition = '';
    }, 400);
}

// ====== POKEMON BOX RENDER ======

function renderPokemon(stats) {
    window._lastStats = stats;
    const box = document.getElementById('pokemonBox');
    if (!box) return;
    const pnl = parseDollar(stats.netPnl);

    // DCA-boosted P&L
    const activePnl = dcaMode ? Math.round((pnl + dcaTotal) * 100) / 100 : pnl;
    const organicLevel = getPokemonLevel(pnl);
    const organicIdx = POKEMON_LEVELS.indexOf(organicLevel) + 1;

    const level = getPokemonLevel(activePnl);
    const nextLevel = getNextPokemonLevel(level);
    const levelIdx = POKEMON_LEVELS.indexOf(level) + 1;
    const sizes = getStockSizes(level.min);
    const totalRisk = sizes.reduce((a, b) => a + b, 0);

    const pnlStr = pnl >= 0 ? '+$' + pnl.toFixed(2) : '-$' + Math.abs(pnl).toFixed(2);
    const pnlClass = pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : 'zero';

    // XP bar
    const xpFrom = level.min;
    const xpTo = nextLevel ? nextLevel.min : level.min;
    const xpRange = xpTo - xpFrom;
    const xpProgress = xpRange > 0 ? Math.max(0, Math.min(100, ((activePnl - xpFrom) / xpRange) * 100)) : 100;

    const needStr = nextLevel ? '$' + (nextLevel.min - activePnl).toFixed(2) + ' to Evolve' : '';

    // Per-stock sizing: Kelly fractions with pokeball chips (matching crypto dashboard)
    const tickerCount = stockCount;
    const wins = parseInt(stats.wins) || 0;
    const losses = parseInt(stats.losses) || 0;
    const tradeTotal = wins + losses;
    const gw = Math.abs(parseDollar(stats.totalProfit));
    const gl = Math.abs(parseDollar(stats.totalLost));
    const avgWin = wins > 0 ? gw / wins : 0;
    const avgLoss = losses > 0 ? gl / losses : 0;
    const wr = tradeTotal > 0 ? wins / tradeTotal : 0;
    const rr = avgLoss > 0 ? avgWin / avgLoss : 0;
    const kellyF = rr > 0 ? (rr * wr - (1 - wr)) / rr : 0;
    const kellyBankroll = Math.max(0, dcaTotal + pnl);
    const halfKellyDollar = Math.max(0, kellyBankroll * kellyF / 2);
    const quarterKellyDollar = halfKellyDollar / 2;
    const eighthKellyDollar = halfKellyDollar / 4;
    const sixteenthKellyDollar = halfKellyDollar / 8;
    const perStockHalf = tickerCount > 0 ? halfKellyDollar / tickerCount : 0;
    const perStockQuarter = tickerCount > 0 ? quarterKellyDollar / tickerCount : 0;
    const perStockEighth = tickerCount > 0 ? eighthKellyDollar / tickerCount : 0;
    const perStockSixteenth = tickerCount > 0 ? sixteenthKellyDollar / tickerCount : 0;

    // Pokeball SVGs
    const pokeballSvg = `<svg class="pokeball-svg" viewBox="0 0 20 20"><circle class="ball-outline" cx="10" cy="10" r="9"/><path class="ball-top" d="M1.3,10 A8.7,8.7 0 0 1 18.7,10 Z"/><path class="ball-bottom" d="M1.3,10 A8.7,8.7 0 0 0 18.7,10 Z"/><line class="ball-line" x1="1" y1="10" x2="19" y2="10"/><circle class="ball-center" cx="10" cy="10" r="3"/></svg>`;
    const greatBallSvg = `<svg class="pokeball-svg" viewBox="0 0 20 20"><circle class="ball-outline" cx="10" cy="10" r="9"/><path d="M1.3,10 A8.7,8.7 0 0 1 18.7,10 Z" fill="#42a5f5"/><path d="M2.5,7.5 A8,8 0 0 1 17.5,7.5" fill="#ef5350" stroke="none"/><path class="ball-bottom" d="M1.3,10 A8.7,8.7 0 0 0 18.7,10 Z"/><line class="ball-line" x1="1" y1="10" x2="19" y2="10"/><circle class="ball-center" cx="10" cy="10" r="3"/></svg>`;
    const ultraBallSvg = `<svg class="pokeball-svg" viewBox="0 0 20 20"><circle class="ball-outline" cx="10" cy="10" r="9"/><path d="M1.3,10 A8.7,8.7 0 0 1 18.7,10 Z" fill="#333"/><path d="M3,8 h14" stroke="#fdd835" stroke-width="2" fill="none"/><path class="ball-bottom" d="M1.3,10 A8.7,8.7 0 0 0 18.7,10 Z"/><line class="ball-line" x1="1" y1="10" x2="19" y2="10"/><circle cx="10" cy="10" r="3" fill="#fdd835" stroke="#333" stroke-width="1.5"/></svg>`;
    const masterBallSvg = `<svg class="pokeball-svg" viewBox="0 0 20 20"><circle class="ball-outline" cx="10" cy="10" r="9"/><path d="M1.3,10 A8.7,8.7 0 0 1 18.7,10 Z" fill="#7e57c2"/><text x="10" y="8" text-anchor="middle" fill="#e1bee7" font-size="6" font-weight="900">M</text><path class="ball-bottom" d="M1.3,10 A8.7,8.7 0 0 0 18.7,10 Z"/><line class="ball-line" x1="1" y1="10" x2="19" y2="10"/><circle cx="10" cy="10" r="3" fill="#e1bee7" stroke="#333" stroke-width="1.5"/></svg>`;
    const duskBallSvg = `<svg class="pokeball-svg" viewBox="0 0 20 20"><circle class="ball-outline" cx="10" cy="10" r="9"/><path d="M1.3,10 A8.7,8.7 0 0 1 18.7,10 Z" fill="#2e7d32"/><path d="M1.3,10 A8.7,8.7 0 0 0 18.7,10 Z" fill="#1a1a1a"/><line class="ball-line" x1="1" y1="10" x2="19" y2="10"/><circle cx="10" cy="10" r="3" fill="#66bb6a" stroke="#333" stroke-width="1.5"/></svg>`;
    const timerBallSvg = `<svg class="pokeball-svg" viewBox="0 0 20 20"><circle class="ball-outline" cx="10" cy="10" r="9"/><path d="M1.3,10 A8.7,8.7 0 0 1 18.7,10 Z" fill="#e53935"/><line x1="10" y1="2" x2="10" y2="5" stroke="#fff" stroke-width="1"/><line x1="10" y1="2" x2="10" y2="5" stroke="#fff" stroke-width="1" transform="rotate(90 10 10)"/><path class="ball-bottom" d="M1.3,10 A8.7,8.7 0 0 0 18.7,10 Z"/><line class="ball-line" x1="1" y1="10" x2="19" y2="10"/><circle class="ball-center" cx="10" cy="10" r="3"/></svg>`;
    const netBallSvg = `<svg class="pokeball-svg" viewBox="0 0 20 20"><circle class="ball-outline" cx="10" cy="10" r="9"/><path d="M1.3,10 A8.7,8.7 0 0 1 18.7,10 Z" fill="#0097a7"/><path d="M3,5 L17,5 M5,3 L5,10 M10,2 L10,10 M15,3 L15,10" stroke="#4dd0e1" stroke-width="0.5" fill="none"/><path class="ball-bottom" d="M1.3,10 A8.7,8.7 0 0 0 18.7,10 Z"/><line class="ball-line" x1="1" y1="10" x2="19" y2="10"/><circle cx="10" cy="10" r="3" fill="#4dd0e1" stroke="#333" stroke-width="1.5"/></svg>`;
    const quickBallSvg = `<svg class="pokeball-svg" viewBox="0 0 20 20"><circle class="ball-outline" cx="10" cy="10" r="9"/><path d="M1.3,10 A8.7,8.7 0 0 1 18.7,10 Z" fill="#1565c0"/><path d="M5,5 L15,8 M4,7 L16,4" stroke="#fdd835" stroke-width="1.2" fill="none"/><path class="ball-bottom" d="M1.3,10 A8.7,8.7 0 0 0 18.7,10 Z"/><line class="ball-line" x1="1" y1="10" x2="19" y2="10"/><circle cx="10" cy="10" r="3" fill="#fdd835" stroke="#333" stroke-width="1.5"/></svg>`;
    const healBallSvg = `<svg class="pokeball-svg" viewBox="0 0 20 20"><circle class="ball-outline" cx="10" cy="10" r="9"/><path d="M1.3,10 A8.7,8.7 0 0 1 18.7,10 Z" fill="#ec407a"/><path d="M7,6 h6 v2 h-6z" fill="#fff" opacity="0.6"/><path d="M9,4 h2 v6 h-2z" fill="#fff" opacity="0.6"/><path class="ball-bottom" d="M1.3,10 A8.7,8.7 0 0 0 18.7,10 Z"/><line class="ball-line" x1="1" y1="10" x2="19" y2="10"/><circle cx="10" cy="10" r="3" fill="#f8bbd0" stroke="#333" stroke-width="1.5"/></svg>`;
    const luxuryBallSvg = `<svg class="pokeball-svg" viewBox="0 0 20 20"><circle class="ball-outline" cx="10" cy="10" r="9"/><path d="M1.3,10 A8.7,8.7 0 0 1 18.7,10 Z" fill="#212121"/><path d="M3,6 Q10,3 17,6" stroke="#f44336" stroke-width="1.2" fill="none"/><path d="M3,8 Q10,5 17,8" stroke="#f44336" stroke-width="1.2" fill="none"/><path class="ball-bottom" d="M1.3,10 A8.7,8.7 0 0 0 18.7,10 Z"/><line class="ball-line" x1="1" y1="10" x2="19" y2="10"/><circle cx="10" cy="10" r="3" fill="#f44336" stroke="#333" stroke-width="1.5"/></svg>`;
    const ballSvgs = [ultraBallSvg, masterBallSvg, greatBallSvg, timerBallSvg, healBallSvg, luxuryBallSvg, netBallSvg, duskBallSvg, quickBallSvg, pokeballSvg];

    // Kelly fraction sizes (same as crypto dashboard)
    const _kellyBudget = Math.floor(kellyBankroll * Math.max(0, kellyF / 2));
    const _exposureBudget = Math.floor(kellyBankroll * 0.25);
    const _avgBudget = Math.floor((_exposureBudget + _kellyBudget) / 2);
    const _totalSlots = tickerCount > 0 ? tickerCount : 1;
    const kellySizes = [
        { label: 'Avg', amt: _totalSlots > 0 ? (_avgBudget / _totalSlots) : 0, cls: 'lead' },
        { label: 'K', amt: _totalSlots > 0 ? (_kellyBudget / _totalSlots) : 0, cls: 'lead' },
        { label: '\u{1F525}', amt: _totalSlots > 0 ? ((_kellyBudget / 2) / _totalSlots) : 0, cls: 'mid' },
        { label: '\u{26A1}', amt: _totalSlots > 0 ? ((_kellyBudget / 4) / _totalSlots) : 0, cls: 'mid' },
        { label: '\u{1FA78}', amt: _totalSlots > 0 ? ((_kellyBudget / 128) / _totalSlots) : 0, cls: 'half' },
        { label: '\u{2728}', amt: _totalSlots > 0 ? ((_kellyBudget / 256) / _totalSlots) : 0, cls: 'half' },
        { label: '\u{1F331}', amt: _totalSlots > 0 ? ((_kellyBudget / 8) / _totalSlots) : 0, cls: 'half' },
        { label: '\u{1F4A9}', amt: _totalSlots > 0 ? ((_kellyBudget / 16) / _totalSlots) : 0, cls: 'mud' },
        { label: '\u{1FAA8}', amt: _totalSlots > 0 ? ((_kellyBudget / 32) / _totalSlots) : 0, cls: 'dust' },
        { label: '\u{1F47B}', amt: _totalSlots > 0 ? ((_kellyBudget / 64) / _totalSlots) : 0, cls: 'ghost' },
    ];
    let sizeChips = '';
    const usedSlots = JSON.parse(localStorage.getItem('spx_pokeball_used') || '[false,false,false,false,false,false,false,false,false,false]');
    for (let i = 0; i < 10; i++) {
        const cls = usedSlots[i] ? 'used' : kellySizes[i].cls;
        sizeChips += `<span class="pokemon-size-chip ${cls}" onclick="togglePokeball(${i})" style="cursor:pointer">${ballSvgs[i]}<span class="ball-amt">${kellySizes[i].label} $${kellySizes[i].amt.toFixed(2)}</span></span>`;
    }

    let html = `<div class="pokemon-header">
        <div class="pokemon-level-name">${dcaMode ? 'DCA ' : ''}Lv.${levelIdx} \u2014 ${level.pokemon}</div>
        <img class="pokemon-sprite" src="${POKE_SPRITE(level.pokeId)}" alt="${level.pokemon}">
        <div class="pokemon-pnl ${pnlClass}">P&L: ${pnlStr}${needStr ? ' <span style="color:var(--pumpkin-glow);font-size:0.85rem">&middot; ' + needStr + '</span>' : ''}</div>
        ${tradeTotal >= 5 && kellyF > 0 ? `<div class="pokemon-sizes">${sizeChips}</div>` : ''}
    </div>`;

    // DCA health
    if (dcaMode && dcaTotal > 0) {
        const roiPct = dcaTotal > 0 ? (pnl / dcaTotal * 100) : 0;
        const roiStr = roiPct >= 0 ? '+' + roiPct.toFixed(0) + '%' : roiPct.toFixed(0) + '%';
        let healthLabel, healthClass, healthAdvice;
        if (pnl >= 0) {
            healthLabel = 'EDGE CONFIRMED';
            healthClass = 'healthy';
            healthAdvice = 'System working \u2014 keep DCA\u2019ing';
        } else {
            healthLabel = 'SWITCH TO ORGANIC';
            healthClass = 'danger';
            healthAdvice = 'P&L negative \u2014 flip DCA off, trade at organic level';
        }
        html += `<div class="dca-health">`;
        html += `<div><span class="health-status ${healthClass}">${healthLabel}</span></div>`;
        html += `<div class="health-detail">Deposited: $${dcaTotal.toFixed(2)} &middot; Trading P&L: ${pnlStr}</div>`;
        html += `<div class="health-roi ${roiPct >= 0 ? 'positive' : 'negative'}">ROI: ${roiStr} of deposits earned back</div>`;
        html += `<div style="font-size:0.6rem;margin-top:0.2rem;color:${healthClass === 'healthy' ? 'var(--green-bright)' : 'var(--red-bright)'}">${healthAdvice}</div>`;
        html += `</div>`;
        if (organicIdx !== levelIdx) {
            html += `<div class="dca-organic-label"><img src="${POKE_SPRITE(organicLevel.pokeId)}" alt="${organicLevel.pokemon}"> Organic: Lv.${organicIdx} ${organicLevel.pokemon} ($${pnl.toFixed(2)} P&L)</div>`;
        }
    } else if (dcaMode) {
        html += `<div class="dca-deposit-total">DCA active \u2014 tap Level Up to start</div>`;
    }

    html += `<div class="pokemon-xp-bar">
        <div class="pokemon-xp-track">
            <div class="pokemon-xp-fill" style="width:${xpProgress}%"></div>
        </div>
        <div class="pokemon-xp-labels">
            <span>$${xpFrom.toLocaleString()}</span>
            <span>${xpProgress.toFixed(0)}%</span>
            <span>${nextLevel ? '$' + xpTo.toLocaleString() : 'MAX'}</span>
        </div>
    </div>`;

    if (nextLevel) {
        html += `<div class="pokemon-next-evolve">${level.pokemon} evolves at $${nextLevel.min.toLocaleString()} profit</div>`;
    } else {
        html += `<div class="pokemon-next-evolve">MAX LEVEL \u2014 You are the very best!</div>`;
    }

    // Set location background
    if (level.location && LOCATION_BG[level.location]) {
        box.style.setProperty('--location-bg', `url('${LOCATION_BG[level.location]}')`);
    }

    box.innerHTML = html;
    checkPokemonLevelUp(activePnl);
}

// ====== DCA MODE ======
function toggleDCAMode() {
    dcaMode = !dcaMode;
    localStorage.setItem('spx_dca_mode', dcaMode ? 'true' : 'false');
    updateDCAControls();
    if (window._lastStats) renderPokemon(window._lastStats);
    apiGet(POST_URL + '?action=toggle_dca&mode=' + dcaMode + '&total=' + dcaTotal)
        .then(r => { if (r.ok === false) showToast('DCA mode not saved: ' + writeErr(r)); });
}

function updateDCAControls() {
    const btn = document.getElementById('dcaToggleBtn');
    const lvlBtn = document.getElementById('dcaLevelUpBtn');
    const resetBtn = document.getElementById('dcaResetBtn');
    if (btn) {
        btn.textContent = 'DCA: ' + (dcaMode ? 'ON' : 'OFF');
        btn.classList.toggle('active', dcaMode);
    }
    if (lvlBtn) {
        lvlBtn.style.display = dcaMode ? '' : 'none';
        if (dcaMode && window._lastStats) {
            const pnl = parseDollar(window._lastStats.netPnl);
            const boostedPnl = Math.round((pnl + dcaTotal) * 100) / 100;
            const currentDCALevel = getPokemonLevel(boostedPnl);
            const nextDCALevel = getNextPokemonLevel(currentDCALevel);
            if (nextDCALevel) {
                const gap = Math.max(0, nextDCALevel.min - boostedPnl);
                const nextIdx = POKEMON_LEVELS.indexOf(nextDCALevel) + 1;
                lvlBtn.textContent = 'Level Up \u2192 Lv.' + nextIdx + ' ' + nextDCALevel.pokemon + ' (+$' + gap.toFixed(2) + ')';
                lvlBtn.disabled = false;
            } else {
                lvlBtn.textContent = 'MAX LEVEL';
                lvlBtn.disabled = true;
            }
        }
    }
    if (resetBtn) {
        resetBtn.style.display = dcaTotal > 0 ? '' : 'none';
    }
}

function dcaReset() {
    if (!confirm('Reset DCA to $0? This clears all deposits.')) return;
    dcaTotal = 0;
    localStorage.setItem('spx_dca_total', '0');
    updateDCAControls();
    if (window._lastStats) renderPokemon(window._lastStats);
    apiGet(POST_URL + '?action=toggle_dca&mode=' + dcaMode + '&total=0')
        .then(r => { if (r.ok === false) showToast('DCA reset not saved: ' + writeErr(r)); });
}

function dcaLevelUp() {
    if (!dcaMode || !window._lastStats) return;
    const pnl = parseDollar(window._lastStats.netPnl);
    const boostedPnl = Math.round((pnl + dcaTotal) * 100) / 100;
    const currentDCALevel = getPokemonLevel(boostedPnl);
    const nextDCALevel = getNextPokemonLevel(currentDCALevel);
    if (!nextDCALevel) return;
    const gap = Math.max(0.01, nextDCALevel.min - boostedPnl);
    const nextIdx = POKEMON_LEVELS.indexOf(nextDCALevel) + 1;
    if (!confirm('Add $' + gap.toFixed(2) + ' DCA to reach Lv.' + nextIdx + ' ' + nextDCALevel.pokemon + '?')) return;
    dcaTotal += gap;
    localStorage.setItem('spx_dca_total', dcaTotal.toString());
    updateDCAControls();
    renderPokemon(window._lastStats);
    apiGet(POST_URL + '?action=toggle_dca&mode=' + dcaMode + '&total=' + dcaTotal.toFixed(2))
        .then(r => { if (r.ok === false) showToast('DCA level-up not saved: ' + writeErr(r)); });
}

function updateStockCount(val) {
    stockCount = Math.max(1, Math.min(50, parseInt(val) || 25));
    localStorage.setItem('spx_stock_count', stockCount.toString());
    if (window._lastStats) renderKelly(window._lastStats);
}

// ====== ADD TRADE MODAL ======
async function showAddTradeModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const box = document.createElement('div');
    box.className = 'modal-box';
    box.innerHTML = `
        <div class="modal-msg">Add Manual Trade</div>
        <input id="at-ticker" type="text" placeholder="Ticker (e.g. AAPL)" style="text-transform:uppercase">
        <div style="display:flex;gap:0.5rem;margin-bottom:0.5rem">
            <label style="color:var(--text-dim);font-size:0.75rem;cursor:pointer">
                <input type="radio" name="at-signal" value="buy" checked> Buy
            </label>
            <label style="color:var(--text-dim);font-size:0.75rem;cursor:pointer">
                <input type="radio" name="at-signal" value="sell"> Short
            </label>
        </div>
        <div style="display:flex;gap:0.5rem;margin-bottom:0.5rem">
            <label style="color:var(--text-dim);font-size:0.75rem;cursor:pointer">
                <input type="radio" name="at-outcome" value="TP Hit" checked> TP Hit
            </label>
            <label style="color:var(--text-dim);font-size:0.75rem;cursor:pointer">
                <input type="radio" name="at-outcome" value="Stopped Out"> Stopped Out
            </label>
            <label style="color:var(--text-dim);font-size:0.75rem;cursor:pointer">
                <input type="radio" name="at-outcome" value="Closed"> Closed
            </label>
        </div>
        <input id="at-profit" type="text" placeholder="P&L in $ (e.g. 2.50 or -1.30)">
    `;
    const btns = document.createElement('div');
    btns.className = 'modal-buttons';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'modal-btn-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => overlay.remove();
    const okBtn = document.createElement('button');
    okBtn.className = 'modal-btn-ok';
    okBtn.textContent = 'Add';
    okBtn.onclick = async () => {
        const ticker = box.querySelector('#at-ticker').value.trim().toUpperCase();
        const signal = box.querySelector('input[name="at-signal"]:checked').value;
        const outcome = box.querySelector('input[name="at-outcome"]:checked').value;
        let profit = box.querySelector('#at-profit').value.trim();
        if (!ticker) { showToast('Ticker required'); return; }
        // Stopped Out = loss: force profit negative
        if (outcome === 'Stopped Out' && profit) {
            let v = parseFloat(profit);
            if (!isNaN(v) && v > 0) profit = String(-v);
        }
        overlay.remove();
        const params = new URLSearchParams({
            action: 'add_trade', ticker, signal, outcome,
            profit: profit || '0'
        });
        // add_trade is not idempotent - never re-send it through the beacon fallback
        const r = await apiGet(POST_URL + '?' + params, { beacon: false });
        if (r.ok === false) { showToast('Failed to add trade: ' + writeErr(r), 'error', 8000); return; }
        showToast(`${ticker} ${outcome} added` + (r.verified ? '' : ' (unconfirmed - check the sheet)'), r.verified ? 'success' : 'error');
        scheduleRefresh(1000);
    };
    btns.appendChild(cancelBtn);
    btns.appendChild(okBtn);
    box.appendChild(btns);
    overlay.appendChild(box);
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
    box.querySelector('#at-ticker').focus();
}

// ====== KELLY EDGE OPTIMIZER ======
function togglePokeball(idx) {
    const used = JSON.parse(localStorage.getItem('spx_pokeball_used') || '[false,false,false,false,false,false,false,false,false,false]');
    used[idx] = !used[idx];
    localStorage.setItem('spx_pokeball_used', JSON.stringify(used));
    if (window._lastStats) renderPokemon(window._lastStats);
}

function renderKelly(stats) {
    const box = document.getElementById('kellyBox');
    if (!box) return;

    const wins = parseInt(stats.wins) || 0;
    const losses = parseInt(stats.losses) || 0;
    const total = wins + losses;
    if (total < 5) {
        box.innerHTML = '<div style="text-align:center;color:var(--text-dim);font-size:0.7rem;padding:0.5rem">Need at least 5 completed trades for Kelly calculation</div>';
        return;
    }

    // Parse dollar strings
    const gw = Math.abs(parseDollar(stats.totalProfit));
    const gl = Math.abs(parseDollar(stats.totalLost));
    const pnl = parseDollar(stats.netPnl);
    const activePnl = dcaMode ? pnl + dcaTotal : pnl;

    const wr = wins / total;
    const avgWin = wins > 0 ? gw / wins : 0;
    const avgLoss = losses > 0 ? gl / losses : 0;
    const rr = avgLoss > 0 ? avgWin / avgLoss : 0;
    const ev = avgWin * wr - avgLoss * (1 - wr);
    const profitFactor = gl > 0 ? gw / gl : Infinity;

    // Kelly
    const b = rr;
    const kellyF = b > 0 ? (b * wr - (1 - wr)) / b : 0;
    const halfKelly = kellyF / 2;

    // Per-stock allocation (uncapped half-Kelly, bankroll = deposits + P&L)
    const kellyBankroll = Math.max(0, dcaTotal + pnl); // activePnl already contains dcaTotal in DCA mode - don't add it twice
    const halfKellyDollar = Math.max(0, kellyBankroll * halfKelly);
    const kellyCapped = false;
    const perStock = stockCount > 0 ? halfKellyDollar / stockCount : 0;

    // Pokemon curve sizes at current P&L
    const pokeSizes = getStockSizes(Math.max(0, activePnl));
    const pokeTotal = pokeSizes.reduce((a, c) => a + c, 0);

    // What Pokemon is as % of Kelly
    const pokeVsHalf = halfKellyDollar > 0 ? (pokeTotal / halfKellyDollar) * 100 : 0;

    // Expectancy per $1 risked (avg loss = 1R): wr*b - (1-wr). Unit-free, unlike EV in dollars.
    const edgePerRisk = wr * rr - (1 - wr);

    // Growth rate per trade when betting the half-Kelly fraction of bankroll:
    // g = wr*ln(1 + f*b) + (1-wr)*ln(1 - f). Trades to double = ln2 / g.
    const fHalf = Math.max(0, Math.min(0.99, halfKelly));
    const lnG = fHalf > 0 ? wr * Math.log(1 + fHalf * rr) + (1 - wr) * Math.log(1 - fHalf) : 0;
    const tradesToDouble = lnG > 0 ? Math.ceil(Math.log(2) / lnG) : Infinity;

    // Verdict
    let verdictText, verdictClass;
    if (activePnl <= 0) {
        verdictText = 'BUILD P&L FIRST \u2014 Kelly needs positive bankroll';
        verdictClass = 'hot';
    } else if (kellyF <= 0) {
        verdictText = 'NO EDGE \u2014 Kelly says don\u2019t bet';
        verdictClass = 'hot';
    } else if (perStock >= 1) {
        verdictText = 'EDGE DETECTED \u2014 $' + perStock.toFixed(0) + '/stock across ' + stockCount + ' positions';
        verdictClass = 'optimal';
    } else {
        verdictText = 'THIN EDGE \u2014 bankroll too small for ' + stockCount + ' stocks';
        verdictClass = 'safe';
    }

    // Reliability warning
    let reliabilityNote = '';
    if (total < 50) {
        reliabilityNote = `<div style="font-size:0.55rem;color:#ffa726;text-align:center;margin-top:0.4rem">&#9888; ${total} trades \u2014 Kelly needs 50+ for reliability (Taleb: small samples lie)</div>`;
    } else if (total < 100) {
        reliabilityNote = `<div style="font-size:0.55rem;color:var(--pumpkin-glow);text-align:center;margin-top:0.4rem">${total} trades \u2014 getting reliable. 100+ = strong confidence.</div>`;
    } else {
        reliabilityNote = `<div style="font-size:0.55rem;color:var(--green-bright);text-align:center;margin-top:0.4rem">${total} trades \u2014 statistically reliable edge</div>`;
    }

    box.innerHTML = `
        <div class="kelly-grid">
            <div class="kelly-stat">
                <div class="kval" style="color:var(--green-bright)">${(wr * 100).toFixed(1)}%</div>
                <div class="klbl">Win Rate</div>
            </div>
            <div class="kelly-stat">
                <div class="kval" style="color:${rr >= 1 ? 'var(--green-bright)' : '#ffa726'}">${rr.toFixed(2)}x</div>
                <div class="klbl">Reward/Risk</div>
            </div>
            <div class="kelly-stat">
                <div class="kval" style="color:var(--pumpkin-glow)">${(kellyF * 100).toFixed(1)}%</div>
                <div class="klbl">Kelly f*</div>
            </div>
            <div class="kelly-stat">
                <div class="kval" style="color:var(--green-bright)">${(halfKelly * 100).toFixed(1)}%</div>
                <div class="klbl">Half-Kelly</div>
            </div>
            <div class="kelly-stat">
                <div class="kval" style="color:var(--text-bright)">${profitFactor === Infinity ? '\u221e' : profitFactor.toFixed(2)}x</div>
                <div class="klbl">Profit Factor</div>
            </div>
            <div class="kelly-stat">
                <div class="kval" style="color:${ev > 0 ? 'var(--green-bright)' : 'var(--red-bright)'}">$${ev.toFixed(3)}</div>
                <div class="klbl">EV / Trade</div>
            </div>
            <div class="kelly-stat">
                <div class="kval" style="color:${edgePerRisk > 0 ? 'var(--green-bright)' : 'var(--red-bright)'}">${edgePerRisk >= 0 ? '+' : ''}${edgePerRisk.toFixed(2)}R</div>
                <div class="klbl">EV / $1 risked</div>
            </div>
            <div class="kelly-stat">
                <div class="kval" style="color:var(--cream)">${tradesToDouble < 10000 ? tradesToDouble : '\u221e'}</div>
                <div class="klbl">Trades to 2x (½K)</div>
            </div>
        </div>

        <div style="font-size:0.6rem;color:var(--pumpkin-glow);font-weight:700;margin-bottom:0.4rem;text-transform:uppercase;letter-spacing:1px">Kelly / Stocks</div>

        <div class="kelly-compare">
            <div class="kelly-compare-label">Half-Kelly</div>
            <div class="kelly-bar-track">
                <div class="kelly-bar-fill" style="width:${Math.min(100, halfKelly * 100 / 0.5)}%;background:var(--green-bright)"></div>
            </div>
            <div class="kelly-compare-val" style="color:var(--green-bright)">$${halfKellyDollar.toFixed(0)}</div>
        </div>
        <div class="kelly-compare">
            <div class="kelly-compare-label">Full Kelly</div>
            <div class="kelly-bar-track">
                <div class="kelly-bar-fill" style="width:${Math.min(100, kellyF * 100 / 0.5)}%;background:var(--red-bright);opacity:0.6"></div>
            </div>
            <div class="kelly-compare-val" style="color:var(--red-bright)">$${(kellyBankroll * kellyF).toFixed(0)}</div>
        </div>
        <div class="kelly-compare">
            <div class="kelly-compare-label">Per Stock</div>
            <div class="kelly-bar-track">
                <div class="kelly-bar-fill" style="width:${Math.min(100, activePnl > 0 ? (perStock / Math.max(1, halfKellyDollar)) * 100 : 0)}%;background:var(--pumpkin)"></div>
            </div>
            <div class="kelly-compare-val" style="color:var(--pumpkin-glow)">$${perStock.toFixed(0)}</div>
        </div>
        <div class="kelly-compare">
            <div class="kelly-compare-label" style="color:#ffb74d"><span style="font-size:1.1rem">&#9889;</span> Blended Avg</div>
            <div class="kelly-bar-track">
                <div class="kelly-bar-fill" style="width:${Math.min(100, halfKellyDollar > 0 ? ((pokeTotal + halfKellyDollar) / 2 / halfKellyDollar) * 50 : 0)}%;background:#ffb74d"></div>
            </div>
            <div class="kelly-compare-val" style="color:#ffb74d">$${((pokeTotal + halfKellyDollar) / 2).toFixed(0)}</div>
        </div>
        <div class="kelly-compare">
            <div class="kelly-compare-label" style="color:#90a4ae"><span style="font-size:1.1rem">&#128020;</span> Quarter Kelly</div>
            <div class="kelly-bar-track">
                <div class="kelly-bar-fill" style="width:${Math.min(100, halfKelly * 100 / 1.0)}%;background:#90a4ae;opacity:0.6"></div>
            </div>
            <div class="kelly-compare-val" style="color:#90a4ae">$${(halfKellyDollar / 2).toFixed(0)} <span style="font-size:0.5rem;color:var(--text-dim)">(~$${stockCount > 0 ? (halfKellyDollar / 2 / stockCount).toFixed(0) : 0}/stock)</span></div>
        </div>

        <div style="display:flex;align-items:center;justify-content:center;gap:0.5rem;margin-top:0.6rem;font-size:0.6rem;color:var(--text-dim)">
            <span>Trading</span>
            <input type="number" class="kelly-stock-input" value="${stockCount}" min="1" max="50" onchange="updateStockCount(this.value)">
            <span>stocks \u2192 $${perStock.toFixed(0)} each</span>
        </div>

        <div class="kelly-verdict ${verdictClass}">${verdictText}</div>
        ${''}<!-- kelly cap removed -->
        ${reliabilityNote}
        ${stats.statsStartDate ? `<div style="text-align:center;font-size:0.55rem;color:var(--pumpkin-glow);margin-top:0.3rem">Stats from: <span style="font-weight:700">${stats.statsStartDate}</span> <span onclick="setStatsStart('clear')" style="cursor:pointer;color:var(--text-dim);text-decoration:underline;margin-left:4px">reset</span></div>` : `<div style="text-align:center;font-size:0.55rem;margin-top:0.3rem"><span onclick="promptStatsDate()" style="cursor:pointer;color:var(--text-dim);text-decoration:underline">set stats start date</span></div>`}
    `;
}

// ====== INIT ======
// 1. Paint the last known dashboard immediately (no spinner on a slow connection)
(function renderCachedDashboard() {
    try {
        const cached = JSON.parse(localStorage.getItem(DASH_CACHE_KEY) || 'null');
        if (!cached || !cached.data || Date.now() - cached.ts > 24 * 3600000) return;
        lastGoodData = cached.data;
        renderDashboard(cached.data);
        document.getElementById('statusText').textContent = 'Cached';
        document.getElementById('lastUpdate').textContent = 'Cached ' + new Date(cached.ts).toLocaleTimeString();
        document.getElementById('loading').className = 'loading-overlay hidden';
    } catch (e) { console.warn('Cached dashboard failed to render:', e); }
})();
// 2. Live data, weekly tasks, cross-device state, script version
fetchData();
fetchWeeklyTasks();
setTimeout(() => { pullState(); checkScriptVersion(); }, 1500);

// ====== SERVICE WORKER ======
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js');
}
