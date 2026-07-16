// Schedule Tool - editable per-case task schedule with milestone sections
// Data is stored per Case ID in a shared Google Sheet (via Apps Script Web App),
// with the browser's localStorage used as an offline cache/fallback.

// Paste the Apps Script "Web app" URL here once deployed (see SCHEDULE_SETUP.md).
// Leave empty to run in local-only mode (localStorage per browser).
const SCHEDULE_API_URL = 'https://script.google.com/macros/s/AKfycbwYIOCBPcOb1fjwEIpu_Cw_mSEjEvo-ZzvpivfkEM7QDN6WmkdvQ1hjametLHP4VBVn/exec';

const SCHEDULE_STORAGE_PREFIX = 'mit_schedule_';

// Set of Case IDs that currently have a saved schedule, used to badge the
// main Cases Report table. Populated from the shared Google Sheet on load.
let scheduledCaseIds = new Set();

async function loadScheduledCaseIdsSet() {
    if (!SCHEDULE_API_URL) return;
    try {
        const res = await fetch(`${SCHEDULE_API_URL}?list=true`);
        const data = await res.json();
        scheduledCaseIds = new Set((data.schedules || []).map(s => s.caseId));
        if (typeof applyFilters === 'function') applyFilters();
    } catch (err) {
        console.error('Could not load list of scheduled cases:', err);
    }
}

// Opens the Schedule Tool section and loads a specific Case ID's schedule,
// used by the "📅 Set" badge in the main Cases Report table.
function openScheduleForCaseId(caseId) {
    const section = document.getElementById('schedule-section');
    section.classList.remove('hidden');
    populateScheduleCaseList();
    document.getElementById('schedule-case-id').value = caseId;
    loadScheduleForCurrentCaseId();
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Default "SUBSTANCIAL" template, grouped into 4 sections (6/6/7/6 tasks)
const SCHEDULE_TEMPLATE = [
    { section: 1, frente: 'Exterior', tarea: 'Remoción de Paneles, Gatos, Andamios', diaInicio: 1, diaFin: 2 },
    { section: 1, frente: 'Exterior', tarea: 'Limpieza de Site', diaInicio: 1, diaFin: 3 },
    { section: 1, frente: 'Interior', tarea: 'Alambrado Eléctrico (final)', diaInicio: 3, diaFin: 6 },
    { section: 1, frente: 'Interior', tarea: 'Preparación Empañetado - Corner Bead / Cerobon', diaInicio: 6, diaFin: 8 },
    { section: 1, frente: 'Interior', tarea: 'Empañetado Interior', diaInicio: 8, diaFin: 15 },
    { section: 1, frente: 'Exterior', tarea: 'Empañetado Exterior', diaInicio: 12, diaFin: 18 },

    { section: 2, frente: 'Exterior', tarea: 'Sellado de Techo', diaInicio: 4, diaFin: 6 },
    { section: 2, frente: 'Interior', tarea: 'Topping', diaInicio: 2, diaFin: 6 },
    { section: 2, frente: 'Interior', tarea: 'Losa Piso / Losa Baño', diaInicio: 6, diaFin: 11 },
    { section: 2, frente: 'Interior', tarea: 'Pintura - Primer', diaInicio: 11, diaFin: 14 },
    { section: 2, frente: 'Interior', tarea: 'Pintura - 1era Mano', diaInicio: 14, diaFin: 17 },
    { section: 2, frente: 'Interior', tarea: 'Pintura - 2da Mano', diaInicio: 17, diaFin: 20 },

    { section: 3, frente: 'Interior', tarea: 'Puertas Exteriores / Ventanas / Puertas Closets', diaInicio: 20, diaFin: 24 },
    { section: 3, frente: 'Interior', tarea: 'Puertas Interiores / Cerraduras / Racks Closets', diaInicio: 24, diaFin: 27 },
    { section: 3, frente: 'Interior', tarea: 'Plomería - Llaves de paso / Mezcladoras / Duchas', diaInicio: 27, diaFin: 29 },
    { section: 3, frente: 'Interior', tarea: 'Electricidad - Abanicos / Switches / Outlets', diaInicio: 29, diaFin: 31 },
    { section: 3, frente: 'Interior', tarea: 'Gabinetes - Cocina / Vanity', diaInicio: 31, diaFin: 35 },
    { section: 3, frente: 'Interior', tarea: 'Backsplash', diaInicio: 35, diaFin: 37 },
    { section: 3, frente: 'Interior', tarea: 'Equipos - Nevera / Estufa / Inodoro / Accesorios', diaInicio: 37, diaFin: 39 },

    { section: 4, frente: 'Exterior', tarea: 'Calentador Solar', diaInicio: 6, diaFin: 7 },
    { section: 4, frente: 'Exterior', tarea: 'Cisterna', diaInicio: 6, diaFin: 10 },
    { section: 4, frente: 'Exterior', tarea: 'Placas Solares', diaInicio: 7, diaFin: 9 },
    { section: 4, frente: 'Exterior', tarea: 'Carpad / Acera', diaInicio: 10, diaFin: 16 },
    { section: 4, frente: 'Exterior', tarea: 'TopSoil / Grama', diaInicio: 16, diaFin: 21 },
    { section: 4, frente: 'Ambos', tarea: 'Limpieza General', diaInicio: 39, diaFin: 41 },
];

let scheduleData = null; // { caseId, startDate, tasks: [...] }
let scheduleSaveTimeout = null;

function getDefaultSchedule() {
    return {
        startDate: '',
        tasks: SCHEDULE_TEMPLATE.map(t => ({ ...t }))
    };
}

function loadScheduleLocal(caseId) {
    if (!caseId) return getDefaultSchedule();
    const raw = localStorage.getItem(SCHEDULE_STORAGE_PREFIX + caseId);
    if (!raw) return getDefaultSchedule();
    try {
        const parsed = JSON.parse(raw);
        if (!parsed.tasks || !parsed.tasks.length) return getDefaultSchedule();
        return parsed;
    } catch (e) {
        return getDefaultSchedule();
    }
}

// Loads a schedule for a Case ID, preferring the shared Google Sheet backend
// when configured, falling back to the local browser cache if offline or unset.
async function loadSchedule(caseId) {
    if (!caseId) return getDefaultSchedule();

    if (SCHEDULE_API_URL) {
        try {
            setSaveStatus('Loading...');
            const res = await fetch(`${SCHEDULE_API_URL}?caseId=${encodeURIComponent(caseId)}`);
            const data = await res.json();
            if (data.found) {
                const schedule = { startDate: data.startDate || '', tasks: data.tasks || [] };
                localStorage.setItem(SCHEDULE_STORAGE_PREFIX + caseId, JSON.stringify(schedule));
                setSaveStatus('Loaded from shared sheet ✓');
                return schedule;
            }
            setSaveStatus('');
            return getDefaultSchedule();
        } catch (err) {
            console.error('Could not reach shared schedule sheet, using local cache:', err);
            setSaveStatus('Offline - using local copy', true);
            return loadScheduleLocal(caseId);
        }
    }

    return loadScheduleLocal(caseId);
}

async function saveSchedule() {
    const caseId = document.getElementById('schedule-case-id').value.trim();
    if (!caseId) {
        setSaveStatus('Enter a Case ID to save.', true);
        return;
    }

    // Always keep a local cache so the tool still works offline.
    localStorage.setItem(SCHEDULE_STORAGE_PREFIX + caseId, JSON.stringify(scheduleData));

    if (!SCHEDULE_API_URL) {
        setSaveStatus('Saved (this browser only) ✓');
        return;
    }

    try {
        setSaveStatus('Saving...');
        await fetch(SCHEDULE_API_URL, {
            method: 'POST',
            body: JSON.stringify({
                caseId,
                startDate: scheduleData.startDate,
                tasks: scheduleData.tasks
            })
        });
        setSaveStatus('Saved to shared sheet ✓');
        refreshScheduleReportIfOpen();
        loadScheduledCaseIdsSet();
    } catch (err) {
        console.error('Could not save to shared schedule sheet, kept local copy only:', err);
        setSaveStatus('Saved locally only (offline)', true);
    }
}

// If the Schedules Report is currently open, silently refresh it so newly
// saved/edited cases show up right away instead of only on next open.
function refreshScheduleReportIfOpen() {
    const section = document.getElementById('schedule-report-section');
    if (section && !section.classList.contains('hidden')) {
        loadSchedulesReport();
    }
}

function scheduleAutoSave() {
    clearTimeout(scheduleSaveTimeout);
    scheduleSaveTimeout = setTimeout(saveSchedule, 400);
}

function setSaveStatus(msg, isError) {
    const el = document.getElementById('schedule-save-status');
    if (!el) return;
    el.textContent = msg;
    el.style.color = isError ? '#e53e3e' : '#38a169';
    if (!isError) {
        setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 2000);
    }
}

// Adds `days` (0-indexed offset) to a YYYY-MM-DD date string, returns formatted date or ''
function addDaysToDate(dateStr, dayNumber) {
    if (!dateStr || !dayNumber && dayNumber !== 0) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return '';
    const base = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    base.setDate(base.getDate() + (Number(dayNumber) - 1));
    return base.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

// Builds the same rows shown on screen (tasks grouped into 4 sections, with
// Milestone Goal / total duration rows), as plain arrays for export.
function buildScheduleExportRows() {
    const startDate = document.getElementById('schedule-start-date').value;
    const rows = [['#', 'Frente', 'Tarea', 'Día Inicio', 'Día Fin', 'Duración (días)']];
    let rowNum = 0;

    [1, 2, 3, 4].forEach(sectionNum => {
        const sectionTasks = scheduleData.tasks.filter(t => t.section === sectionNum);

        sectionTasks.forEach(t => {
            rowNum++;
            const duracion = (Number(t.diaFin) || 0) - (Number(t.diaInicio) || 0);
            rows.push([rowNum, t.frente, t.tarea, t.diaInicio, t.diaFin, duracion]);
        });

        const maxDiaFin = Math.max(...sectionTasks.map(t => Number(t.diaFin) || 0), 0);
        const isLast = sectionNum === 4;
        if (isLast) {
            rows.push(['', '', '', '', 'DURACIÓN TOTAL DEL PROYECTO (días)', maxDiaFin]);
        } else {
            const milestoneDate = addDaysToDate(startDate, maxDiaFin);
            rows.push(['', '', '', '', 'Milestone Goal', milestoneDate || '—']);
        }
    });

    return rows;
}

function exportScheduleToExcel() {
    const caseId = document.getElementById('schedule-case-id').value.trim();
    if (!scheduleData || !scheduleData.tasks.length) {
        alert('Load or create a schedule first.');
        return;
    }

    const rows = buildScheduleExportRows();
    const csv = ['﻿' + `Case ID: ${caseId || 'N/A'} - Start Date: ${document.getElementById('schedule-start-date').value || 'N/A'}`];
    rows.forEach(row => {
        csv.push(row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','));
    });

    const csvFile = new Blob([csv.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const downloadLink = document.createElement('a');
    downloadLink.download = `Schedule_${caseId || 'export'}.csv`;
    downloadLink.href = window.URL.createObjectURL(csvFile);
    downloadLink.style.display = 'none';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
}

function exportScheduleToPdf() {
    const caseId = document.getElementById('schedule-case-id').value.trim();
    if (!scheduleData || !scheduleData.tasks.length) {
        alert('Load or create a schedule first.');
        return;
    }

    const rows = buildScheduleExportRows();
    const startDate = document.getElementById('schedule-start-date').value || 'N/A';

    const tableRowsHtml = rows.slice(1).map(row => {
        const isMilestone = String(row[4]).includes('Milestone') || String(row[4]).includes('DURACIÓN');
        return `<tr style="${isMilestone ? 'background:#edf2f7;font-weight:700;' : ''}">${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`;
    }).join('');

    const headerHtml = rows[0].map(h => `<th>${h}</th>`).join('');

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
        <head>
            <title>Schedule - ${caseId || 'Export'}</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                h1 { font-size: 18px; }
                p { font-size: 13px; color: #444; }
                table { border-collapse: collapse; width: 100%; margin-top: 15px; }
                th, td { border: 1px solid #ccc; padding: 6px 10px; font-size: 12px; text-align: left; }
                th { background: #f0f0f0; }
            </style>
        </head>
        <body>
            <h1>Substantial Phase Schedule</h1>
            <p><strong>Case ID:</strong> ${caseId || 'N/A'} &nbsp;|&nbsp; <strong>Start Date:</strong> ${startDate}</p>
            <table>
                <thead><tr>${headerHtml}</tr></thead>
                <tbody>${tableRowsHtml}</tbody>
            </table>
        </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
}

function renderScheduleTable() {
    const tbody = document.getElementById('schedule-table-body');
    const startDate = document.getElementById('schedule-start-date').value;
    let html = '';
    let rowNum = 0;
    const sections = [1, 2, 3, 4];

    sections.forEach(sectionNum => {
        const rows = scheduleData.tasks
            .map((t, idx) => ({ ...t, idx }))
            .filter(t => t.section === sectionNum);

        rows.forEach(t => {
            rowNum++;
            const duracion = (Number(t.diaFin) || 0) - (Number(t.diaInicio) || 0);
            html += `
                <tr data-idx="${t.idx}">
                    <td>${rowNum}</td>
                    <td>
                        <select class="sched-input sched-frente" data-idx="${t.idx}">
                            <option value="Exterior" ${t.frente === 'Exterior' ? 'selected' : ''}>Exterior</option>
                            <option value="Interior" ${t.frente === 'Interior' ? 'selected' : ''}>Interior</option>
                            <option value="Ambos" ${t.frente === 'Ambos' ? 'selected' : ''}>Ambos</option>
                        </select>
                    </td>
                    <td><input type="text" class="sched-input sched-tarea" data-idx="${t.idx}" value="${(t.tarea || '').replace(/"/g, '&quot;')}"></td>
                    <td><input type="number" class="sched-input sched-num sched-dia-inicio" data-idx="${t.idx}" value="${t.diaInicio}"></td>
                    <td><input type="number" class="sched-input sched-num sched-dia-fin" data-idx="${t.idx}" value="${t.diaFin}"></td>
                    <td>${duracion}</td>
                    <td><button type="button" class="sched-remove-btn" data-idx="${t.idx}" title="Remove task">&times;</button></td>
                </tr>
            `;
        });

        const maxDiaFin = Math.max(...rows.map(t => Number(t.diaFin) || 0), 0);
        const milestoneDate = addDaysToDate(startDate, maxDiaFin);
        const isLast = sectionNum === 4;
        html += `
            <tr class="milestone-row">
                <td colspan="5">${isLast ? 'DURACIÓN TOTAL DEL PROYECTO (días)' : 'Milestone Goal'}</td>
                <td>${isLast ? maxDiaFin : (milestoneDate || '—')}</td>
                <td></td>
            </tr>
        `;
    });

    tbody.innerHTML = html;

    tbody.querySelectorAll('.sched-input').forEach(input => {
        input.addEventListener('input', onScheduleInputChange);
        input.addEventListener('change', onScheduleInputChange);
    });

    tbody.querySelectorAll('.sched-remove-btn').forEach(btn => {
        btn.addEventListener('click', onScheduleRemoveTask);
    });
}

function onScheduleRemoveTask(e) {
    const idx = Number(e.target.dataset.idx);
    if (!confirm('Remove this task from the schedule?')) return;
    scheduleData.tasks.splice(idx, 1);
    renderScheduleTable();
    scheduleAutoSave();
}

function onScheduleInputChange(e) {
    const idx = Number(e.target.dataset.idx);
    if (e.target.classList.contains('sched-frente')) {
        scheduleData.tasks[idx].frente = e.target.value;
    } else if (e.target.classList.contains('sched-tarea')) {
        scheduleData.tasks[idx].tarea = e.target.value;
    } else if (e.target.classList.contains('sched-dia-inicio')) {
        scheduleData.tasks[idx].diaInicio = Number(e.target.value) || 0;
    } else if (e.target.classList.contains('sched-dia-fin')) {
        scheduleData.tasks[idx].diaFin = Number(e.target.value) || 0;
    }
    renderScheduleTable();
    scheduleAutoSave();
}

async function loadScheduleForCurrentCaseId() {
    const caseId = document.getElementById('schedule-case-id').value.trim();
    scheduleData = await loadSchedule(caseId);
    document.getElementById('schedule-start-date').value = scheduleData.startDate || '';
    renderScheduleTable();
    updateScheduleCaseInfo(caseId);
}

function updateScheduleCaseInfo(caseId) {
    const infoEl = document.getElementById('schedule-case-info');
    if (!infoEl) return;

    const match = Array.isArray(allCases) ? allCases.find(c => c['Case ID'] === caseId) : null;

    if (!caseId) {
        infoEl.classList.add('hidden');
        infoEl.innerHTML = '';
        return;
    }

    if (!match) {
        infoEl.classList.remove('hidden');
        infoEl.innerHTML = `<span class="schedule-case-info-warning">No match found on the map for Case ID "${caseId}".</span>`;
        return;
    }

    infoEl.classList.remove('hidden');
    infoEl.innerHTML = `
        <span><strong>Municipality:</strong> ${match.Municipality || 'N/A'}</span>
        <span><strong>Region:</strong> ${match.Region || 'N/A'}</span>
        <span><strong>Award Type:</strong> ${match['Award Type Equivalent'] || 'N/A'}</span>
        <span><strong>Subcontractor:</strong> ${match['Subcontractor Name'] || 'N/A'}</span>
        <span><strong>Stage Status:</strong> ${match['Stage Status'] || 'N/A'}</span>
    `;
}

async function loadSchedulesReport() {
    const section = document.getElementById('schedule-report-section');
    const statusEl = document.getElementById('schedule-report-status');
    const tbody = document.getElementById('schedule-report-table-body');

    section.classList.remove('hidden');

    if (!SCHEDULE_API_URL) {
        statusEl.textContent = 'Shared reporting is not available yet (no Google Sheet connected).';
        statusEl.style.color = '#e53e3e';
        tbody.innerHTML = '';
        return;
    }

    statusEl.textContent = 'Loading...';
    statusEl.style.color = '#4a5568';

    try {
        const res = await fetch(`${SCHEDULE_API_URL}?list=true`);
        const data = await res.json();
        const schedules = data.schedules || [];

        if (!schedules.length) {
            statusEl.textContent = 'No schedules have been saved yet.';
            tbody.innerHTML = '';
            return;
        }

        statusEl.textContent = `${schedules.length} schedule(s) found.`;

        tbody.innerHTML = schedules.map(s => {
            const match = Array.isArray(allCases) ? allCases.find(c => c['Case ID'] === s.caseId) : null;
            const endDate = addDaysToDate(s.startDate, s.totalDurationDays) || '—';
            return `
                <tr>
                    <td>${s.caseId}</td>
                    <td>${match ? match.Municipality : 'N/A'}</td>
                    <td>${s.startDate || 'N/A'}</td>
                    <td>${s.totalDurationDays || 0}</td>
                    <td>${endDate}</td>
                    <td>${s.lastUpdated || 'N/A'}</td>
                    <td><button type="button" class="btn schedule-report-view-btn" data-case-id="${s.caseId}">View</button></td>
                </tr>
            `;
        }).join('');

        tbody.querySelectorAll('.schedule-report-view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const caseId = e.target.dataset.caseId;
                document.getElementById('schedule-case-id').value = caseId;
                loadScheduleForCurrentCaseId();
                document.getElementById('schedule-table').scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        });
    } catch (err) {
        console.error('Could not load schedules report:', err);
        statusEl.textContent = 'Could not reach the shared Google Sheet. Check your connection.';
        statusEl.style.color = '#e53e3e';
    }
}

function populateScheduleCaseList() {
    const datalist = document.getElementById('schedule-case-list');
    if (!datalist || !Array.isArray(allCases)) return;
    const ids = Array.from(new Set(allCases.map(c => c['Case ID']).filter(Boolean))).sort();
    datalist.innerHTML = ids.map(id => `<option value="${id}"></option>`).join('');
}

document.addEventListener('DOMContentLoaded', () => {
    loadScheduledCaseIdsSet();

    document.getElementById('btn-schedule-tool').addEventListener('click', () => {
        const section = document.getElementById('schedule-section');
        section.classList.toggle('hidden');
        if (!section.classList.contains('hidden')) {
            populateScheduleCaseList();
            if (!scheduleData) {
                scheduleData = getDefaultSchedule();
                renderScheduleTable();
            }
        }
    });

    document.getElementById('btn-schedule-load').addEventListener('click', loadScheduleForCurrentCaseId);

    document.getElementById('btn-schedule-report').addEventListener('click', () => {
        // Always refresh with the latest data when clicked, whether it's
        // opening for the first time or already visible.
        loadSchedulesReport();
    });

    document.getElementById('btn-schedule-export-excel').addEventListener('click', exportScheduleToExcel);
    document.getElementById('btn-schedule-export-pdf').addEventListener('click', exportScheduleToPdf);

    document.getElementById('schedule-case-id').addEventListener('input', (e) => {
        updateScheduleCaseInfo(e.target.value.trim());
    });

    document.getElementById('btn-schedule-reset').addEventListener('click', () => {
        if (!confirm('Reset this schedule back to the default template? Unsaved changes for this Case ID will be replaced.')) return;
        const startDate = document.getElementById('schedule-start-date').value;
        scheduleData = getDefaultSchedule();
        scheduleData.startDate = startDate;
        renderScheduleTable();
        scheduleAutoSave();
    });

    document.getElementById('schedule-start-date').addEventListener('change', (e) => {
        if (!scheduleData) scheduleData = getDefaultSchedule();
        scheduleData.startDate = e.target.value;
        renderScheduleTable();
        scheduleAutoSave();
    });
});
