import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { useMapStore } from '../../store/useMapStore';
import { API_BASE_URL } from '../../config';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ShieldAlert, AlertTriangle } from 'lucide-react';

const executeAdd = async (zone, avgLat, avgLng) => {
  try {
    const res = await fetch(`${API_BASE_URL}/flood`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: { lat: avgLat, lng: avgLng },
        reported_by: 'admin',
        depth_estimate_m: 0.6
      })
    });
    if (res.ok) {
      useMapStore.getState().addFloodZone(zone);
    }
  } catch (err) {
    console.error("Failed to mark flood zone via API", err);
  }
};

export default function Map2D5({ readOnly = false, confirmChanges = false }) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const { floodZones, activeRoute, responders } = useMapStore();
  
  // Track readOnly state dynamically inside map event handlers without recreating map
  const readOnlyRef = useRef(readOnly);
  useEffect(() => {
    readOnlyRef.current = readOnly;
  }, [readOnly]);

  // Track confirmChanges state dynamically inside map event handlers
  const confirmChangesRef = useRef(confirmChanges);
  useEffect(() => {
    confirmChangesRef.current = confirmChanges;
  }, [confirmChanges]);

  // State for confirming creation or deletion of flood zones
  const [pendingAction, setPendingAction] = useState(null);

  // Refs to track freehand drawing (lasso) and erasing states
  const isDrawing = useRef(false);
  const drawCoords = useRef([]);
  const isErasing = useRef(false);
  
  // Ref to track active HTML markers on the map
  const activeMarkers = useRef([]);

  useEffect(() => {
    if (map.current) return; // initialize map only once
    
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://tiles.openfreemap.org/styles/dark',
      center: [74.9854, 12.5101], // Kasargod
      zoom: 13,
      minZoom: 11,
      maxZoom: 18,
      maxBounds: [
        [74.90, 12.42], // Southwest coordinates (lng, lat)
        [75.08, 12.60]  // Northeast coordinates (lng, lat)
      ],
      pitch: 60, // 2.5D view
      bearing: -20,
      antialias: true
    });

    map.current.on('style.load', () => {
      // Add 3D Buildings
      if (!map.current.getLayer('3d-buildings')) {
        map.current.addLayer({
          'id': '3d-buildings',
          'source': 'openmaptiles',
          'source-layer': 'building',
          'type': 'fill-extrusion',
          'minzoom': 13,
          'paint': {
            'fill-extrusion-color': '#2d3748', // slate/dark gray building
            'fill-extrusion-height': [
              'interpolate', ['linear'], ['zoom'],
              13, 0,
              15, ['get', 'render_height']
            ],
            'fill-extrusion-base': ['get', 'render_min_height'],
            'fill-extrusion-opacity': 0.85
          }
        }, 'place_other'); // Insert before place labels if possible, but maplibre handles it gracefully if layer doesn't exist
      }

      // Customize Water to be a premium tactical deep blue
      if (map.current.getLayer('water')) {
        map.current.setPaintProperty('water', 'fill-color', '#1a365d');
      }
      if (map.current.getLayer('waterway')) {
        map.current.setPaintProperty('waterway', 'line-color', '#1a365d');
      }

      // Customize Roads to be a muted slate-gray (visible but not glaringly white)
      const roadCustomizations = {
        'highway_motorway_inner': '#5a6270', // Muted slate for highways
        'highway_major_inner': '#484f5c',    // Slate gray for major roads
        'highway_minor': '#363d4a',          // Dark slate for minor roads
        'highway_path': '#242933'            // Subtle dark gray for paths
      };

      Object.entries(roadCustomizations).forEach(([layerId, color]) => {
        if (map.current.getLayer(layerId)) {
          map.current.setPaintProperty(layerId, 'line-color', color);
        }
      });

      const currentFloodZones = useMapStore.getState().floodZones;
      const currentActiveRoute = useMapStore.getState().activeRoute;

      // Flood Zones Source
      map.current.addSource('flood-zones', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: currentFloodZones.map(zone => ({
            type: 'Feature',
            properties: { id: zone.id },
            geometry: zone.geometry
          }))
        }
      });
      
      map.current.addLayer({
        id: 'flood-zones-fill',
        type: 'fill',
        source: 'flood-zones',
        paint: {
          'fill-color': '#ff453a',
          'fill-opacity': 0.4
        }
      });
      
      map.current.addLayer({
        id: 'flood-zones-line',
        type: 'line',
        source: 'flood-zones',
        paint: {
          'line-color': '#ff453a',
          'line-width': 2
        }
      });

      // Temporary lasso drawing source & dashed line layer
      map.current.addSource('lasso-temp', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      map.current.addLayer({
        id: 'lasso-temp-line',
        type: 'line',
        source: 'lasso-temp',
        paint: {
          'line-color': '#ff453a',
          'line-width': 2.5,
          'line-dasharray': [2, 2]
        }
      });

      // Active Route Source
      map.current.addSource('active-route', {
        type: 'geojson',
        data: currentActiveRoute ? currentActiveRoute.geometry : { type: 'FeatureCollection', features: [] }
      });

      map.current.addLayer({
        id: 'active-route-line',
        type: 'line',
        source: 'active-route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#32d74b',
          'line-width': 6,
          'line-opacity': 0.8
        }
      });
    });

    const eraseAtPoint = (point) => {
      if (!map.current || readOnlyRef.current) return;
      // Query features on the flood zone fill layer under cursor
      const features = map.current.queryRenderedFeatures(point, {
        layers: ['flood-zones-fill']
      });
      if (features.length > 0) {
        const zoneId = features[0].properties.id;
        if (zoneId) {
          if (confirmChangesRef.current) {
            setPendingAction(prev => {
              if (prev) return prev;
              return { type: 'delete', id: zoneId };
            });
            isErasing.current = false;
            if (map.current) map.current.dragPan.enable();
          } else {
            useMapStore.getState().deleteFloodZone(zoneId);
          }
        }
      }
    };

    // Freehand Lasso Drawing & Eraser Mouse Listeners
    map.current.on('mousedown', (e) => {
      if (readOnlyRef.current) return;
      const currentMode = useMapStore.getState().mapMode;
      if (currentMode === 'lasso') {
        map.current.dragPan.disable();
        isDrawing.current = true;
        drawCoords.current = [e.lngLat.toArray()];
        // Initialize draw track
        map.current.getSource('lasso-temp').setData({
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: drawCoords.current
            }
          }]
        });
      } else if (currentMode === 'erase') {
        map.current.dragPan.disable();
        isErasing.current = true;
        eraseAtPoint(e.point);
      }
    });

    map.current.on('mousemove', (e) => {
      if (readOnlyRef.current) return;
      const currentMode = useMapStore.getState().mapMode;
      if (currentMode === 'lasso' && isDrawing.current) {
        drawCoords.current.push(e.lngLat.toArray());
        map.current.getSource('lasso-temp').setData({
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: drawCoords.current
            }
          }]
        });
      } else if (currentMode === 'erase' && isErasing.current) {
        eraseAtPoint(e.point);
      }
    });

    map.current.on('mouseup', async (e) => {
      if (readOnlyRef.current) return;
      const currentMode = useMapStore.getState().mapMode;
      
      if (currentMode === 'lasso' && isDrawing.current) {
        isDrawing.current = false;
        map.current.dragPan.enable();
        
        // Clear lasso dashed line
        map.current.getSource('lasso-temp').setData({
          type: 'FeatureCollection',
          features: []
        });

        // Generate polygon only if we have at least 3 points
        if (drawCoords.current.length > 2) {
          drawCoords.current.push(drawCoords.current[0]); // Close the polygon loop
          
          // Calculate centroid to send to API backend
          const lats = drawCoords.current.map(c => c[1]);
          const lngs = drawCoords.current.map(c => c[0]);
          const avgLat = lats.reduce((sum, v) => sum + v, 0) / lats.length;
          const avgLng = lngs.reduce((sum, v) => sum + v, 0) / lngs.length;

          const newZone = {
            id: `zone-${Date.now()}`,
            geometry: {
              type: 'Polygon',
              coordinates: [drawCoords.current]
            }
          };

          if (confirmChangesRef.current) {
            setPendingAction({
              type: 'create',
              zone: newZone,
              avgLat,
              avgLng
            });
          } else {
            executeAdd(newZone, avgLat, avgLng);
          }
        }
      } else if (currentMode === 'erase') {
        isErasing.current = false;
        map.current.dragPan.enable();
      }
    });

  }, []);

  // Sync state with MapLibre layers when state changes
  useEffect(() => {
    if (!map.current) return;

    const source = map.current.getSource('flood-zones');
    if (source) {
      const geojsonData = {
        type: 'FeatureCollection',
        features: floodZones.map(zone => ({
          type: 'Feature',
          properties: { id: zone.id },
          geometry: zone.geometry
        }))
      };
      source.setData(geojsonData);
    }
  }, [floodZones]);

  useEffect(() => {
    if (!map.current) return;

    const source = map.current.getSource('active-route');
    if (source) {
      if (activeRoute) {
        source.setData(activeRoute.geometry);
      } else {
        source.setData({ type: 'FeatureCollection', features: [] });
      }
    }
  }, [activeRoute]);

  // Sync responders (rescue teams) as premium markers on the map
  useEffect(() => {
    if (!map.current) return;

    // Clear existing markers
    activeMarkers.current.forEach(marker => marker.remove());
    activeMarkers.current = [];

    // Create markers for active responders
    const currentResponders = responders || [];
    currentResponders.forEach(responder => {
      const el = document.createElement('div');
      el.className = 'vehicle-marker';
      
      const dot = document.createElement('div');
      dot.className = `marker-dot ${responder.type}`;
      
      const label = document.createElement('div');
      label.className = 'marker-label';
      label.innerText = `${responder.name} (${responder.status})`;

      el.appendChild(dot);
      el.appendChild(label);

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([responder.lng, responder.lat])
        .addTo(map.current);

      activeMarkers.current.push(marker);
    });

    return () => {
      activeMarkers.current.forEach(marker => marker.remove());
      activeMarkers.current = [];
    };
  }, [responders]);

  // Poll GET /api/safezones when using real backend
  useEffect(() => {
    let intervalId;
    const fetchSafeZones = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/safezones`);
        if (res.ok) {
          const data = await res.json();
          console.log("Fetched safe zones from real API:", data.zones);
        }
      } catch (err) {
        console.error("Failed to fetch safe zones", err);
      }
    };

    fetchSafeZones();
    intervalId = setInterval(fetchSafeZones, 5000); // Poll every 5s
    return () => clearInterval(intervalId);
  }, []);

  // Poll GET /api/responder to fetch live responder locations from the backend
  useEffect(() => {
    let intervalId;
    const fetchResponders = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/responder`);
        if (res.ok) {
          const data = await res.json();
          const mapped = data.map(r => ({
            id: r.responderId,
            name: r.responderId === 'my-loc' ? 'My Location' : `${r.vehicleType.toUpperCase()} (${r.responderId})`,
            type: r.responderId === 'my-loc' ? 'my-location' : r.vehicleType,
            lat: r.lat,
            lng: r.lng,
            status: r.status || 'Active'
          }));
          useMapStore.setState({ responders: mapped });
        }
      } catch (err) {
        console.error("Failed to fetch responders from API", err);
      }
    };

    fetchResponders();
    intervalId = setInterval(fetchResponders, 4000); // Poll every 4s
    return () => clearInterval(intervalId);
  }, []);


  const handleConfirm = async () => {
    if (!pendingAction) return;

    if (pendingAction.type === 'create') {
      const { zone, avgLat, avgLng } = pendingAction;
      await executeAdd(zone, avgLat, avgLng);
    } else if (pendingAction.type === 'delete') {
      useMapStore.getState().deleteFloodZone(pendingAction.id);
    }
    
    setPendingAction(null);
  };

  const handleCancel = () => {
    setPendingAction(null);
  };

  return (
    <>
      <div 
        ref={mapContainer} 
        style={{ width: '100%', height: '100vh', position: 'absolute', top: 0, left: 0, zIndex: 0 }} 
      />

      {pendingAction && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 99999,
        }}>
          <div className="glass-panel" style={{
            width: '400px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            border: '1px solid rgba(255, 69, 58, 0.3)',
            boxShadow: '0 12px 40px rgba(255, 69, 58, 0.15)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                backgroundColor: 'rgba(255, 69, 58, 0.15)',
                borderRadius: '50%',
                width: '40px',
                height: '40px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                flexShrink: 0
              }}>
                <ShieldAlert size={22} style={{ color: '#ff453a' }} />
              </div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {pendingAction.type === 'create' ? 'Broadcast Emergency Alert?' : 'Cancel Emergency Alert?'}
              </h3>
            </div>
            
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              {pendingAction.type === 'create' 
                ? 'Creating this flood zone will trigger real-time routing updates and broadcast emergency response instructions to all active responders in this sector.'
                : 'Deleting this flood zone will remove the hazard overlay, recalculate routes, and notify all responders that this sector is clear.'}
            </p>
            
            <div style={{
              backgroundColor: 'rgba(255, 214, 10, 0.1)',
              border: '1px solid rgba(255, 214, 10, 0.2)',
              padding: '12px',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <AlertTriangle size={18} style={{ color: 'var(--warning-color)', flexShrink: 0 }} />
              <span style={{ fontSize: '12px', color: 'var(--warning-color)', fontWeight: 500 }}>
                Warning: This may send emergency response to all.
              </span>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '4px' }}>
              <button 
                className="apple-btn" 
                onClick={handleCancel}
                style={{ background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                Cancel
              </button>
              <button 
                className="apple-btn danger" 
                onClick={handleConfirm}
              >
                {pendingAction.type === 'create' ? 'Confirm Alert' : 'Confirm Deletion'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
