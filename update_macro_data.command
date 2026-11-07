#!/bin/bash
# Opened in Terminal by launchd (com.alexbarnett.macro-data, daily 10:30) so it runs with
# Terminal's permission to read ~/Documents (a launchd job alone gets "Operation not permitted").
cd "$(dirname "$0")" || exit 1
# The Mac is sometimes still waking up with no network: wait up to 15 minutes for it
for i in $(seq 1 90); do curl -s -m 5 -o /dev/null https://script.google.com/ && break; sleep 10; done
{ echo "=== $(date '+%Y-%m-%d %H:%M')"; /usr/bin/python3 update_macro_data.py; echo "exit $?"; } >> "$HOME/Library/Logs/macro-data.log" 2>&1
# The desktop widget needs Übersicht running (found stopped Nov 7 2026)
pgrep -f 'bersicht.app/Contents/MacOS' >/dev/null || open -g /Applications/*bersicht.app
echo "Macro data updated $(date '+%H:%M') (log: ~/Library/Logs/macro-data.log). This window can be closed."
