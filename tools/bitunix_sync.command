#!/bin/bash
# Opened in Terminal by launchd (com.alexbarnett.bitunix-sync, 9:00 + 21:00) so it runs with
# Terminal's permission to read ~/Documents (a launchd job alone gets "Operation not permitted").
cd "$(dirname "$0")" || exit 1
# Wait up to 15 minutes for the network (the Mac can still be waking up)
for i in $(seq 1 90); do curl -s -m 5 -o /dev/null https://fapi.bitunix.com/ && break; sleep 10; done
/usr/bin/python3 -W ignore bitunix_sync.py >> bitunix_sync.log 2>&1
echo "exit $?" >> bitunix_sync.log
tail -8 bitunix_sync.log
echo "Bitunix -> SPX sync done $(date '+%H:%M'). This window can be closed."
