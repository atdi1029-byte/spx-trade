// Bitunix Fill: the SPX app's Open button opens Bitunix with the trade in the link (#cfill=...).
// This fills the order form (size + SL) - you press Open Long/Short. Then it opens the new position's
// Partial TP/SL twice: TP1 on half, you press Confirm; TP2 on the rest, you press Confirm.
// (A TP in the order form covers the whole position and leaves 0 for partial TPs - RUM, Oct 27.
// Too small to split = that one TP goes in the order form.)
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
  // Bitunix sends unknown pairs to BTCUSDT (CAT, Oct 27): only ever fill the pair the link is for.
  // (Path only: the title uses Bitunix's short name - CATERPILLARUSDT's title says CATUSDT.)
  const onPair = () => location.pathname.toUpperCase().endsWith('/' + sym);
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
    let tp = await waitFor(tpIn, 3000);
    // splitting needs the order-form TP empty; a left-over TP (even 0) clears only by un-ticking and re-ticking
    if (tp && o.tp1qty && tp.value !== '') {
      const tick = () => [...document.querySelectorAll('.check-icon-group')].find(e => visible(e) && /TP \/ SL/.test(e.innerText || ''));
      click(tick()); await sleep(500); click(tick());
      tp = await waitFor(tpIn, 3000);
    }
    const sl = inputs().find(i => i.placeholder === 'SL');
    await sleep(400);
    const qtyNow = () => inputs().find(i => /^Min /.test(i.placeholder || '')) || qty;
    const unit = (qtyNow().closest('.arco-input-group-wrapper') || qtyNow().parentElement.parentElement).innerText || '';
    const want = /USDT/.test(unit) ? o.size : o.qty;
    for (let k = 0; k < 4 && qtyNow().value !== String(want); k++) { setVal(qtyNow(), want); await sleep(400); }
    if (qtyNow().value !== String(want)) return banner('Could not fill the size. Type ' + (/USDT/.test(unit) ? o.size + ' USDT' : o.qty) + ' by hand.', 'err');
    if (!tp || !sl) return banner('Size filled, but the TP / SL fields did not show. Set SL ' + o.sl + ' and TP ' + o.tp2 + ' by hand.', 'err');
    if (!onPair()) return wrongPair();
    if (!o.tp1qty) setVal(tp, o.tp2);  // split: leave TP empty (typing '' makes it 0)
    setVal(sl, o.sl);
    // Leverage: SPX sizes for 4x; OKLO was sitting at 20X (liquidation before the SL)
    const levNow = () => {
      const el = [...document.querySelectorAll('div, span')].filter(visible)
        .find(e => /^\d+X(\s+\d+X)?$/.test((e.innerText || '').trim()) && e.getBoundingClientRect().left > window.innerWidth * 0.6 && e.getBoundingClientRect().top < qtyNow().getBoundingClientRect().top);
      const levs = el ? (el.innerText.match(/\d+/g) || []).map(Number) : [];
      return { el, lev: longSide ? levs[0] : (levs[1] || levs[0]) };
    };
    const { el: levEl, lev } = levNow();
    const levWrong = o.lev && lev && lev !== Number(o.lev);
    const btn = [...document.querySelectorAll('button')].find(b => visible(b) && (b.innerText || '').trim() === (longSide ? 'Open Long' : 'Open Short'));
    ring(btn);
    let levWarned = false;   // set below; once the pair is at o.lev the box turns back to "press Open"
    keepFilled(qtyNow, want, btn, () => {
      if (!levWarned) return;
      const now = levNow();
      if (now.lev === Number(o.lev)) {
        levWarned = false;
        if (now.el) now.el.style.outline = '';
        banner(filled + '<br>Leverage is ' + o.lev + 'X now.<br><b>Press ' + (longSide ? 'Open Long' : 'Open Short') + '.</b>' + (o.tp1qty ? '<br>TP1 and TP2 come next.' : ''), 'go');
      }
    });
    const before = new Set(rowsFor().map(rowKey));
    const filled = 'Filled ' + sym + ': size ' + (/USDT/.test(unit) ? '$' + o.size : o.qty) + ', SL ' + o.sl + (o.tp1qty ? '' : ', TP ' + o.tp2) + '.';
    if (levWrong) {
      ring(levEl);
      levWarned = true;
      banner(filled + '<br><b style="color:#ff6b6b">Leverage is ' + lev + 'X here - SPX sizes for ' + o.lev + 'X.</b> Click ' + lev + 'X (ringed), set ' + o.lev + ', confirm, then press ' + (longSide ? 'Open Long' : 'Open Short') + '.', 'err');
    } else {
      banner(filled + '<br><b>Press ' + (longSide ? 'Open Long' : 'Open Short') + '.</b>' + (o.tp1qty ? '<br>TP1 and TP2 come next.' : ''), 'go');
    }
    // not once: a press that Bitunix rejects (no size, low margin) must not use up the TP1 step
    let busy = false, done = false;
    if (btn && o.tp1qty) btn.addEventListener('click', async () => {
      if (busy || done) return;
      if (!onPair()) return wrongPair();
      busy = true;
      done = await addTps(before);
      busy = false;
    });
  }

  // Bitunix resets the order form a few times while the page settles (size wiped at 0.9s, 1.3s and
  // 6.8s after load - RUM, Oct 27) and again when you change leverage (CAT, Oct 27). Keep putting the
  // values back until you press Open (3 min max); a box you type in yourself is left alone.
  function keepFilled(qtyNow, want, btn, onTick) {
    let stop = false, toggleTouched = false;
    const touched = new Set();
    const t0 = Date.now();
    const kind = el => el && el.tagName === 'INPUT' ? (/^Min /.test(el.placeholder || '') ? 'qty' : el.placeholder === 'TP' ? 'tp' : el.placeholder === 'SL' ? 'sl' : '') : '';
    const mark = e => { if (e.isTrusted && kind(e.target)) touched.add(kind(e.target)); };
    document.addEventListener('keydown', mark, true);
    document.addEventListener('input', mark, true);
    document.addEventListener('mousedown', e => {
      if (!e.isTrusted) return;
      if (e.target.closest && e.target.closest('.check-icon-group')) toggleTouched = true;
      const b = e.target.closest && e.target.closest('button');
      if (b && /^Open (Long|Short)$/.test((b.innerText || '').trim())) stop = true;
    }, true);
    const put = (el, v) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(el, String(v));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const iv = setInterval(() => {
      if (stop || Date.now() - t0 > 3 * 60000 || !onPair()) return clearInterval(iv);
      if (visibleModals().length) return;                                    // leverage window etc.
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
      if (onTick) onTick();
      const q = qtyNow();
      if (q && !touched.has('qty') && q.value !== String(want)) put(q, want);
      const tp = inputs().find(i => i.placeholder === 'TP');
      if (!tp) {
        const tick = [...document.querySelectorAll('.check-icon-group')].find(e => visible(e) && /TP \/ SL/.test(e.innerText || ''));
        if (tick && !toggleTouched) click(tick);
        return;
      }
      const sl = inputs().find(i => i.placeholder === 'SL');
      if (sl && !touched.has('sl') && sl.value !== String(o.sl)) put(sl, o.sl);
      if (!o.tp1qty && !touched.has('tp') && tp.value !== String(o.tp2)) put(tp, o.tp2);
    }, 400);
  }

  const visibleModals = () => [...document.querySelectorAll('.arco-modal')].filter(visible);
  const addForm = () => visibleModals().find(m => m.querySelector('input[placeholder="Trigger"]') && m.querySelector('input[placeholder="Order Quantity"]'));
  const listModal = () => visibleModals().find(m => [...m.querySelectorAll('button')].some(b => visible(b) && (b.innerText || '').trim() === 'Add'));

  // Open the position's Partial TP/SL list (if it isn't up) and its Add form
  async function openAdd(row) {
    if (!listModal()) {
      const hdr = [...document.querySelectorAll('div')].find(d => d.children.length >= 10 && [...d.children].some(c => (c.innerText || '').trim() === 'Partial TP/SL'));
      const idx = hdr ? [...hdr.children].findIndex(c => (c.innerText || '').trim() === 'Partial TP/SL') : -1;
      const cell = idx >= 0 ? row.children[idx] : null;
      const target = cell && (cell.querySelector('svg') ? cell.querySelector('svg').parentElement : cell.querySelector('.cell-content') || cell);
      if (!target) return null;
      click(target);
      if (!await waitFor(listModal, 6000)) return null;
    }
    const add = [...listModal().querySelectorAll('button')].find(b => visible(b) && (b.innerText || '').trim() === 'Add');
    click(add);
    return waitFor(addForm, 6000);
  }

  // Fill one partial TP and wait for Confirm (true) or Cancel/close (false)
  async function oneTp(row, name, price, qty) {
    const form = await openAdd(row);
    if (!form) { banner('Could not open Partial TP/SL. Add ' + name + ' ' + price + ' on ' + qty + ' by hand.', 'err'); return false; }
    const trig = [...form.querySelectorAll('input')].find(i => visible(i) && i.placeholder === 'Trigger');      // first = TP side
    const q = [...form.querySelectorAll('input')].find(i => visible(i) && i.placeholder === 'Order Quantity');
    if (!trig || !q) { banner('TP form fields not found. Add ' + name + ' ' + price + ' on ' + qty + ' by hand.', 'err'); return false; }
    await sleep(500);
    setVal(trig, price);
    await sleep(400);  // typing the trigger re-sets the quantity a moment later (NOK test, Oct 27)
    const qIn = () => [...form.querySelectorAll('input')].find(i => visible(i) && i.placeholder === 'Order Quantity') || q;
    for (let k = 0; k < 4 && qIn().value !== String(qty); k++) { setVal(qIn(), qty); await sleep(400); }
    if (qIn().value !== String(qty)) { banner(name + ': Bitunix only allows ' + (qIn().value || 0) + ' here (is a TP already on the whole position?). Add ' + name + ' ' + price + ' on ' + qty + ' by hand.', 'err'); return false; }
    ring([...form.querySelectorAll('button')].find(b => visible(b) && (b.innerText || '').trim() === 'Confirm'));
    banner(name + ' ' + price + ' on ' + qty + ' filled.<br><b>Press Confirm.</b>', 'go');
    await waitFor(() => !form.isConnected || !visible(form), 5 * 60000);
    await sleep(1200);
    const list = listModal();
    return !!list && (list.innerText || '').includes(price);
  }

  async function addTps(before) {
    banner('Waiting for the new ' + sym + ' position...');
    const row = await waitFor(() => rowsFor().find(r => !before.has(rowKey(r))), 20000);
    if (!row) { banner('No new ' + sym + ' position showed up. If Bitunix said why, fix it and press ' + (longSide ? 'Open Long' : 'Open Short') + ' again.', 'err'); return false; }
    if (!await oneTp(row, 'TP1', o.tp1, o.tp1qty)) { banner('TP1 was not added - stopped. Add TP1 ' + o.tp1 + ' on ' + o.tp1qty + ' and TP2 ' + o.tp2 + ' on ' + o.tp2qty + ' by hand.', 'err'); return true; }
    if (!await oneTp(row, 'TP2', o.tp2, o.tp2qty)) { banner('TP1 is on. TP2 was not added - add TP2 ' + o.tp2 + ' on ' + o.tp2qty + ' by hand.', 'err'); return true; }
    banner(sym + ' done: SL ' + o.sl + ', TP1 ' + o.tp1 + ' on ' + o.tp1qty + ', TP2 ' + o.tp2 + ' on ' + o.tp2qty + '.');
    return true;
  }

  fillOrder();
})();
