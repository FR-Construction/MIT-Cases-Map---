let map;
let markers = [];

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

    // Draw the dividing red line
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
        strokeColor: "#FF0000",
        strokeOpacity: 0.8,
        strokeWeight: 4,
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
        
        plotMarkers(cases);
        
        // Hide loading overlay
        document.getElementById('loading-overlay').classList.remove('active');

    } catch (error) {
        console.error("Could not load cases.json:", error);
        document.getElementById('loading-overlay').innerHTML = `<p style="color: red; font-weight: bold;">Error loading data. Check console.</p>`;
    }
}

function plotMarkers(cases) {
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
