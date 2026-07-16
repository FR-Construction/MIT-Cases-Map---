let map;
let markers = [];
let allCases = [];
let choicesInstances = {};

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

    // Fetch data and plot markers
    fetchDataAndPlot();
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

    // Clear existing markers
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
        };

        const marker = new google.maps.Marker({
            position: position,
            map: map,
            icon: svgMarker,
            title: `${caseData.Municipality} - ${caseData['Award Type Equivalent']}`
        });

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
    let tableHtml = '';
    cases.forEach(c => {
        let sub = c['Subcontractor Name'] || 'N/A';
        if (typeof sub === 'string') {
            sub = sub.replace(/\n/g, '<br>');
        }

        const caseId = c['Case ID'] || '';
        const hasSchedule = typeof scheduledCaseIds !== 'undefined' && scheduledCaseIds.has(caseId);
        const scheduleCell = hasSchedule
            ? `<button type="button" class="schedule-badge schedule-badge-set" data-case-id="${caseId}">📅 Set</button>`
            : `<span class="schedule-badge schedule-badge-none">—</span>`;

        tableHtml += `
            <tr>
                <td>${c['Case ID'] || 'N/A'}</td>
                <td>${c.Municipality || 'N/A'}</td>
                <td>${c.Region || 'N/A'}</td>
                <td>${c['Award Type Equivalent'] || 'N/A'}</td>
                <td>${sub}</td>
                <td>${c['Stage Status'] || 'N/A'}</td>
                <td>${c['Model Home Design Selection'] || 'N/A'}</td>
                <td>${scheduleCell}</td>
            </tr>
        `;
    });
    tableBody.innerHTML = tableHtml;

    tableBody.querySelectorAll('.schedule-badge-set').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (typeof openScheduleForCaseId === 'function') {
                openScheduleForCaseId(e.currentTarget.dataset.caseId);
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

    allCases.forEach(c => {
        if (c['Stage Status']) statuses.add(c['Stage Status']);
        if (c.Municipality) municipalities.add(c.Municipality);
        if (c['Subcontractor Name']) subcontractors.add(c['Subcontractor Name']);
        if (c['Award Type Equivalent']) types.add(c['Award Type Equivalent']);
        if (c.Region) regions.add(c.Region);
    });

    populateSelect('filter-status', Array.from(statuses).sort());
    populateSelect('filter-municipality', Array.from(municipalities).sort());
    populateSelect('filter-subcontractor', Array.from(subcontractors).sort());
    populateSelect('filter-type', Array.from(types).sort());
    populateSelect('filter-region', Array.from(regions).sort());

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

    const filtered = allCases.filter(c => {
        const caseId = (c['Case ID'] || '').toLowerCase();
        
        const matchStatus = statusVals.length === 0 || statusVals.includes(c['Stage Status']);
        const matchMun = munVals.length === 0 || munVals.includes(c.Municipality);
        const matchSub = subVals.length === 0 || subVals.includes(c['Subcontractor Name']);
        const matchType = typeVals.length === 0 || typeVals.includes(c['Award Type Equivalent']);
        const matchRegion = regionVals.length === 0 || regionVals.includes(c.Region);

        return (searchVal === '' || caseId.includes(searchVal)) &&
               matchStatus && matchMun && matchSub && matchType && matchRegion;
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
