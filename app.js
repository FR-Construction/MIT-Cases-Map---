let map;
let markers = [];
let allCases = [];

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
        Norte: { total: 0, relo: 0, recon: 0 },
        Sur: { total: 0, relo: 0, recon: 0 }
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
            <h4>Norte (Total: ${summary.Norte.total})</h4>
            <div class="summary-stats">
                <span><span class="marker relo" style="width:10px;height:10px;margin-right:5px;"></span> Relo: ${summary.Norte.relo}</span>
                <span><span class="marker recon" style="width:10px;height:10px;margin-right:5px;"></span> Recon: ${summary.Norte.recon}</span>
            </div>
        </div>
        <div class="summary-region">
            <h4>Sur (Total: ${summary.Sur.total})</h4>
            <div class="summary-stats">
                <span><span class="marker relo" style="width:10px;height:10px;margin-right:5px;"></span> Relo: ${summary.Sur.relo}</span>
                <span><span class="marker recon" style="width:10px;height:10px;margin-right:5px;"></span> Recon: ${summary.Sur.recon}</span>
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
        
        tableHtml += `
            <tr>
                <td>${c['Case ID'] || 'N/A'}</td>
                <td>${c.Municipality || 'N/A'}</td>
                <td>${c.Region || 'N/A'}</td>
                <td>${c['Award Type Equivalent'] || 'N/A'}</td>
                <td>${sub}</td>
                <td>${c['Stage Status'] || 'N/A'}</td>
            </tr>
        `;
    });
    tableBody.innerHTML = tableHtml;
}



function populateFilters() {
    const statuses = new Set();
    const municipalities = new Set();
    const subcontractors = new Set();
    const types = new Set();

    allCases.forEach(c => {
        if (c['Stage Status']) statuses.add(c['Stage Status']);
        if (c.Municipality) municipalities.add(c.Municipality);
        if (c['Subcontractor Name']) subcontractors.add(c['Subcontractor Name']);
        if (c['Award Type Equivalent']) types.add(c['Award Type Equivalent']);
    });

    populateSelect('filter-status', Array.from(statuses).sort());
    populateSelect('filter-municipality', Array.from(municipalities).sort());
    populateSelect('filter-subcontractor', Array.from(subcontractors).sort());
    populateSelect('filter-type', Array.from(types).sort());

    document.getElementById('filter-status').addEventListener('change', applyFilters);
    document.getElementById('filter-municipality').addEventListener('change', applyFilters);
    document.getElementById('filter-subcontractor').addEventListener('change', applyFilters);
    document.getElementById('filter-type').addEventListener('change', applyFilters);
    document.getElementById('search-case').addEventListener('input', applyFilters);
}

function populateSelect(id, values) {
    const select = document.getElementById(id);
    values.forEach(val => {
        const option = document.createElement('option');
        option.value = val;
        option.textContent = val;
        select.appendChild(option);
    });
}

function applyFilters() {
    const searchVal = document.getElementById('search-case').value.toLowerCase().trim();
    const statusVal = document.getElementById('filter-status').value;
    const munVal = document.getElementById('filter-municipality').value;
    const subVal = document.getElementById('filter-subcontractor').value;
    const typeVal = document.getElementById('filter-type').value;

    const filtered = allCases.filter(c => {
        const caseId = (c['Case ID'] || '').toLowerCase();
        return (searchVal === '' || caseId.includes(searchVal)) &&
               (statusVal === 'All' || c['Stage Status'] === statusVal) &&
               (munVal === 'All' || c.Municipality === munVal) &&
               (subVal === 'All' || c['Subcontractor Name'] === subVal) &&
               (typeVal === 'All' || c['Award Type Equivalent'] === typeVal);
    });

    plotMarkers(filtered);
    generateSummary(filtered);
    generateTable(filtered);
}
