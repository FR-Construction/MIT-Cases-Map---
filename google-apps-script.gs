/**
 * Google Apps Script backend for the MIT Schedule Tool.
 * Deploy this bound to a Google Sheet with a tab named "Schedules" that has
 * the header row: Case ID | Start Date | Tasks JSON | Last Updated
 *
 * Setup steps are in SCHEDULE_SETUP.md.
 */

const SHEET_NAME = 'Schedules';

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['Case ID', 'Start Date', 'Tasks JSON', 'Last Updated']);
  }
  return sheet;
}

function findRowByCaseId_(sheet, caseId) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(caseId).trim()) {
      return i + 1; // 1-indexed sheet row
    }
  }
  return -1;
}

function doGet(e) {
  const caseId = e.parameter.caseId;
  const sheet = getSheet_();

  if (!caseId) {
    return jsonResponse_({ error: 'Missing caseId parameter' }, 400);
  }

  const row = findRowByCaseId_(sheet, caseId);
  if (row === -1) {
    return jsonResponse_({ found: false });
  }

  const values = sheet.getRange(row, 1, 1, 4).getValues()[0];
  let tasks = [];
  try {
    tasks = JSON.parse(values[2] || '[]');
  } catch (err) {
    tasks = [];
  }

  return jsonResponse_({
    found: true,
    caseId: values[0],
    startDate: values[1],
    tasks: tasks,
    lastUpdated: values[3]
  });
}

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const caseId = body.caseId;
  if (!caseId) {
    return jsonResponse_({ error: 'Missing caseId' }, 400);
  }

  const sheet = getSheet_();
  const row = findRowByCaseId_(sheet, caseId);
  const tasksJson = JSON.stringify(body.tasks || []);
  const now = new Date().toISOString();

  if (row === -1) {
    sheet.appendRow([caseId, body.startDate || '', tasksJson, now]);
  } else {
    sheet.getRange(row, 2, 1, 3).setValues([[body.startDate || '', tasksJson, now]]);
  }

  return jsonResponse_({ success: true, lastUpdated: now });
}

function jsonResponse_(obj, statusCode) {
  const output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
