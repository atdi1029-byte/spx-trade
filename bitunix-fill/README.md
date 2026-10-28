# Bitunix Fill

Chrome extension for the SPX app's **Open** button on US stocks (Bitunix blocks API orders on them).

Open puts the trade in the Bitunix link (`#cfill=...`). On bitunix.com this extension:
1. fills the order form: size (USDT box), TP/SL ticked, SL only — and rings Open Long/Short;
2. after you press Open, finds the new position, opens its Partial TP/SL → Add, fills TP1 on half — rings Confirm;
3. after that Confirm, Add again with TP2 on the rest — rings Confirm.
A TP typed in the order form covers the whole position and leaves 0 for partial TPs, so the split goes in as two partial TPs
(too small to split = the one TP goes in the order form).

It never presses Open or Confirm, never touches the positions' Market/Limit close buttons, and ignores links older than 10 minutes.

Install once: `chrome://extensions` → Developer mode (top right) → **Load unpacked** → this folder.
After editing `content.js`: press the reload arrow on the extension card.

Bitunix page hooks (checked Oct 27 2026): size input placeholder `Min …`, TP/SL inputs placeholder `TP` / `SL`,
toggle `.check-icon-group` "TP / SL", position rows `.sample-position-list-cell`, header cell "Partial TP/SL",
Add window `.arco-modal` with inputs `Trigger` / `Order Quantity`.
