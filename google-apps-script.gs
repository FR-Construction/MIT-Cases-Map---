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
    sheet.appendRow(['Case ID', 'Start Date', 'Tasks JSON', 'Last Updated', 'Supervisors']);
  }
  // Force Start Date, Last Updated, and Supervisors columns to Plain Text
  sheet.getRange('B:B').setNumberFormat('@');
  sheet.getRange('D:D').setNumberFormat('@');
  sheet.getRange('E:E').setNumberFormat('@');
  return sheet;
}

// Defensive: if a cell was ever auto-converted into a real Date object
// (e.g. from data written before the plain-text format was applied),
// convert it back into a plain YYYY-MM-DD string.
function toPlainDateString_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return value || '';
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

  if (e.parameter.list) {
    return jsonResponse_({ schedules: listAllSchedules_(sheet) });
  }

  if (!caseId) {
    return jsonResponse_({ error: 'Missing caseId parameter' }, 400);
  }

  const row = findRowByCaseId_(sheet, caseId);
  if (row === -1) {
    return jsonResponse_({ found: false });
  }

  const values = sheet.getRange(row, 1, 1, 5).getValues()[0];
  let tasks = [];
  try {
    tasks = JSON.parse(values[2] || '[]');
  } catch (err) {
    tasks = [];
  }
  
  let supervisors = [];
  try {
    supervisors = JSON.parse(values[4] || '[]');
  } catch (err) {
    supervisors = [];
  }

  return jsonResponse_({
    found: true,
    caseId: values[0],
    startDate: toPlainDateString_(values[1]),
    tasks: tasks,
    lastUpdated: toPlainDateString_(values[3]),
    supervisors: supervisors
  });
}

// Returns a summary of every saved schedule: Case ID, start date, total
// duration in days (max Día Fin across all tasks), and last updated time.
function listAllSchedules_(sheet) {
  const data = sheet.getDataRange().getValues();
  const summaries = [];

  for (let i = 1; i < data.length; i++) {
    const caseId = data[i][0];
    if (!caseId) continue;

    let tasks = [];
    try {
      tasks = JSON.parse(data[i][2] || '[]');
    } catch (err) {
      tasks = [];
    }

    let supervisors = [];
    try {
      supervisors = JSON.parse(data[i][4] || '[]');
    } catch (err) {
      supervisors = [];
    }

    const totalDays = tasks.reduce((max, t) => Math.max(max, Number(t.diaFin) || 0), 0);

    summaries.push({
      caseId: caseId,
      startDate: toPlainDateString_(data[i][1]),
      totalDurationDays: totalDays,
      taskCount: tasks.length,
      lastUpdated: toPlainDateString_(data[i][3]),
      supervisors: supervisors
    });
  }

  return summaries;
}

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const caseId = body.caseId;
  if (!caseId) {
    return jsonResponse_({ error: 'Missing caseId' }, 400);
  }
  const startDate = body.startDate || '';
  const tasks = body.tasks || [];
  const supervisors = body.supervisors || [];
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  
  const sheet = getSheet_();
  const row = findRowByCaseId_(sheet, caseId);
  
  if (row === -1) {
    // Append new
    sheet.appendRow([caseId, startDate, JSON.stringify(tasks), timestamp, JSON.stringify(supervisors)]);
  } else {
    // Update existing
    sheet.getRange(row, 2).setValue(startDate);
    sheet.getRange(row, 3).setValue(JSON.stringify(tasks));
    sheet.getRange(row, 4).setValue(timestamp);
    sheet.getRange(row, 5).setValue(JSON.stringify(supervisors));
  }

  return jsonResponse_({ success: true, lastUpdated: timestamp });
}

function jsonResponse_(obj, statusCode) {
  const output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
