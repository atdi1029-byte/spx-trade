// SPX Trade Dashboard - TGA / Net / Global liquidity charts (split out of index.html).
// Self-contained apart from POST_URL, which app.js defines; keep this tag after app.js.
// ====== TGA LIQUIDITY ======
const LIQ_API = 'https://script.google.com/macros/s/AKfycbwVwBpJsq5kybfAuo8DpvODludwPehRWeT81bRe1PftdSuYCXv90FnewvIsZtCZIUv6Cg/exec?action=liquidity';
let liqCache = null;

async function fetchLiquidity() {
    try {
        const resp = await fetch(LIQ_API + '&t=' + Date.now());
        const data = await resp.json();
        if (data.status === 'ok' && data.metrics) {
            liqCache = data;
            localStorage.setItem('liqCache', JSON.stringify(data));
            renderLiquidity(data);
        }
    } catch (err) {
        console.error('Liquidity fetch error:', err);
        // Fall back to cache
        try {
            const cached = JSON.parse(localStorage.getItem('liqCache') || 'null');
            if (cached) renderLiquidity(cached);
        } catch(e) {}
    }
}

function renderLiquidity(data) {
    const m = data.metrics;
    const series = data.series || [];
    if (!m) return;

    // Balance
    const balEl = document.getElementById('liquidityBalance');
    balEl.textContent = m.currentBalanceFormatted || '--';
    balEl.className = 'liquidity-balance ' + (m.signal || '');

    // Date
    document.getElementById('liquidityDate').textContent = m.currentDate ? 'As of ' + m.currentDate : '';

    // Zone badge + tooltip
    const ZONE_TIPS = {
        'FLOOD':  'TGA nearly empty (<$200B). Treasury is spending heavily — max liquidity flowing into markets. Historically very bullish for stocks.',
        'LOW':    'TGA below average ($200-400B). Treasury spending down reserves — liquidity entering the system. Generally bullish.',
        'NORMAL': 'TGA at typical levels ($400-600B). Neutral — neither adding nor draining significant liquidity.',
        'HIGH':   'TGA above average ($600-800B). Treasury building reserves — absorbing cash from markets. Mild headwind for stocks.',
        'DRAIN':  'TGA very high (>$800B). Treasury hoarding cash — major liquidity drain from markets. Historically bearish for stocks. Watch for reversals when spending resumes.'
    };
    const zoneEl = document.getElementById('liquidityZone');
    const tipEl = document.getElementById('zoneTip');
    zoneEl.textContent = m.zone || '--';
    zoneEl.appendChild(tipEl);
    zoneEl.className = 'liquidity-zone ' + (m.zoneColor || 'gray');
    tipEl.textContent = ZONE_TIPS[m.zone] || '';

    // Signal badge + tooltip
    const sigEl = document.getElementById('liquiditySignalBadge');
    const sigTip = document.getElementById('signalTip');
    if (m.signal === 'bullish') {
        sigEl.textContent = 'TAILWIND';
        sigEl.appendChild(sigTip);
        sigEl.className = 'liquidity-signal-badge bullish';
        sigTip.textContent = '7d SMA below 30d SMA — TGA trending down. Money leaving Treasury and entering the economy. Bullish for stocks.';
    } else if (m.signal === 'bearish') {
        sigEl.textContent = 'HEADWIND';
        sigEl.appendChild(sigTip);
        sigEl.className = 'liquidity-signal-badge bearish';
        sigTip.textContent = '7d SMA above 30d SMA — TGA trending up. Money leaving markets and entering Treasury. Bearish for stocks.';
    } else {
        sigEl.textContent = '';
        sigEl.appendChild(sigTip);
        sigEl.className = 'liquidity-signal-badge';
        sigTip.textContent = '';
    }

    // Inverted colors: TGA down = green (bullish), TGA up = red (bearish)
    const c7 = document.getElementById('liqChange7d');
    c7.textContent = m.change7dFormatted || '--';
    c7.className = 'value ' + (m.change7d <= 0 ? 'up' : 'down');

    const c30 = document.getElementById('liqChange30d');
    c30.textContent = m.change30dFormatted || '--';
    c30.className = 'value ' + (m.change30d <= 0 ? 'up' : 'down');

    const p7 = document.getElementById('liqPct7d');
    p7.textContent = m.pct7d || '--';
    p7.className = 'value ' + (m.change7d <= 0 ? 'up' : 'down');

    const p30 = document.getElementById('liqPct30d');
    p30.textContent = m.pct30d || '--';
    p30.className = 'value ' + (m.change30d <= 0 ? 'up' : 'down');

    // Insight — build contextual note with magnitude
    const insightEl = document.getElementById('liquidityInsight');
    const abs7d = Math.abs(m.change7d || 0);
    const abs30d = Math.abs(m.change30d || 0);
    const bal = m.currentBalance || 0;

    // Magnitude labels for weekly change
    let mag = '';
    if (abs7d < 10000) mag = 'Small move';
    else if (abs7d < 30000) mag = 'Normal move';
    else if (abs7d < 60000) mag = 'Large move';
    else if (abs7d < 100000) mag = 'Very large move';
    else mag = 'Massive move';

    // Zone context
    let zoneNote = '';
    if (bal < 200000) zoneNote = 'Treasury nearly empty — max liquidity injection, historically very bullish.';
    else if (bal < 400000) zoneNote = 'Treasury spending down — liquidity flowing into markets.';
    else if (bal < 600000) zoneNote = 'Treasury at normal levels — neutral for markets.';
    else if (bal < 800000) zoneNote = 'Treasury building reserves — mild liquidity drag on markets.';
    else zoneNote = 'Treasury hoarding cash — significant liquidity drain, watch for market headwinds.';

    // Direction context
    let dirNote = '';
    if (m.change7d <= -60000) dirNote = 'Rapid spending — strong tailwind. This pace usually doesn\'t last long.';
    else if (m.change7d <= -30000) dirNote = 'Steady outflow — solid tailwind for risk assets.';
    else if (m.change7d <= -10000) dirNote = 'Mild outflow — slight positive for markets.';
    else if (m.change7d <= 10000) dirNote = 'Roughly flat — liquidity neutral this week.';
    else if (m.change7d <= 30000) dirNote = 'Building up — mild headwind for risk assets.';
    else if (m.change7d <= 60000) dirNote = 'Significant accumulation — notable drag on liquidity.';
    else dirNote = 'Massive buildup — tax season or debt issuance likely. Strong headwind.';

    insightEl.innerHTML = '<b>' + mag + ':</b> ' + dirNote + '<br>' + zoneNote;

    // Draw chart
    drawLiquidityChart(series, m);
}

function calcSMA(series, period) {
    const sma = [];
    for (let i = 0; i < series.length; i++) {
        if (i < period - 1) { sma.push(null); continue; }
        let sum = 0;
        for (let j = i - period + 1; j <= i; j++) sum += series[j].balance;
        sma.push(sum / period);
    }
    return sma;
}

function drawLiquidityChart(series, metrics, skipSave) {
    const canvas = document.getElementById('liquidityChart');
    if (!canvas || series.length < 2) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const pad = { top: 10, right: 50, bottom: 20, left: 50 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    // Compute rolling SMAs on FULL series, then trim to last 90 for display
    // (extra data before the 90-day window is just SMA warmup)
    const fullSma7 = calcSMA(series, 5);
    const fullSma30 = calcSMA(series, 22);
    const fullSeries = series;
    const trimAt = Math.max(0, series.length - 90);
    const sma7 = fullSma7.slice(trimAt);
    const sma30 = fullSma30.slice(trimAt);
    series = series.slice(trimAt);

    // Get all values for min/max (include SMAs)
    const allVals = [];
    series.forEach(d => allVals.push(d.balance));
    sma7.forEach(v => { if (v !== null) allVals.push(v); });
    sma30.forEach(v => { if (v !== null) allVals.push(v); });
    const minVal = Math.min.apply(null, allVals) * 0.98;
    const maxVal = Math.max.apply(null, allVals) * 1.02;
    const range = maxVal - minVal || 1;

    const toY = v => pad.top + plotH * (1 - (v - minVal) / range);
    const toX = i => pad.left + (i / (series.length - 1)) * plotW;

    // Save state for hover tooltip
    if (!skipSave) {
        liqChartState = { series, sma7, sma30, minVal, range, pad, w, h, plotW, plotH, rawSeries: fullSeries, metrics };
    }

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = 'rgba(58,53,48,0.4)';
    ctx.lineWidth = 0.5;
    for (let g = 0; g <= 3; g++) {
        const gy = pad.top + plotH * (1 - g / 3);
        ctx.beginPath();
        ctx.moveTo(pad.left, gy);
        ctx.lineTo(w - pad.right, gy);
        ctx.stroke();
        const gVal = minVal + range * (g / 3);
        ctx.fillStyle = 'rgba(138,126,106,0.6)';
        ctx.font = '9px "Space Mono", monospace';
        ctx.textAlign = 'right';
        ctx.fillText(formatBillions(gVal), pad.left - 4, gy + 3);
    }

    // Raw data as subtle area fill
    const gradient = ctx.createLinearGradient(0, pad.top, 0, h - pad.bottom);
    gradient.addColorStop(0, 'rgba(138,126,106,0.12)');
    gradient.addColorStop(1, 'rgba(138,126,106,0.02)');
    ctx.beginPath();
    for (let i = 0; i < series.length; i++) {
        const x = toX(i), y = toY(series[i].balance);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.lineTo(toX(series.length - 1), h - pad.bottom);
    ctx.lineTo(pad.left, h - pad.bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Raw data as thin line
    ctx.beginPath();
    for (let i = 0; i < series.length; i++) {
        const x = toX(i), y = toY(series[i].balance);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(138,126,106,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 7d SMA line (red = current pace, solid)
    ctx.beginPath();
    let started7 = false;
    for (let i = 0; i < sma7.length; i++) {
        if (sma7[i] === null) continue;
        const x = toX(i), y = toY(sma7[i]);
        if (!started7) { ctx.moveTo(x, y); started7 = true; }
        else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#e05545';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 30d SMA line (green = baseline, dashed)
    ctx.beginPath();
    let started30 = false;
    for (let i = 0; i < sma30.length; i++) {
        if (sma30[i] === null) continue;
        const x = toX(i), y = toY(sma30[i]);
        if (!started30) { ctx.moveTo(x, y); started30 = true; }
        else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#6aaa5a';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // End dots
    const last7 = sma7[sma7.length - 1];
    const last30 = sma30[sma30.length - 1];
    if (last7 !== null) {
        ctx.beginPath();
        ctx.arc(toX(series.length - 1), toY(last7), 3, 0, Math.PI * 2);
        ctx.fillStyle = '#e05545';
        ctx.fill();
    }
    if (last30 !== null) {
        ctx.beginPath();
        ctx.arc(toX(series.length - 1), toY(last30), 3, 0, Math.PI * 2);
        ctx.fillStyle = '#6aaa5a';
        ctx.fill();
    }

    // Legend (right side)
    ctx.font = '8px "Space Mono", monospace';
    ctx.textAlign = 'left';
    const legX = w - pad.right + 6;
    if (last7 !== null) {
        ctx.fillStyle = '#e05545';
        ctx.fillText('7d', legX, toY(last7) + 3);
    }
    if (last30 !== null) {
        ctx.fillStyle = '#6aaa5a';
        ctx.fillText('30d', legX, toY(last30) + 3);
    }

    // X-axis date labels (first, middle, last)
    ctx.fillStyle = 'rgba(138,126,106,0.6)';
    ctx.font = '8px "Space Mono", monospace';
    if (series.length > 0) {
        const fmtDate = d => d.slice(5); // MM-DD
        ctx.textAlign = 'left';
        ctx.fillText(fmtDate(series[0].date), pad.left, h - 4);
        ctx.textAlign = 'center';
        const midIdx = Math.floor(series.length / 2);
        ctx.fillText(fmtDate(series[midIdx].date), pad.left + plotW / 2, h - 4);
        ctx.textAlign = 'right';
        ctx.fillText(fmtDate(series[series.length - 1].date), w - pad.right, h - 4);
    }
}

function formatBillions(millions) {
    if (Math.abs(millions) >= 1000) return (millions / 1000).toFixed(1) + 'B';
    return millions.toFixed(0) + 'M';
}

// Store chart state for hover tooltip
let liqChartState = null;

// Crosshair tooltip on hover
const liqCanvas = document.getElementById('liquidityChart');
if (liqCanvas) {
    liqCanvas.addEventListener('mousemove', function(e) {
        if (!liqChartState) return;
        const { series, sma7, sma30, minVal, range, pad, w, h, plotW, plotH } = liqChartState;
        const rect = liqCanvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;

        // Find nearest data index
        const idx = Math.round((mx - pad.left) / plotW * (series.length - 1));
        if (idx < 0 || idx >= series.length) return;

        // Redraw chart then overlay crosshair
        drawLiquidityChart(liqChartState.rawSeries, liqChartState.metrics, true);

        const dpr = window.devicePixelRatio || 1;
        const ctx = liqCanvas.getContext('2d');
        ctx.save();
        // No ctx.scale here — drawLiquidityChart already set the scale

        const x = pad.left + (idx / (series.length - 1)) * plotW;
        const y = pad.top + plotH * (1 - (series[idx].balance - minVal) / range);

        // Vertical crosshair line
        ctx.strokeStyle = 'rgba(232,160,76,0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x, pad.top);
        ctx.lineTo(x, h - pad.bottom);
        ctx.stroke();
        ctx.setLineDash([]);

        // Dot on the data point
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#e8a04c';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Tooltip box
        const date = series[idx].date;
        const bal = formatBillions(series[idx].balance);
        const s7 = sma7[idx] !== null ? formatBillions(sma7[idx]) : '--';
        const s30 = sma30[idx] !== null ? formatBillions(sma30[idx]) : '--';
        const label = date + '  $' + bal;
        const label2 = '7d: $' + s7 + '  30d: $' + s30;

        ctx.font = '9px "Space Mono", monospace';
        const tw1 = ctx.measureText(label).width;
        const tw2 = ctx.measureText(label2).width;
        const tw = Math.max(tw1, tw2);
        const boxW = tw + 12;
        const boxH = 32;
        let bx = x - boxW / 2;
        if (bx < pad.left) bx = pad.left;
        if (bx + boxW > w - pad.right) bx = w - pad.right - boxW;
        let by = y - boxH - 10;
        if (by < 2) by = y + 10;  // flip below dot when near top

        ctx.fillStyle = 'rgba(18,16,14,0.9)';
        ctx.strokeStyle = 'rgba(232,160,76,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(bx, by, boxW, boxH, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#f0e6cc';
        ctx.textAlign = 'left';
        ctx.fillText(label, bx + 6, by + 13);
        ctx.fillStyle = '#e05545';
        ctx.fillText('7d: $' + s7, bx + 6, by + 25);
        ctx.fillStyle = '#6aaa5a';
        const s7w = ctx.measureText('7d: $' + s7 + '  ').width;
        ctx.fillText('30d: $' + s30, bx + 6 + s7w, by + 25);

        ctx.restore();
    });

    liqCanvas.addEventListener('mouseleave', function() {
        if (liqChartState) drawLiquidityChart(liqChartState.rawSeries, liqChartState.metrics, true);
    });
}

// Fetch liquidity on load and every 5 minutes
fetchLiquidity();
setInterval(fetchLiquidity, 300000);

// ====== NET LIQUIDITY (WALCL - TGA - RRP) + SPX OVERLAY ======
const NETLIQ_API = POST_URL + '?action=net_liquidity';
let netLiqCache = null;

async function fetchNetLiquidity() {
    try {
        const resp = await fetch(NETLIQ_API + '&t=' + Date.now());
        const data = await resp.json();
        if (data.status === 'ok' && data.metrics) {
            netLiqCache = data;
            localStorage.setItem('netLiqCache', JSON.stringify(data));
            renderNetLiquidity(data);
        }
    } catch (err) {
        console.error('Net Liquidity fetch error:', err);
        try {
            const cached = JSON.parse(localStorage.getItem('netLiqCache') || 'null');
            if (cached) renderNetLiquidity(cached);
        } catch(e) {}
    }
}

function renderNetLiquidity(data) {
    const m = data.metrics;
    const series = data.series || [];
    if (!m) return;

    const valEl = document.getElementById('netLiqValue');
    valEl.textContent = m.currentNetLiqFormatted || '--';
    valEl.className = 'netliq-value ' + (m.change30d >= 0 ? 'up' : 'down');

    document.getElementById('netLiqDate').textContent = m.currentDate ? 'As of ' + m.currentDate : '';
    document.getElementById('netLiqSpx').textContent = m.currentSpx ? m.currentSpx.toLocaleString() : '--';

    document.getElementById('netLiqWalcl').textContent = '$' + formatBillions(m.walcl || 0);
    document.getElementById('netLiqTga').textContent = '$' + formatBillions(m.tga || 0);
    document.getElementById('netLiqRrp').textContent = '$' + formatBillions(m.rrp || 0);

    const c30 = document.getElementById('netLiqChange30d');
    c30.textContent = m.change30dFormatted || '--';
    c30.className = 'value ' + (m.change30d >= 0 ? 'up' : 'down');

    const c90 = document.getElementById('netLiqChange90d');
    c90.textContent = m.change90dFormatted || '--';
    c90.className = 'value ' + (m.change90d >= 0 ? 'up' : 'down');

    // Correlation badge + tooltip
    const corrEl = document.getElementById('netLiqCorrelation');
    const corrTip = document.getElementById('corrTip');
    if (m.correlation === 'aligned') {
        corrEl.textContent = 'ALIGNED';
        corrEl.appendChild(corrTip);
        corrEl.className = 'netliq-correlation aligned';
        corrTip.textContent = 'Net Liquidity and SPX moving in the same direction over 30 days. Liquidity is driving the market as expected.';
    } else {
        corrEl.textContent = 'DIVERGENT';
        corrEl.appendChild(corrTip);
        corrEl.className = 'netliq-correlation divergent';
        corrTip.textContent = 'Net Liquidity and SPX moving in opposite directions. Potential inflection point — watch for mean reversion.';
    }

    // Insight — dynamic context + cheat sheet
    const insightEl = document.getElementById('netLiqInsight');
    const liqDir = m.change30d >= 0 ? 'rising' : 'falling';
    const spxDir = (m.currentSpx - (netLiqCache && netLiqCache.series ? netLiqCache.series[Math.max(0, netLiqCache.series.length - 22)] : {}).spx || 0) >= 0 ? 'rising' : 'falling';
    let regime = '';
    if (liqDir === 'rising' && m.correlation === 'aligned') regime = 'Both rising + ALIGNED = full bull mode.';
    else if (liqDir === 'rising' && m.correlation === 'divergent') regime = 'Liquidity rising + SPX falling = potential buying opportunity.';
    else if (liqDir === 'falling' && m.correlation === 'aligned') regime = 'Both falling + ALIGNED = risk-off, be cautious.';
    else regime = 'Liquidity falling + SPX rising = rally may not be sustainable.';
    insightEl.textContent = regime;

    drawNetLiqChart(series, m);
}

let netLiqChartState = null;

function drawNetLiqChart(fullSeries, metrics, skipSave) {
    const canvas = document.getElementById('netLiqChart');
    if (!canvas || fullSeries.length < 2) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const pad = { top: 10, right: 55, bottom: 20, left: 55 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    // Trim to last 85 business days (~4 months), 22 on mobile (~1 month)
    const isMobile = window.innerWidth <= 900;
    const trimDays = isMobile ? 22 : 85;
    const trimAt = Math.max(0, fullSeries.length - trimDays);
    const series = fullSeries.slice(trimAt);

    // Left axis: Net Liquidity
    const liqVals = series.map(d => d.netLiq);
    const liqMin = Math.min(...liqVals) * 0.999;
    const liqMax = Math.max(...liqVals) * 1.001;
    const liqRange = liqMax - liqMin || 1;

    // Right axis: SPX
    const spxVals = series.map(d => d.spx);
    const spxMin = Math.min(...spxVals) * 0.998;
    const spxMax = Math.max(...spxVals) * 1.002;
    const spxRange = spxMax - spxMin || 1;

    const toY_liq = v => pad.top + plotH * (1 - (v - liqMin) / liqRange);
    const toY_spx = v => pad.top + plotH * (1 - (v - spxMin) / spxRange);
    const toX = i => pad.left + (i / (series.length - 1)) * plotW;

    if (!skipSave) {
        netLiqChartState = { series, liqMin, liqRange, spxMin, spxRange, pad, w, h, plotW, plotH, rawSeries: fullSeries, metrics };
    }

    ctx.clearRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = 'rgba(58,53,48,0.4)';
    ctx.lineWidth = 0.5;
    for (let g = 0; g <= 3; g++) {
        const gy = pad.top + plotH * (1 - g / 3);
        ctx.beginPath();
        ctx.moveTo(pad.left, gy);
        ctx.lineTo(w - pad.right, gy);
        ctx.stroke();

        // Left axis labels (Net Liquidity in trillions)
        const lVal = liqMin + liqRange * (g / 3);
        ctx.fillStyle = 'rgba(212,132,62,0.6)';
        ctx.font = '9px "Space Mono", monospace';
        ctx.textAlign = 'right';
        ctx.fillText((lVal / 1000000).toFixed(1) + 'T', pad.left - 4, gy + 3);

        // Right axis labels (SPX)
        const sVal = spxMin + spxRange * (g / 3);
        ctx.fillStyle = 'rgba(106,170,90,0.6)';
        ctx.textAlign = 'left';
        ctx.fillText(Math.round(sVal).toLocaleString(), w - pad.right + 4, gy + 3);
    }

    // Net Liquidity area fill
    const liqGrad = ctx.createLinearGradient(0, pad.top, 0, h - pad.bottom);
    liqGrad.addColorStop(0, 'rgba(212,132,62,0.15)');
    liqGrad.addColorStop(1, 'rgba(212,132,62,0.02)');
    ctx.beginPath();
    for (let i = 0; i < series.length; i++) {
        const x = toX(i), y = toY_liq(series[i].netLiq);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.lineTo(toX(series.length - 1), h - pad.bottom);
    ctx.lineTo(pad.left, h - pad.bottom);
    ctx.closePath();
    ctx.fillStyle = liqGrad;
    ctx.fill();

    // Net Liquidity line (pumpkin)
    ctx.beginPath();
    for (let i = 0; i < series.length; i++) {
        const x = toX(i), y = toY_liq(series[i].netLiq);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#d4843e';
    ctx.lineWidth = 2;
    ctx.stroke();

    // SPX line (green)
    ctx.beginPath();
    for (let i = 0; i < series.length; i++) {
        const x = toX(i), y = toY_spx(series[i].spx);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#6aaa5a';
    ctx.lineWidth = 2;
    ctx.stroke();

    // End dots
    const lastIdx = series.length - 1;
    ctx.beginPath();
    ctx.arc(toX(lastIdx), toY_liq(series[lastIdx].netLiq), 3, 0, Math.PI * 2);
    ctx.fillStyle = '#d4843e';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(toX(lastIdx), toY_spx(series[lastIdx].spx), 3, 0, Math.PI * 2);
    ctx.fillStyle = '#6aaa5a';
    ctx.fill();

    // X-axis date labels
    ctx.fillStyle = 'rgba(138,126,106,0.6)';
    ctx.font = '8px "Space Mono", monospace';
    if (series.length > 0) {
        const fmtDate = d => d.slice(5);
        ctx.textAlign = 'left';
        ctx.fillText(fmtDate(series[0].date), pad.left, h - 4);
        ctx.textAlign = 'center';
        ctx.fillText(fmtDate(series[Math.floor(series.length / 2)].date), pad.left + plotW / 2, h - 4);
        ctx.textAlign = 'right';
        ctx.fillText(fmtDate(series[lastIdx].date), w - pad.right, h - 4);
    }
}

// Hover tooltip for Net Liquidity chart
const netLiqCanvas = document.getElementById('netLiqChart');
if (netLiqCanvas) {
    netLiqCanvas.addEventListener('mousemove', function(e) {
        if (!netLiqChartState) return;
        const { series, liqMin, liqRange, spxMin, spxRange, pad, w, h, plotW, plotH } = netLiqChartState;
        const rect = netLiqCanvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;

        const idx = Math.round((mx - pad.left) / plotW * (series.length - 1));
        if (idx < 0 || idx >= series.length) return;

        drawNetLiqChart(netLiqChartState.rawSeries, netLiqChartState.metrics, true);

        const ctx = netLiqCanvas.getContext('2d');
        ctx.save();
        // No ctx.scale here — drawNetLiqChart already set the scale

        const toX = i => pad.left + (i / (series.length - 1)) * plotW;
        const toY_liq = v => pad.top + plotH * (1 - (v - liqMin) / liqRange);
        const toY_spx = v => pad.top + plotH * (1 - (v - spxMin) / spxRange);
        const x = toX(idx);
        const yLiq = toY_liq(series[idx].netLiq);
        const ySpx = toY_spx(series[idx].spx);

        // Crosshair
        ctx.strokeStyle = 'rgba(232,160,76,0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x, pad.top);
        ctx.lineTo(x, h - pad.bottom);
        ctx.stroke();
        ctx.setLineDash([]);

        // Dots
        ctx.beginPath();
        ctx.arc(x, yLiq, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#d4843e';
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(x, ySpx, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#6aaa5a';
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Tooltip box (compact)
        const date = series[idx].date.slice(5);
        const liqVal = '$' + (series[idx].netLiq / 1000000).toFixed(2) + 'T';
        const spxVal = Math.round(series[idx].spx).toLocaleString();
        const tipText = date + '  ' + liqVal + '  ' + spxVal;

        ctx.font = '8px "Space Mono", monospace';
        const tw = ctx.measureText(tipText).width;
        const boxW = tw + 12;
        const boxH = 18;
        let bx = x - boxW / 2;
        if (bx < pad.left) bx = pad.left;
        if (bx + boxW > w - pad.right) bx = w - pad.right - boxW;
        let by = Math.min(yLiq, ySpx) - boxH - 8;
        if (by < 2) by = Math.max(yLiq, ySpx) + 8;

        ctx.fillStyle = 'rgba(18,16,14,0.92)';
        ctx.strokeStyle = 'rgba(232,160,76,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(bx, by, boxW, boxH, 3);
        ctx.fill();
        ctx.stroke();

        ctx.textAlign = 'left';
        ctx.fillStyle = '#f0e6cc';
        ctx.fillText(tipText, bx + 6, by + 12);

        ctx.restore();
    });

    netLiqCanvas.addEventListener('mouseleave', function() {
        if (netLiqChartState) drawNetLiqChart(netLiqChartState.rawSeries, netLiqChartState.metrics, true);
    });
}

// Fetch net liquidity (staggered 2s after TGA)
setTimeout(fetchNetLiquidity, 2000);
setInterval(fetchNetLiquidity, 300000);

// ====== GLOBAL LIQUIDITY INDEX (Fed + ECB + BOJ) + SPX OVERLAY ======
const GLOBLIQ_API = POST_URL + '?action=global_liquidity';
let globLiqCache = null;

async function fetchGlobalLiquidity() {
    try {
        const resp = await fetch(GLOBLIQ_API + '&t=' + Date.now());
        const data = await resp.json();
        if (data.status === 'ok' && data.metrics) {
            globLiqCache = data;
            localStorage.setItem('globLiqCache', JSON.stringify(data));
            renderGlobalLiquidity(data);
        }
    } catch (err) {
        console.error('Global Liquidity fetch error:', err);
        try {
            const cached = JSON.parse(
                localStorage.getItem('globLiqCache') || 'null'
            );
            if (cached) renderGlobalLiquidity(cached);
        } catch(e) {}
    }
}

function renderGlobalLiquidity(data) {
    const m = data.metrics;
    const series = data.series || [];
    if (!m) return;

    // Main value
    const valEl = document.getElementById('globLiqValue');
    valEl.textContent = m.currentGlobalLiqFormatted || '--';
    valEl.className = 'globliq-value ' +
        (m.change30d >= 0 ? 'up' : 'down');

    // Date + SPX
    document.getElementById('globLiqDate').textContent =
        m.currentDate ? 'As of ' + m.currentDate : '';
    document.getElementById('globLiqSpx').textContent =
        m.currentSpx ? m.currentSpx.toLocaleString() : '--';

    // Component breakdown
    document.getElementById('globLiqFed').textContent =
        '$' + formatBillions(m.fed || 0);
    document.getElementById('globLiqEcb').textContent =
        '$' + formatBillions(m.ecb || 0);
    document.getElementById('globLiqBoj').textContent =
        '$' + formatBillions(m.boj || 0);

    // Changes
    const c30 = document.getElementById('globLiqChange30d');
    c30.textContent = m.change30dFormatted || '--';
    c30.className = 'value ' + (m.change30d >= 0 ? 'up' : 'down');

    const c90 = document.getElementById('globLiqChange90d');
    c90.textContent = m.change90dFormatted || '--';
    c90.className = 'value ' + (m.change90d >= 0 ? 'up' : 'down');

    const p30 = document.getElementById('globLiqPct30d');
    p30.textContent = m.pct30d || '--';
    p30.className = 'value ' + (m.change30d >= 0 ? 'up' : 'down');

    const p90 = document.getElementById('globLiqPct90d');
    p90.textContent = m.pct90d || '--';
    p90.className = 'value ' + (m.change90d >= 0 ? 'up' : 'down');

    // Regime badge + tooltip
    const REGIME_TIPS = {
        'EXPANSION': 'Global central banks expanding balance sheets rapidly (>3% in 90 days). Historically very bullish for risk assets. Per Capital Wars, this is the strongest tailwind for equities.',
        'GROWING': 'Central banks slowly expanding (1-3% in 90 days). Mild tailwind — liquidity supportive but not surging.',
        'STABLE': 'Global liquidity roughly flat (-1% to +1%). Neutral regime — other factors will drive markets.',
        'TIGHTENING': 'Central banks reducing balance sheets (-1% to -3% in 90 days). Mild headwind — liquidity slowly draining.',
        'CONTRACTION': 'Central banks aggressively tightening (>3% decline in 90 days). Major headwind for risk assets. Historically correlates with corrections.'
    };
    const regEl = document.getElementById('globLiqRegime');
    const regTip = document.getElementById('regimeTip');
    regEl.textContent = m.regime || '--';
    regEl.appendChild(regTip);
    regEl.className = 'globliq-regime ' + (m.regimeColor || 'gray');
    regTip.textContent = REGIME_TIPS[m.regime] || '';

    // Correlation badge
    const corrEl = document.getElementById('globLiqCorrelation');
    const corrTip = document.getElementById('globCorrTip');
    if (m.correlation === 'aligned') {
        corrEl.textContent = 'ALIGNED';
        corrEl.appendChild(corrTip);
        corrEl.className = 'globliq-correlation aligned';
        corrTip.textContent = 'Global Liquidity and SPX moving in the same direction over 30 days. Capital flows driving the market as Capital Wars predicts.';
    } else {
        corrEl.textContent = 'DIVERGENT';
        corrEl.appendChild(corrTip);
        corrEl.className = 'globliq-correlation divergent';
        corrTip.textContent = 'Global Liquidity and SPX moving in opposite directions. Potential inflection point — Howell says liquidity usually wins.';
    }

    // Insight
    const insightEl = document.getElementById('globLiqInsight');
    const liqDir = m.change30d >= 0 ? 'rising' : 'falling';
    let insight = '';
    if (m.regime === 'EXPANSION' && m.correlation === 'aligned')
        insight = 'Full expansion + aligned = strongest bull regime. Central banks are flooding the system.';
    else if (m.regime === 'EXPANSION' && m.correlation === 'divergent')
        insight = 'Global liquidity surging but SPX lagging — potential catch-up trade ahead.';
    else if (m.regime === 'CONTRACTION' && m.correlation === 'aligned')
        insight = 'Contraction + aligned = risk-off. Central banks draining liquidity, markets following.';
    else if (m.regime === 'CONTRACTION' && m.correlation === 'divergent')
        insight = 'Liquidity contracting but SPX rising — rally may not be sustainable without central bank support.';
    else if (liqDir === 'rising')
        insight = 'Global liquidity trending up — supportive backdrop for risk assets.';
    else
        insight = 'Global liquidity trending down — watch for headwinds to equity markets.';
    insightEl.textContent = insight;

    drawGlobLiqChart(series, m);
}

let globLiqChartState = null;

function drawGlobLiqChart(fullSeries, metrics, skipSave) {
    const canvas = document.getElementById('globLiqChart');
    if (!canvas || fullSeries.length < 2) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const pad = { top: 10, right: 55, bottom: 20, left: 55 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    const isMobile = window.innerWidth <= 900;
    const trimDays = isMobile ? 22 : 85;
    const trimAt = Math.max(0, fullSeries.length - trimDays);
    const series = fullSeries.slice(trimAt);

    // Left axis: Global Liquidity
    const liqVals = series.map(d => d.globalLiq);
    const liqMin = Math.min(...liqVals) * 0.999;
    const liqMax = Math.max(...liqVals) * 1.001;
    const liqRange = liqMax - liqMin || 1;

    // Right axis: SPX
    const spxVals = series.map(d => d.spx);
    const spxMin = Math.min(...spxVals) * 0.998;
    const spxMax = Math.max(...spxVals) * 1.002;
    const spxRange = spxMax - spxMin || 1;

    const toY_liq = v =>
        pad.top + plotH * (1 - (v - liqMin) / liqRange);
    const toY_spx = v =>
        pad.top + plotH * (1 - (v - spxMin) / spxRange);
    const toX = i =>
        pad.left + (i / (series.length - 1)) * plotW;

    if (!skipSave) {
        globLiqChartState = {
            series, liqMin, liqRange, spxMin, spxRange,
            pad, w, h, plotW, plotH,
            rawSeries: fullSeries, metrics
        };
    }

    ctx.clearRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = 'rgba(58,53,48,0.4)';
    ctx.lineWidth = 0.5;
    for (let g = 0; g <= 3; g++) {
        const gy = pad.top + plotH * (1 - g / 3);
        ctx.beginPath();
        ctx.moveTo(pad.left, gy);
        ctx.lineTo(w - pad.right, gy);
        ctx.stroke();

        // Left axis labels (Global Liq in trillions)
        const lVal = liqMin + liqRange * (g / 3);
        ctx.fillStyle = 'rgba(176,108,200,0.6)';
        ctx.font = '9px "Space Mono", monospace';
        ctx.textAlign = 'right';
        ctx.fillText(
            (lVal / 1000000).toFixed(1) + 'T',
            pad.left - 4, gy + 3
        );

        // Right axis labels (SPX)
        const sVal = spxMin + spxRange * (g / 3);
        ctx.fillStyle = 'rgba(106,170,90,0.6)';
        ctx.textAlign = 'left';
        ctx.fillText(
            Math.round(sVal).toLocaleString(),
            w - pad.right + 4, gy + 3
        );
    }

    // Global Liquidity area fill (purple tint)
    const liqGrad = ctx.createLinearGradient(
        0, pad.top, 0, h - pad.bottom
    );
    liqGrad.addColorStop(0, 'rgba(176,108,200,0.15)');
    liqGrad.addColorStop(1, 'rgba(176,108,200,0.02)');
    ctx.beginPath();
    for (let i = 0; i < series.length; i++) {
        const x = toX(i), y = toY_liq(series[i].globalLiq);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.lineTo(toX(series.length - 1), h - pad.bottom);
    ctx.lineTo(pad.left, h - pad.bottom);
    ctx.closePath();
    ctx.fillStyle = liqGrad;
    ctx.fill();

    // Global Liquidity line (purple)
    ctx.beginPath();
    for (let i = 0; i < series.length; i++) {
        const x = toX(i), y = toY_liq(series[i].globalLiq);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#b06cc8';
    ctx.lineWidth = 2;
    ctx.stroke();

    // SPX line (green)
    ctx.beginPath();
    for (let i = 0; i < series.length; i++) {
        const x = toX(i), y = toY_spx(series[i].spx);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#6aaa5a';
    ctx.lineWidth = 2;
    ctx.stroke();

    // End dots
    const lastIdx = series.length - 1;
    ctx.beginPath();
    ctx.arc(
        toX(lastIdx), toY_liq(series[lastIdx].globalLiq),
        3, 0, Math.PI * 2
    );
    ctx.fillStyle = '#b06cc8';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(
        toX(lastIdx), toY_spx(series[lastIdx].spx),
        3, 0, Math.PI * 2
    );
    ctx.fillStyle = '#6aaa5a';
    ctx.fill();

    // X-axis date labels
    ctx.fillStyle = 'rgba(138,126,106,0.6)';
    ctx.font = '8px "Space Mono", monospace';
    if (series.length > 0) {
        const fmtDate = d => d.slice(5);
        ctx.textAlign = 'left';
        ctx.fillText(
            fmtDate(series[0].date), pad.left, h - 4
        );
        ctx.textAlign = 'center';
        ctx.fillText(
            fmtDate(series[Math.floor(series.length / 2)].date),
            pad.left + plotW / 2, h - 4
        );
        ctx.textAlign = 'right';
        ctx.fillText(
            fmtDate(series[lastIdx].date),
            w - pad.right, h - 4
        );
    }
}

// Hover tooltip for Global Liquidity chart
const globLiqCanvas = document.getElementById('globLiqChart');
if (globLiqCanvas) {
    globLiqCanvas.addEventListener('mousemove', function(e) {
        if (!globLiqChartState) return;
        const { series, liqMin, liqRange, spxMin, spxRange,
                pad, w, h, plotW, plotH } = globLiqChartState;
        const rect = globLiqCanvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;

        const idx = Math.round(
            (mx - pad.left) / plotW * (series.length - 1)
        );
        if (idx < 0 || idx >= series.length) return;

        drawGlobLiqChart(
            globLiqChartState.rawSeries,
            globLiqChartState.metrics, true
        );

        const ctx = globLiqCanvas.getContext('2d');
        ctx.save();

        const toX = i =>
            pad.left + (i / (series.length - 1)) * plotW;
        const toY_liq = v =>
            pad.top + plotH * (1 - (v - liqMin) / liqRange);
        const toY_spx = v =>
            pad.top + plotH * (1 - (v - spxMin) / spxRange);
        const x = toX(idx);
        const yLiq = toY_liq(series[idx].globalLiq);
        const ySpx = toY_spx(series[idx].spx);

        // Crosshair
        ctx.strokeStyle = 'rgba(176,108,200,0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x, pad.top);
        ctx.lineTo(x, h - pad.bottom);
        ctx.stroke();
        ctx.setLineDash([]);

        // Dots
        ctx.beginPath();
        ctx.arc(x, yLiq, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#b06cc8';
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(x, ySpx, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#6aaa5a';
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Tooltip box
        const date = series[idx].date.slice(5);
        const liqVal = '$' +
            (series[idx].globalLiq / 1000000).toFixed(1) + 'T';
        const spxVal =
            Math.round(series[idx].spx).toLocaleString();
        const tipText = date + '  ' + liqVal + '  ' + spxVal;

        ctx.font = '8px "Space Mono", monospace';
        const tw = ctx.measureText(tipText).width;
        const boxW = tw + 12;
        const boxH = 18;
        let bx = x - boxW / 2;
        if (bx < pad.left) bx = pad.left;
        if (bx + boxW > w - pad.right)
            bx = w - pad.right - boxW;
        let by = Math.min(yLiq, ySpx) - boxH - 8;
        if (by < 2) by = Math.max(yLiq, ySpx) + 8;

        ctx.fillStyle = 'rgba(18,16,14,0.92)';
        ctx.strokeStyle = 'rgba(176,108,200,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(bx, by, boxW, boxH, 3);
        ctx.fill();
        ctx.stroke();

        ctx.textAlign = 'left';
        ctx.fillStyle = '#f0e6cc';
        ctx.fillText(tipText, bx + 6, by + 12);

        ctx.restore();
    });

    globLiqCanvas.addEventListener('mouseleave', function() {
        if (globLiqChartState)
            drawGlobLiqChart(
                globLiqChartState.rawSeries,
                globLiqChartState.metrics, true
            );
    });
}

// Fetch global liquidity (staggered 4s after page load)
setTimeout(fetchGlobalLiquidity, 4000);
setInterval(fetchGlobalLiquidity, 300000);
