/**
 * ONE-TIME FIX: Run this from Apps Script editor (Extensions > Apps Script > paste > Run)
 *
 * Fixes:
 * 1. Inserts header row if missing
 * 2. Negates profit on "Stopped Out" manual entries that have positive values
 * 3. Changes "TP Hit" to "Closed" on rows that were closed via dashboard
 */
function fixSheetData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Positions');
  if (!sh) { Logger.log('ERROR: No "Positions" sheet found'); return; }

  var data = sh.getDataRange().getValues();
  var firstRow = data[0] || [];

  // --- 1. Fix missing header row ---
  // Check if row 1 is data (has a date) instead of headers
  var hasHeaders = false;
  for (var i = 0; i < firstRow.length; i++) {
    var v = String(firstRow[i] || '').toLowerCase();
    if (v.indexOf('ticker') !== -1 || v.indexOf('signal') !== -1 || v.indexOf('outcome') !== -1) {
      hasHeaders = true;
      break;
    }
  }

  if (!hasHeaders) {
    sh.insertRowBefore(1);
    sh.getRange(1, 1, 1, 9).setValues([
      ['Timestamp', 'Ticker', 'Signal', 'Price', 'Action', 'Outcome', 'Size', 'Profit', 'Notes']
    ]);
    Logger.log('FIXED: Inserted header row');
    // Re-read data after insert
    data = sh.getDataRange().getValues();
  } else {
    Logger.log('OK: Header row already exists');
  }

  // Column indices (0-based, after header fix)
  var COL_ACTION  = 4; // E
  var COL_OUTCOME = 5; // F
  var COL_SIZE    = 6; // G
  var COL_PROFIT  = 7; // H
  var COL_NOTES   = 8; // I

  var negated = 0;
  var tpFixed = 0;
  var startRow = hasHeaders ? 1 : 1; // skip header

  for (var r = startRow; r < data.length; r++) {
    var row = data[r];
    var action  = String(row[COL_ACTION] || '').trim();
    var outcome = String(row[COL_OUTCOME] || '').trim();
    var profit  = row[COL_PROFIT];
    var notes   = String(row[COL_NOTES] || '');
    var sheetRow = r + 1; // 1-indexed

    if (action !== 'Entered') continue;

    // --- 2. Fix wrong-sign manual entries ---
    // "Stopped Out" + positive profit + "Manual entry" = user forgot minus sign
    if (outcome === 'Stopped Out' && typeof profit === 'number' && profit > 0 && notes.indexOf('Manual entry') !== -1) {
      sh.getRange(sheetRow, COL_PROFIT + 1).setValue(-profit);
      Logger.log('NEGATED row ' + sheetRow + ': ' + row[1] + ' ' + profit + ' -> ' + (-profit));
      negated++;
    }

    // --- 3. Change "TP Hit" to "Closed" ---
    if (outcome === 'TP Hit') {
      sh.getRange(sheetRow, COL_OUTCOME + 1).setValue('Closed');
      tpFixed++;
    }
  }

  // Also fix "Stopped Out" to "Closed" for consistency
  // (but keep the negative profit so it still counts as a loss)
  // Actually, let's leave Stopped Out as-is since the script handles it fine
  // and it's useful visual info

  Logger.log('');
  Logger.log('=== DONE ===');
  Logger.log('Profits negated: ' + negated);
  Logger.log('TP Hit -> Closed: ' + tpFixed);
  Logger.log('Run the SPX dashboard and refresh to see updated stats.');
}
