"""Bitunix -> SPX app sync: every stock/commodity position open on Bitunix is open in the SPX app.

Run by launchd (com.alexbarnett.bitunix-sync, 9:00 + 21:00) through bitunix_sync.command.
  /usr/bin/python3 SPX/tools/bitunix_sync.py            # add what's missing
  /usr/bin/python3 SPX/tools/bitunix_sync.py --dry-run  # only show it

- Missing position -> ?action=add_trade with outcome=Open (Entered, entry = Bitunix avg price,
  size = Bitunix margin). The app's add_trade stamps today's date, so the 4-day timer starts now.
- Open in the app but gone from Bitunix -> reported only (closing needs the P&L, Alex marks it).
- Crypto is the crypto app's business: a Bitunix symbol counts only when the SPX app tracks it as a
  stock ticker, and 3x positions on CRYPTO_CLASH names (crypto coins that share a stock ticker) are skipped.
Key: BreakevenBot/.env (the one live Bitunix account). Log: SPX/tools/bitunix_sync.log
"""

import json
import os
import re
import subprocess
import sys
import urllib.parse
import urllib.request
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
BOT = os.path.join(HERE, '..', '..', 'BreakevenBot')
sys.path.insert(0, BOT)
from bitunix_api import BitunixClient  # noqa: E402

SPX_URL = ('https://script.google.com/macros/s/AKfycbyeL8nGHmsRRG2uk7I3cuh2aWQ14RRKvJYwOblvOWw36_QIKyr9KaA4jXK1K5pyySNiBg'
           '/exec')
# app.js BX_SYMBOL (SPX ticker -> Bitunix base)
BX_SYMBOL = {'CL1!': 'CL', 'USOIL': 'CL', 'NG1!': 'NATGAS', 'SILVER': 'XAG', 'GOLD': 'XAU', 'PLATINUM': 'XPT',
             'XCUUSD': 'COPPER', 'BRK.B': 'BRKB'}
# Bitunix base -> SPX ticker where Bitunix uses a name (Asian tickers lose leading zeros in the sheet)
ALIAS = {'CATERPILLAR': 'CAT', 'STXX': 'STX', 'PENGSTOCK': 'PENG', 'GAMESTOP': 'GME', 'ZHONGJI': '300308',
         'POPMART': '9992', 'BYD': '1211', 'XIAOMI': '1810', 'HYUNDAI': '5380', 'SAMSUNG': '5930',
         'SKHYNIX': '660', 'TENCENT': '700', 'MEITUAN': '3690', 'KUAISHOU': '1024', 'GIGADEV': '3986'}
CRYPTO_CLASH = {'MAV', 'WAL'}


def load_env(path):
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                os.environ[k.strip()] = v.strip()


def bx_symbol(ticker):
    raw = re.sub(r'\.P$', '', str(ticker).upper())
    return re.sub(r'(USDT|USDC|USD)$', '', BX_SYMBOL.get(raw, raw))


def get(params, timeout=90):
    with urllib.request.urlopen(SPX_URL + '?' + urllib.parse.urlencode(params), timeout=timeout) as r:
        return json.loads(r.read().decode())


def notify(msg):
    subprocess.run(['osascript', '-e', 'display notification %s with title "Bitunix → SPX sync"' % json.dumps(msg)])


def main():
    dry = '--dry-run' in sys.argv
    load_env(os.path.join(BOT, '.env'))
    pos = BitunixClient().get_positions()['data']
    dash = get({'action': 'dashboard', 'nocache': '1'})

    # Open in the app: status OPEN, or an open Entered row still waiting for an outcome (a new signal
    # on the same side hides the OPEN status)
    side_of = lambda s: 'BUY' if str(s).lower() in ('buy', 'add') else 'SELL'
    open_app = set()
    for t in dash['tickers']:
        if t.get('buyStatus') == 'OPEN':
            open_app.add((t['ticker'], 'BUY'))
        if t.get('sellStatus') == 'OPEN':
            open_app.add((t['ticker'], 'SELL'))
    for a in dash.get('actionNeeded', []):
        if a.get('type') == 'mark_outcome':
            open_app.add((a['ticker'], side_of(a['signal'])))
    # Signal cards still waiting for Entered/Skipped: a matching position is marked on its card, so the
    # card doesn't later add a second open row
    cards = {}
    for a in dash.get('actionNeeded', []):
        if a.get('type') == 'mark_action':
            cards.setdefault((a['ticker'], side_of(a['signal'])), a)

    # SPX stock tickers by Bitunix base (tickers ending USDT/.P are crypto entries)
    spx = {}
    for t in dash['tickers']:
        tk = str(t['ticker'])
        if re.search(r'(USDT|USDC)(\.P)?$', tk.upper()):
            continue
        b = bx_symbol(tk)
        # two sheet names for one market (XPT and XPTUSD): keep the one with an open trade
        if b not in spx or any((tk, sd) in open_app for sd in ('BUY', 'SELL')):
            spx[b] = tk
    for base, tk in ALIAS.items():
        if tk in spx.values():
            spx[base] = tk

    added, on_bx = [], set()
    for p in sorted(pos, key=lambda p: int(p['ctime'])):
        base = p['symbol'][:-4]
        tk = spx.get(base)
        if not tk or (base in CRYPTO_CLASH and int(p['leverage']) < 4):
            continue
        key = (tk, p['side'])
        on_bx.add(key)
        if key in open_app:
            continue
        size = '%.2f' % float(p['margin'])
        card = cards.get(key)
        if card:
            q = {'action': 'update_position', 'ticker': tk, 'signal': card['signal'], 'price': card['price'],
                 'field': 'action', 'value': 'Entered', 'entrySize': size}
        else:
            q = {'action': 'add_trade', 'ticker': tk, 'signal': 'buy' if p['side'] == 'BUY' else 'sell',
                 'price': p['avgOpenPrice'], 'outcome': 'Open', 'profit': '0', 'entrySize': size}
        opened = datetime.fromtimestamp(int(p['ctime']) / 1000).strftime('%b %d')
        line = '%s %s @ %s, $%s, opened %s%s' % (tk, p['side'], p['avgOpenPrice'], size, opened,
                                                  ' (signal card marked Entered)' if card else '')
        if not dry:
            r = get(q)
            if r.get('status') != 'ok':
                print('FAILED', line, r)
                continue
        open_app.add(key)  # a second Bitunix position on the same side doesn't need a second row
        added.append(line)

    gone = sorted('%s %s' % k for k in open_app if k not in on_bx)
    stamp = datetime.now().strftime('%Y-%m-%d %H:%M')
    print('=== %s%s  Bitunix positions %d' % (stamp, ' (dry run)' if dry else '', len(pos)))
    print('added to SPX app (%d):' % len(added))
    for a in added:
        print('  ' + a)
    print('open in SPX app, not on Bitunix (%d): %s' % (len(gone), ', '.join(gone) or '-'))
    if not dry and (added or gone):
        msg = []
        if added:
            msg.append('Added %d: %s' % (len(added), ', '.join(a.split(' @')[0] for a in added)))
        if gone:
            msg.append('Not on Bitunix, close in app: ' + ', '.join(gone))
        notify('. '.join(msg))


if __name__ == '__main__':
    main()
