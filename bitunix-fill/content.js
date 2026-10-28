// Bitunix Fill: the SPX app's Open button opens Bitunix with the trade in the link (#cfill=...).
// This fills the order form (size, SL, TP2 on the whole position) - you press Open Long/Short.
// Then it opens the new position's Partial TP/SL, fills TP1 on half - you press Confirm.
// It never presses Open or Confirm itself, and never touches the Market/Limit close buttons.
(() => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const visible = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const inputs = () => [...document.querySelectorAll('input')].filter(visible);
  const setVal = (el, v) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    el.focus(); set.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
  };
  const click = el => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  const waitFor = async (fn, ms) => { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(250); } return null; };
  const ring = el => { if (el) { el.style.outline = '3px solid #ffa000'; el.style.outlineOffset = '2px'; } };

  let box = null;
  function banner(html, kind) {
    if (!box) {
      box = document.createElement('div');
      box.style.cssText = 'position:fixed;top:70px;right:16px;z-index:2147483647;max-width:320px;padding:10px 32px 10px 12px;border-radius:6px;font:12px/1.45 monospace;color:#e8f0f8;background:#1a2d45;border:1px solid #1e3a5f;box-shadow:0 4px 18px rgba(0,0,0,.5)';
      document.body.appendChild(box);
    }
    box.style.borderColor = kind === 'err' ? '#ef5350' : kind === 'go' ? '#ffa000' : '#26a69a';
    box.innerHTML = '<b>Bitunix Fill</b><br>' + html + '<span style="position:absolute;top:6px;right:10px;cursor:pointer;color:#6a8aaa">&times;</span>';
    box.lastChild.onclick = () => { box.remove(); box = null; };
  }

  const m = location.hash.match(/cfill=([^&]+)/);
  if (!m) return;
  let o;
  try { o = JSON.parse(decodeURIComponent(m[1])); } catch (e) { return; }
  history.replaceState(null, '', location.pathname + location.search); // fill once, not on every reload
  if (!o.ts || Date.now() - o.ts > 10 * 60000) return banner('Link is old - not filling.', 'err');
  const sym = String(o.sym || '').toUpperCase();
  const longSide = o.side !== 'sell';
  // Bitunix sends unknown pairs to BTCUSDT (CAT, Oct 27): only ever fill the pair the link is for
  const onPair = () => location.pathname.toUpperCase().endsWith('/' + sym) && document.title.toUpperCase().includes(sym);
  const wrongPair = () => banner('<b style="color:#ff6b6b">This page is not ' + sym + '</b> (Bitunix may not list it) - nothing filled. Don\'t open anything here.', 'err');

  // --- position rows for this symbol (cells: 0 name/side, 1 size, 2 entry ...)
  const rowsFor = () => [...document.querySelectorAll('.sample-position-list-cell')]
    .filter(c => c.parentElement.firstElementChild === c && (c.innerText || '').trim().startsWith(sym) && (longSide ? /Long/ : /Short/).test(c.innerText))
    .map(c => c.parentElement);
  const rowKey = r => [...r.children].slice(1, 3).map(c => (c.innerText || '').replace(/\s+/g, ' ')).join('|');

  async function fillOrder() {
    const qty = await waitFor(() => inputs().find(i => /^Min /.test(i.placeholder || '')), 20000);
    if (!qty) return banner('Order form not found.', 'err');
    await sleep(500);
    if (!await waitFor(onPair, 5000)) return wrongPair();
    // Tick TP / SL first: ticking it re-draws the form and wiped the size (OKLO, Oct 27)
    const tpIn = () => inputs().find(i => i.placeholder === 'TP');
    if (!tpIn()) {
      const tick = [...document.querySelectorAll('.check-icon-group')].find(e => visible(e) && /TP \/ SL/.test(e.innerText || ''));
      if (tick) click(tick);
    }
    const tp = await waitFor(tpIn, 3000), sl = inputs().find(i => i.placeholder === 'SL');
    await sleep(400);
    const qtyNow = () => inputs().find(i => /^Min /.test(i.placeholder || '')) || qty;
    const unit = (qtyNow().closest('.arco-input-group-wrapper') || qtyNow().parentElement.parentElement).innerText || '';
    const want = /USDT/.test(unit) ? o.size : o.qty;
    for (let k = 0; k < 4 && qtyNow().value !== String(want); k++) { setVal(qtyNow(), want); await sleep(400); }
    if (qtyNow().value !== String(want)) return banner('Could not fill the size. Type ' + (/USDT/.test(unit) ? o.size + ' USDT' : o.qty) + ' by hand.', 'err');
    if (!tp || !sl) return banner('Size filled, but the TP / SL fields did not show. Set SL ' + o.sl + ' and TP ' + o.tp2 + ' by hand.', 'err');
    if (!onPair()) return wrongPair();
    setVal(tp, o.tp2);
    setVal(sl, o.sl);
    // Leverage: SPX sizes for 4x; OKLO was sitting at 20X (liquidation before the SL)
    const levEl = [...document.querySelectorAll('div, span')].filter(visible)
      .find(e => /^\d+X(\s+\d+X)?$/.test((e.innerText || '').trim()) && e.getBoundingClientRect().left > window.innerWidth * 0.6 && e.getBoundingClientRect().top < qtyNow().getBoundingClientRect().top);
    const levs = levEl ? (levEl.innerText.match(/\d+/g) || []).map(Number) : [];
    const lev = longSide ? levs[0] : (levs[1] || levs[0]);
    const levWrong = o.lev && lev && lev !== Number(o.lev);
    const btn = [...document.querySelectorAll('button')].find(b => visible(b) && (b.innerText || '').trim() === (longSide ? 'Open Long' : 'Open Short'));
    ring(btn);
    const before = new Set(rowsFor().map(rowKey));
    const filled = 'Filled ' + sym + ': size ' + (/USDT/.test(unit) ? '$' + o.size : o.qty) + ', SL ' + o.sl + ', TP2 ' + o.tp2 + '.';
    if (levWrong) {
      ring(levEl);
      banner(filled + '<br><b style="color:#ff6b6b">Leverage is ' + lev + 'X here - SPX sizes for ' + o.lev + 'X.</b> Click ' + lev + 'X (ringed), set ' + o.lev + ', confirm, then press ' + (longSide ? 'Open Long' : 'Open Short') + '.', 'err');
    } else {
      banner(filled + '<br><b>Press ' + (longSide ? 'Open Long' : 'Open Short') + '.</b>' + (o.tp1qty ? '<br>TP1 on half comes next.' : ''), 'go');
    }
    // not once: a press that Bitunix rejects (no size, low margin) must not use up the TP1 step
    let busy = false, done = false;
    if (btn && o.tp1qty) btn.addEventListener('click', async () => {
      if (busy || done) return;
      if (!onPair()) return wrongPair();
      busy = true;
      done = await addTp1(before);
      busy = false;
    });
  }

  async function addTp1(before) {
    banner('Waiting for the new ' + sym + ' position...');
    const row = await waitFor(() => rowsFor().find(r => !before.has(rowKey(r))), 20000);
    if (!row) { banner('No new ' + sym + ' position showed up. If Bitunix said why, fix it and press ' + (longSide ? 'Open Long' : 'Open Short') + ' again.', 'err'); return false; }
    const hdr = [...document.querySelectorAll('div')].find(d => d.children.length >= 10 && [...d.children].some(c => (c.innerText || '').trim() === 'Partial TP/SL'));
    const idx = hdr ? [...hdr.children].findIndex(c => (c.innerText || '').trim() === 'Partial TP/SL') : -1;
    const cell = idx >= 0 ? row.children[idx] : null;
    const target = cell && (cell.querySelector('svg') ? cell.querySelector('svg').parentElement : cell.querySelector('.cell-content') || cell);
    if (!target) return banner('Could not find Partial TP/SL for ' + sym + '. Add TP1 ' + o.tp1 + ' on ' + o.tp1qty + ' by hand.', 'err');
    click(target);
    const add = await waitFor(() => [...document.querySelectorAll('.arco-modal button')].find(b => visible(b) && (b.innerText || '').trim() === 'Add'), 6000);
    if (!add) return banner('Partial TP/SL window did not open. Add TP1 ' + o.tp1 + ' on ' + o.tp1qty + ' by hand.', 'err');
    click(add);
    // the "Add TP/SL" window (the Partial TP/SL list behind it is a modal too, without these boxes)
    const form = await waitFor(() => [...document.querySelectorAll('.arco-modal')].filter(visible)
      .find(m => m.querySelector('input[placeholder="Trigger"]') && m.querySelector('input[placeholder="Order Quantity"]')), 6000);
    if (!form) return banner('TP form did not open. Add TP1 ' + o.tp1 + ' on ' + o.tp1qty + ' by hand.', 'err');
    const trig = [...form.querySelectorAll('input')].find(i => visible(i) && i.placeholder === 'Trigger');      // first = TP side
    const q = [...form.querySelectorAll('input')].find(i => visible(i) && i.placeholder === 'Order Quantity');
    if (!trig || !q) return banner('TP form fields not found. Add TP1 ' + o.tp1 + ' on ' + o.tp1qty + ' by hand.', 'err');
    setVal(trig, o.tp1);
    setVal(q, o.tp1qty);
    ring([...form.querySelectorAll('button')].find(b => visible(b) && (b.innerText || '').trim() === 'Confirm'));
    banner('TP1 ' + o.tp1 + ' on ' + o.tp1qty + ' filled.<br><b>Press Confirm.</b>', 'go');
    return true;
  }

  fillOrder();
})();
