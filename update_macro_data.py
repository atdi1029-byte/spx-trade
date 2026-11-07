#!/usr/bin/env python3
"""Keep macro-data.json current for the desktop widget (Alex, Nov 7 2026: the widget reads only
this file, which had stopped on Sep 10). Appends the sheet's newer points the way tga-dss.html's
liveTail does, then commits and pushes. Run daily by com.alexbarnett.macro-data.

    update_macro_data.py            update + push
    update_macro_data.py --dry-run  print what would be added, write nothing
"""
import datetime
import json
import os
import subprocess
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
PATH = os.path.join(HERE, "macro-data.json")
BASE = "https://script.google.com/macros/s/AKfycbyeL8nGHmsRRG2uk7I3cuh2aWQ14RRKvJYwOblvOWw36_QIKyr9KaA4jXK1K5pyySNiBg/exec"
#         file key     action              value key    Wednesdays only (FRED's weekly date)
SERIES = [("tga",       "liquidity",        "balance",   False),
          ("netLiq",    "net_liquidity",    "netLiq",    True),
          ("globalLiq", "global_liquidity", "globalLiq", True)]
MAX_JUMP = 0.25   # a bigger move between two points means bad data: leave that series alone


def fetch(action):
    req = urllib.request.Request(f"{BASE}?action={action}", headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        d = json.loads(r.read().decode("utf-8", "replace"))
    if d.get("status") != "ok" or not isinstance(d.get("series"), list):
        raise ValueError(f"{action}: bad answer {str(d)[:120]}")
    return d["series"]


def new_points(series, live, key, wed_only):
    """The sheet's points after the file's last one. Net liquidity is computed a little differently
    in the sheet, so they are shifted by the gap on the overlap date (no fake jump in the DSS)."""
    last = series[-1]
    live = [p for p in live if p.get("date") and isinstance(p.get(key), (int, float))]
    overlap = next((p for p in live if p["date"] == last["date"]), None)
    if overlap is None and live and live[0]["date"] > last["date"]:
        raise ValueError(f"{key}: the sheet starts after the file ends, no overlap to line up")
    shift = last[key] - overlap[key] if overlap else 0
    out, prev = [], last[key]
    for p in live:
        if p["date"] <= last["date"]:
            continue
        if wed_only and datetime.date.fromisoformat(p["date"]).weekday() != 2:
            continue
        val = round(p[key] + shift)
        if prev and abs(val - prev) / abs(prev) > MAX_JUMP:
            raise ValueError(f"{key}: {p['date']} jumps from {prev} to {val}")
        out.append({"date": p["date"], key: val})
        prev = val
    return out


def main():
    dry = "--dry-run" in sys.argv
    data = json.load(open(PATH))
    added = {}
    for name, action, key, wed in SERIES:
        try:
            pts = new_points(data[name], fetch(action), key, wed)
        except Exception as exc:   # one bad series never blocks the others
            print(f"SKIPPED {name}: {exc}")
            continue
        added[name] = len(pts)
        data[name].extend(pts)
        print(name, "+%d" % len(pts), "->", data[name][-1])
    if dry or not any(added.values()):
        print("nothing written" if dry else "already current")
        return 0
    tmp = PATH + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f)
    os.replace(tmp, PATH)
    msg = "Macro data: " + ", ".join(f"{k} +{v}" for k, v in added.items() if v)
    for cmd in (["git", "add", "macro-data.json"], ["git", "commit", "-q", "-m", msg, "-m", "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"],
                ["git", "pull", "-q", "--rebase", "--autostash"], ["git", "push", "-q"]):
        subprocess.run(cmd, cwd=HERE, check=True)
    print("pushed:", msg)
    return 0


if __name__ == "__main__":
    sys.exit(main())
