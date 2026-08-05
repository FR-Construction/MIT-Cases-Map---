let map;
let markers = [];
let markerCluster = null;
const LABEL_MIN_ZOOM = 12; // Case ID labels only show once zoomed in past this level
let allCases = [];
let choicesInstances = {};
window.tableSupervisorChoices = [];

// Custom renderer for grouped-marker clusters: bigger, dark-blue circles with
// the case count, growing slightly as more cases stack into one cluster.
const clusterRenderer = {
    render({ count, position }) {
        const scale = Math.min(26 + count * 0.6, 42);
        return new google.maps.Marker({
            position,
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                fillColor: '#1a365d',
                fillOpacity: 0.9,
                strokeColor: '#ffffff',
                strokeWeight: 2,
                scale: scale,
            },
            label: {
                text: String(count),
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: 'bold',
            },
            zIndex: 1000 + count,
        });
    }
};

// Handle URL parameters for view modes
const urlParams = new URLSearchParams(window.location.search);
const viewMode = urlParams.get('view'); // 'map' or 'table'

// Initialize and add the map
function initMap() {
    // Center of Puerto Rico
    const prCenter = { lat: 18.2208, lng: -66.5901 };

    // The map, centered at Puerto Rico
    map = new google.maps.Map(document.getElementById("map"), {
        zoom: 9,
        center: prCenter,
        mapTypeId: "roadmap", // 'roadmap' is the standard non-satellite view
        mapTypeControl: false, // Disable map type switching
        streetViewControl: false,
        fullscreenControl: true,
        styles: [ // Optional: Add a subtle style to make it look cleaner
            {
                "featureType": "poi",
                "stylers": [{ "visibility": "off" }]
            },
            {
                "featureType": "transit",
                "stylers": [{ "visibility": "off" }]
            }
        ]
    });

    // Draw the dividing red line (dotted/dashed)
    const lineSymbol = {
        path: 'M 0,-1 0,1',
        strokeOpacity: 1,
        strokeColor: "#FF0000",
        scale: 3
    };

    const dividingLineCoords = [
        { lat: 18.33, lng: -67.26 }, // Rincon area
        { lat: 18.25, lng: -67.14 }, // South of Añasco
        { lat: 18.17, lng: -66.72 }, // Adjuntas
        { lat: 18.22, lng: -66.38 }, // Orocovis
        { lat: 18.21, lng: -66.15 }, // Cidra
        { lat: 18.21, lng: -65.98 }, // San Lorenzo
        { lat: 18.23, lng: -65.71 }, // Naguabo
        { lat: 18.28, lng: -65.61 }  // Fajardo
    ];
    
    const dividingLine = new google.maps.Polyline({
        path: dividingLineCoords,
        geodesic: true,
        strokeOpacity: 0, // Hide the solid line
        icons: [{
            icon: lineSymbol,
            offset: '0',
            repeat: '15px'
        }],
    });
    dividingLine.setMap(map);

    // Show/hide Case ID labels as the user zooms in or out
    map.addListener('zoom_changed', updateMarkerLabelVisibility);

    // Fetch data and plot markers
    fetchDataAndPlot();
}

function updateMarkerLabelVisibility() {
    const showLabels = map.getZoom() >= LABEL_MIN_ZOOM;
    markers.forEach(m => {
        if (m.caseLabel) {
            m.setLabel(showLabels ? m.caseLabel : null);
        }
    });
}

async function fetchDataAndPlot() {
    try {
        // Add a timestamp to prevent caching the JSON file
        const response = await fetch(`cases.json?t=${new Date().getTime()}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const cases = await response.json();
        allCases = cases;
        
        try {
            const lastUpdateRes = await fetch(`last_update.json?t=${new Date().getTime()}`);
            if (lastUpdateRes.ok) {
                const updateData = await lastUpdateRes.json();
                document.getElementById('last-updated-text').textContent = `Data Last Updated: ${updateData.last_update}`;
            }
        } catch (e) {
            document.getElementById('last-updated-text').textContent = `Data Last Updated: Unknown`;
        }
        
        populateFilters();
        applyFilters(); // This will call plotMarkers, generateSummary, and generateTable
        
        // Hide loading overlay
        document.getElementById('loading-overlay').classList.remove('active');

        // Apply View Modes
        if (viewMode === 'map') {
            document.getElementById('table-section').style.display = 'none';
        } else if (viewMode === 'table') {
            // Already handled in initMap but just in case
        }

        // Setup Pop-out buttons
        document.getElementById('btn-popout-map').addEventListener('click', () => {
            window.open(window.location.pathname + '?view=map', '_blank', 'width=1000,height=700');
        });
        document.getElementById('btn-popout-table').addEventListener('click', () => {
            window.open(window.location.pathname + '?view=table', '_blank', 'width=1000,height=700');
        });
        
        document.getElementById('btn-export-excel')?.addEventListener('click', () => {
            exportToExcel();
        });
        
    } catch (error) {
        console.error("Could not load cases.json:", error);
        document.getElementById('loading-overlay').innerHTML = `<p style="color: red; font-weight: bold;">Error loading data. Check console.</p>`;
    }
}

function plotMarkers(cases) {
    if (viewMode === 'table') return; // Skip map plotting

    // Clear existing markers and clustering
    if (markerCluster) {
        markerCluster.clearMarkers();
    }
    markers.forEach(m => m.setMap(null));
    markers = [];

    const infoWindow = new google.maps.InfoWindow();

    cases.forEach(caseData => {
        // Skip cases without coordinates
        if (!caseData.Coordinates) return;

        // Parse coordinates "Lat, Lng" or use objects if provided directly
        let lat, lng;
        if (typeof caseData.Coordinates === 'string') {
            const parts = caseData.Coordinates.split(',');
            if (parts.length === 2) {
                lat = parseFloat(parts[0].trim());
                lng = parseFloat(parts[1].trim());
            }
        } else {
            // If already parsed in python
            lat = caseData.Coordinates.lat;
            lng = caseData.Coordinates.lng;
        }

        if (isNaN(lat) || isNaN(lng)) return;

        const position = { lat, lng };
        
        // Determine Marker Color based on Type
        let markerColor = "#000000"; // Default
        const region = caseData.Region; // "Norte" or "Sur"
        const caseType = caseData['Award Type Equivalent'] || "";

        if (caseType.toLowerCase().includes("relo")) {
            markerColor = "#3182ce"; // Blue
        } else {
            markerColor = "#e53e3e"; // Red
        }

        // SVG Marker definition
        const svgMarker = {
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: markerColor,
            fillOpacity: 0.9,
            strokeWeight: 2,
            strokeColor: "#ffffff",
            scale: 7, // Size of the marker
            labelOrigin: new google.maps.Point(0, -10), // push the Case ID label above the dot
        };

        const caseLabel = {
            text: caseData['Case ID'] || '',
            color: '#1a202c',
            fontSize: '11px',
            fontWeight: '700',
            className: 'marker-case-label'
        };

        const marker = new google.maps.Marker({
            position: position,
            icon: svgMarker,
            label: map.getZoom() >= LABEL_MIN_ZOOM ? caseLabel : null,
            title: `${caseData.Municipality} - ${caseData['Award Type Equivalent']}`
        });
        marker.caseLabel = caseLabel; // stashed so we can show/hide it as the zoom level changes

        // Add Click listener for InfoWindow
        marker.addListener("click", () => {
            const contentString = `
                <div class="info-window">
                    <h3>Case ID: ${caseData['Case ID'] || 'N/A'}</h3>
                    <p><strong>Municipality:</strong> ${caseData.Municipality}</p>
                    <p><strong>Subcontractor:</strong> ${caseData['Subcontractor Name'] || 'N/A'}</p>
                    <p><strong>Type:</strong> ${caseData['Award Type Equivalent']}</p>
                    <p><strong>Region:</strong> ${region}</p>
                    <p><strong>Status:</strong> ${caseData['Stage Status'] || 'N/A'}</p>
                </div>
            `;
            infoWindow.setContent(contentString);
            infoWindow.open({
                anchor: marker,
                map,
            });
        });

        markers.push(marker);
    });

    // Group nearby markers into a single numbered cluster when zoomed out;
    // they split apart into individual pins as you zoom in.
    if (typeof markerClusterer !== 'undefined' && markerClusterer.MarkerClusterer) {
        markerCluster = new markerClusterer.MarkerClusterer({ map, markers, renderer: clusterRenderer });
    } else {
        // Fallback if the clustering library failed to load: show pins directly.
        markers.forEach(m => m.setMap(map));
    }
}

function generateSummary(cases) {
    if (viewMode === 'table') return; // Skip summary
    
    const summary = {
        North: { total: 0, relo: 0, recon: 0 },
        South: { total: 0, relo: 0, recon: 0 }
    };

    cases.forEach(c => {
        const r = c.Region;
        if (summary[r]) {
            summary[r].total++;
            const t = (c['Award Type Equivalent'] || '').toLowerCase();
            if (t.includes('relo')) summary[r].relo++;
            else summary[r].recon++;
        }
    });

    const content = document.querySelector('.summary-content');
    content.innerHTML = `
        <div class="summary-region">
            <h4>North (Total: ${summary.North.total})</h4>
            <div class="summary-stats">
                <span><span class="marker relo" style="width:10px;height:10px;margin-right:5px;"></span> Relo: ${summary.North.relo}</span>
                <span><span class="marker recon" style="width:10px;height:10px;margin-right:5px;"></span> Recon: ${summary.North.recon}</span>
            </div>
        </div>
        <div class="summary-region">
            <h4>South (Total: ${summary.South.total})</h4>
            <div class="summary-stats">
                <span><span class="marker relo" style="width:10px;height:10px;margin-right:5px;"></span> Relo: ${summary.South.relo}</span>
                <span><span class="marker recon" style="width:10px;height:10px;margin-right:5px;"></span> Recon: ${summary.South.recon}</span>
            </div>
        </div>
    `;
    document.getElementById('summary-report').classList.remove('hidden');
}

function generateTable(cases) {
    if (viewMode === 'map') return; // Skip table

    const tableBody = document.getElementById('cases-table-body');
    
    // Destroy previous Choices instances to prevent memory leaks
    if (window.tableSupervisorChoices) {
        window.tableSupervisorChoices.forEach(c => c.destroy());
    }
    window.tableSupervisorChoices = [];

    let tableHtml = '';
    cases.forEach(c => {
        let sub = c['Subcontractor Name'] || 'N/A';
        if (typeof sub === 'string') {
            sub = sub.replace(/\n/g, '<br>');
        }

        const caseId = c['Case ID'] || '';
        const hasSchedule = window.scheduledCaseIds && window.scheduledCaseIds.has(caseId);
        const startDateStr = window.scheduledCaseDates ? window.scheduledCaseDates.get(caseId) : '';
        const scheduleCell = hasSchedule
            ? `<button type="button" class="schedule-badge schedule-badge-set" data-case-id="${caseId}">📅 Scheduled ${startDateStr ? '(' + startDateStr + ')' : ''}</button>`
            : `<button type="button" class="schedule-badge schedule-badge-create" data-case-id="${caseId}">+ Add Schedule</button>`;

        let selectedSups = [];
        if (window.scheduledCaseSupervisors && window.scheduledCaseSupervisors.has(caseId)) {
            const sups = window.scheduledCaseSupervisors.get(caseId);
            if (Array.isArray(sups)) selectedSups = sups;
        }
        
        // Build options for select
        const supervisorsList = [
            "Jose L. Mundo", "Jose Garces", "Jose Negrón", "Harry Velez",
            "Christian Bonilla", "Jangel Sanchez", "Samuel Santiago",
            "Jaime Rivera", "Rafael Morales", "Jose Velez", "Eliezer Aponte"
        ];
        
        let optionsHtml = supervisorsList.map(s => {
            const isSelected = selectedSups.includes(s) ? 'selected' : '';
            return `<option value="${s}" ${isSelected}>${s}</option>`;
        }).join('');

        tableHtml += `
            <tr>
                <td>${c['Case ID'] || 'N/A'}</td>
                <td>${c.Municipality || 'N/A'}</td>
                <td>${c.Region || 'N/A'}</td>
                <td>${c['Award Type Equivalent'] || 'N/A'}</td>
                <td>${sub}</td>
                <td>${c['Stage Status'] || 'N/A'}</td>
                <td>${c['Model Home Design Selection'] || 'N/A'}</td>
                <td>${c['Days Since Last Milestone Inspection'] || 'N/A'}</td>
                <td style="min-width: 200px;">
                    <div style="position: relative;">
                        <span class="save-status-indicator" id="status-${caseId}" style="position: absolute; top: -18px; right: 0; font-size: 0.75rem; color: #38a169; font-weight: bold;"></span>
                        <select class="table-supervisor-select" data-case-id="${caseId}" multiple>
                            ${optionsHtml}
                        </select>
                    </div>
                </td>
                <td>${scheduleCell}</td>
            </tr>
        `;
    });
    tableBody.innerHTML = tableHtml;

    // Initialize Choices for all selects in table
    const selects = tableBody.querySelectorAll('.table-supervisor-select');
    selects.forEach(select => {
        const choice = new Choices(select, {
            removeItemButton: true,
            searchEnabled: true,
            placeholder: true,
            placeholderValue: 'Assign...',
            itemSelectText: ''
        });
        window.tableSupervisorChoices.push(choice);
        
        // Handle saving when changed
        select.addEventListener('change', async (e) => {
            const caseId = e.target.dataset.caseId;
            const vals = choice.getValue(true);
            const newSups = Array.isArray(vals) ? vals : (vals ? [vals] : []);
            
            // Update local map immediately and write to localStorage
            if (window.scheduledCaseSupervisors) {
                window.scheduledCaseSupervisors.set(caseId, newSups);
            }
            try {
                localStorage.setItem('mit_supervisors_' + caseId, JSON.stringify(newSups));
            } catch(e){}
            
            const statusEl = document.getElementById(`status-${caseId}`);
            if (statusEl) {
                statusEl.textContent = 'Saving...';
                statusEl.style.color = '#d69e2e'; // yellow
            }
            
            try {
                // Fetch existing schedule
                let existingTasks = [];
                let existingStart = '';
                const apiUrl = window.SCHEDULE_API_URL || (typeof SCHEDULE_API_URL !== 'undefined' ? SCHEDULE_API_URL : null);
                
                if (apiUrl) {
                    const res = await fetch(`${apiUrl}?caseId=${encodeURIComponent(caseId)}`);
                    const data = await res.json();
                    if (data.found) {
                        existingTasks = data.tasks || [];
                        existingStart = data.startDate || '';
                    }
                    
                    await fetch(apiUrl, {
                        method: 'POST',
                        body: JSON.stringify({
                            caseId: caseId,
                            startDate: existingStart,
                            tasks: existingTasks,
                            supervisors: newSups
                        })
                    });
                    
                    if (statusEl) {
                        statusEl.textContent = 'Saved ✓';
                        statusEl.style.color = '#38a169'; // green
                        setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000);
                    }
                } else {
                    throw new Error('API URL not found');
                }
            } catch (err) {
                console.error('Error saving supervisor from table:', err);
                if (statusEl) {
                    statusEl.textContent = 'Error';
                    statusEl.style.color = '#e53e3e'; // red
                }
            }
        });
    });

    tableBody.querySelectorAll('.schedule-badge-set, .schedule-badge-create').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const caseId = e.currentTarget.dataset.caseId;
            if (typeof openScheduleForCaseId === 'function') {
                openScheduleForCaseId(caseId);
            }
        });
    });
}

function populateFilters() {
    const statuses = new Set();
    const municipalities = new Set();
    const subcontractors = new Set();
    const types = new Set();
    const regions = new Set();
    const models = new Set();

    allCases.forEach(c => {
        if (c['Stage Status']) statuses.add(c['Stage Status']);
        if (c.Municipality) municipalities.add(c.Municipality);
        if (c['Subcontractor Name']) subcontractors.add(c['Subcontractor Name']);
        if (c['Award Type Equivalent']) types.add(c['Award Type Equivalent']);
        if (c.Region) regions.add(c.Region);
        if (c['Model Home Design Selection']) models.add(c['Model Home Design Selection']);
    });

    populateSelect('filter-status', Array.from(statuses).sort());
    populateSelect('filter-municipality', Array.from(municipalities).sort());
    populateSelect('filter-subcontractor', Array.from(subcontractors).sort());
    populateSelect('filter-type', Array.from(types).sort());
    populateSelect('filter-region', Array.from(regions).sort());
    populateSelect('filter-schedule', ['Has Schedule', 'No Schedule']);
    populateSelect('filter-model', Array.from(models).sort());

    document.getElementById('search-case').addEventListener('input', applyFilters);
}

function populateSelect(id, values) {
    const selectEl = document.getElementById(id);
    const options = values.map(v => ({ value: v, label: v }));
    
    if (choicesInstances[id]) {
        choicesInstances[id].destroy();
    }
    
    choicesInstances[id] = new Choices(selectEl, {
        removeItemButton: true,
        searchEnabled: true,
        placeholder: true,
        placeholderValue: 'All',
        itemSelectText: ''
    });
    
    choicesInstances[id].setChoices(options, 'value', 'label', true);
    
    selectEl.addEventListener('change', applyFilters);
}

function applyFilters() {
    const searchVal = document.getElementById('search-case').value.toLowerCase().trim();
    
    const getVals = (id) => {
        if (!choicesInstances[id]) return [];
        const vals = choicesInstances[id].getValue(true);
        return Array.isArray(vals) ? vals : (vals ? [vals] : []);
    };

    const statusVals = getVals('filter-status');
    const munVals = getVals('filter-municipality');
    const subVals = getVals('filter-subcontractor');
    const typeVals = getVals('filter-type');
    const regionVals = getVals('filter-region');
    const scheduleVals = getVals('filter-schedule');
    const modelVals = getVals('filter-model');

    const filtered = allCases.filter(c => {
        const caseId = (c['Case ID'] || '').toLowerCase();

        const matchStatus = statusVals.length === 0 || statusVals.includes(c['Stage Status']);
        const matchMun = munVals.length === 0 || munVals.includes(c.Municipality);
        const matchSub = subVals.length === 0 || subVals.includes(c['Subcontractor Name']);
        const matchType = typeVals.length === 0 || typeVals.includes(c['Award Type Equivalent']);
        const matchRegion = regionVals.length === 0 || regionVals.includes(c.Region);
        const matchModel = modelVals.length === 0 || modelVals.includes(c['Model Home Design Selection']);
        const hasSchedule = typeof scheduledCaseIds !== 'undefined' && scheduledCaseIds.has(c['Case ID']);
        const matchSchedule = scheduleVals.length === 0 ||
            (scheduleVals.includes('Has Schedule') && hasSchedule) ||
            (scheduleVals.includes('No Schedule') && !hasSchedule);

        return (searchVal === '' || caseId.includes(searchVal)) &&
               matchStatus && matchMun && matchSub && matchType && matchRegion && matchModel && matchSchedule;
    });

    plotMarkers(filtered);
    generateSummary(filtered);
    generateTable(filtered);
}

function exportToExcel() {
    // We will export the currently filtered cases
    // To do this, we can extract the rows from the HTML table directly or use the DOM logic.
    // It is safer to use the table DOM so it matches exactly what the user sees.
    const table = document.getElementById('cases-table');
    let csv = [];
    
    // Add BOM for UTF-8 so Excel opens it correctly with accents
    csv.push('\uFEFF');

    const rows = table.querySelectorAll('tr');
    
    for (let i = 0; i < rows.length; i++) {
        let row = [], cols = rows[i].querySelectorAll('td, th');
        
        for (let j = 0; j < cols.length; j++) {
            // Get innerText and escape double quotes
            let data = cols[j].innerText.replace(/"/g, '""');
            // Enclose in quotes
            row.push('"' + data + '"');
        }
        csv.push(row.join(','));
    }

    const csvFile = new Blob([csv.join('\r\n')], {type: 'text/csv;charset=utf-8;'});
    const downloadLink = document.createElement('a');
    downloadLink.download = 'MIT_Cases_Report.csv';
    downloadLink.href = window.URL.createObjectURL(csvFile);
    downloadLink.style.display = 'none';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
}
