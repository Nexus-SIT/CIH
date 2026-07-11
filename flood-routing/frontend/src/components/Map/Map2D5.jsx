import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { useMapStore } from '../../store/useMapStore';
import { API_BASE_URL } from '../../config';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ShieldAlert, AlertTriangle, Brain } from 'lucide-react';

// Haversine distance in meters between two lat/lng points
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371e3;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

const executeAdd = async (zone, avgLat, avgLng) => {
  try {
    // Calculate actual radius from polygon vertices
    const coords = zone.geometry.coordinates[0]; // [[lng, lat], ...]
    let maxRadius = 200;
    for (const [lng, lat] of coords) {
      const dist = haversineMeters(avgLat, avgLng, lat, lng);
      if (dist > maxRadius) maxRadius = dist;
    }
    maxRadius = Math.round(maxRadius + 50);

    console.log(`[FloodMark] Sending flood-mark at (${avgLat.toFixed(5)}, ${avgLng.toFixed(5)}) radius=${maxRadius}m`);

    const res = await fetch(`${API_BASE_URL}/flood/flood-mark`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat: avgLat,
        lng: avgLng,
        radiusMeters: maxRadius,
        status: 'flooded'
      })
    });

    if (res.ok) {
      const result = await res.json();
      console.log(`[FloodMark] Backend marked ${result.affectedEdgesCount} edges as flooded`);
      // addFloodZone auto-triggers rerouting via the store
      useMapStore.getState().addFloodZone(zone);
    } else {
      console.error('[FloodMark] API error:', res.status);
    }
  } catch (err) {
    console.error("[FloodMark] Failed:", err);
    // Still add the zone locally even if API fails, so it shows on the map
    useMapStore.getState().addFloodZone(zone);
  }
};

const getCircleGeoJSON = (lat, lng, radiusMeters) => {
  const points = 64;
  const coords = [];
  const km = radiusMeters / 1000;
  const distanceX = km / (111.320 * Math.cos(lat * Math.PI / 180));
  const distanceY = km / 110.574;
  for(let i=0; i<points; i++) {
      const theta = (i / points) * (2 * Math.PI);
      const x = distanceX * Math.cos(theta);
      const y = distanceY * Math.sin(theta);
      coords.push([lng + x, lat + y]);
  }
  coords.push(coords[0]);
  return {
      type: 'FeatureCollection',
      features: [{
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [coords] }
      }]
  };
};

export default function Map2D5({ readOnly = false, confirmChanges = false, onMapClick = null, disableAITools = false }) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const mapReady = useRef(false);
  const { floodZones, activeRoute, responders, helpRequests, endLocation, aiPrediction, aiMapScan } = useMapStore();
  
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

  // Track onMapClick dynamically
  const onMapClickRef = useRef(onMapClick);
  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  // State for confirming creation or deletion of flood zones
  const [pendingAction, setPendingAction] = useState(null);

  // Refs to track freehand drawing (lasso) and erasing states
  const isDrawing = useRef(false);
  const drawCoords = useRef([]);
  const isErasing = useRef(false);
  
  // Ref to track active HTML markers on the map
  const activeMarkers = useRef([]);
  const helpMarkers = useRef([]);
  const destinationMarker = useRef(null);

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

      // Temporary AI prediction drawing source & dashed line layer
      map.current.addSource('ai-prediction-temp', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      map.current.addLayer({
        id: 'ai-prediction-temp-fill',
        type: 'fill',
        source: 'ai-prediction-temp',
        paint: {
          'fill-color': '#f59e0b',
          'fill-opacity': 0.4
        }
      });
      
      map.current.addLayer({
        id: 'ai-prediction-temp-line',
        type: 'line',
        source: 'ai-prediction-temp',
        paint: {
          'line-color': '#f59e0b',
          'line-width': 2,
          'line-dasharray': [2, 2]
        }
      });

      // AI Map Scan Source
      map.current.addSource('ai-map-scan', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      map.current.addLayer({
        id: 'ai-map-scan-heatmap',
        type: 'heatmap',
        source: 'ai-map-scan',
        maxzoom: 16,
        paint: {
          // Increase the heatmap weight based on riskScore
          'heatmap-weight': [
            'interpolate',
            ['linear'],
            ['get', 'riskScore'],
            0, 0,
            1, 1
          ],
          // Increase the heatmap color weight weight by zoom level
          // heatmap-intensity is a multiplier on top of heatmap-weight
          'heatmap-intensity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            0, 1,
            16, 3
          ],
          // Color ramp from transparent to Green to Yellow to Violet
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0, 'rgba(50, 215, 75, 0)',
            0.2, 'rgba(50, 215, 75, 0.7)',  // Green (Low Risk)
            0.5, 'rgba(245, 158, 11, 0.8)', // Yellow (Medium Risk)
            0.8, 'rgba(168, 85, 247, 0.9)'  // Violet (High Risk)
          ],
          // Adjust the heatmap radius by zoom level
          'heatmap-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            0, 15,
            9, 30,
            16, 80
          ],
          // Transition from heatmap to circle opacity by zoom level
          'heatmap-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            13, 0.9,
            16, 0.5
          ]
        }
      });

      // Active Route Source — always read the LATEST store state
      const latestRoute = useMapStore.getState().activeRoute;
      map.current.addSource('active-route', {
        type: 'geojson',
        data: latestRoute ? latestRoute.geometry : { type: 'FeatureCollection', features: [] }
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

      // Mark map as ready
      mapReady.current = true;
      console.log('[Map2D5] Map ready, sources initialized.');
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

    map.current.on('click', (e) => {
      if (readOnlyRef.current) return;
      const currentMode = useMapStore.getState().mapMode;
      if (currentMode === 'help') {
        const newHelpReq = {
          id: `help-${Date.now()}`,
          lat: e.lngLat.lat,
          lng: e.lngLat.lng,
          status: 'Active',
          description: 'Help Required'
        };
        useMapStore.getState().addHelpRequest(newHelpReq);
        useMapStore.getState().setMapMode('view');
      } else if (currentMode === 'ai-predict') {
        const { lat, lng } = e.lngLat;
        useMapStore.getState().setAIPrediction({ loading: true, lat, lng });
        
        fetch(`${API_BASE_URL}/predict-flood?lat=${lat}&lng=${lng}`)
          .then(res => res.json())
          .then(data => {
            if (data.error) throw new Error(data.error);
            useMapStore.getState().setAIPrediction({ ...data, lat, lng, loading: false });
          })
          .catch(err => {
            console.error(err);
            useMapStore.getState().setAIPrediction(null);
            alert("AI Prediction failed: " + err.message);
          });
      } else if (onMapClickRef.current) {
        onMapClickRef.current(e.lngLat);
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
    if (!map.current || !mapReady.current) return;
    const source = map.current.getSource('ai-prediction-temp');
    if (source) {
      if (!disableAITools && aiPrediction && !aiPrediction.loading && aiPrediction.lat) {
        source.setData(getCircleGeoJSON(aiPrediction.lat, aiPrediction.lng, 300));
        
        // update color based on risk level
        const color = aiPrediction.riskLevel === 'HIGH' ? '#ff453a' : aiPrediction.riskLevel === 'MEDIUM' ? '#f59e0b' : '#32d74b';
        map.current.setPaintProperty('ai-prediction-temp-fill', 'fill-color', color);
        map.current.setPaintProperty('ai-prediction-temp-line', 'line-color', color);
      } else {
        source.setData({ type: 'FeatureCollection', features: [] });
      }
    }
  }, [aiPrediction, disableAITools]);

  // Sync AI Map Scan
  useEffect(() => {
    if (!map.current || !mapReady.current) return;
    const source = map.current.getSource('ai-map-scan');
    if (source) {
      if (!disableAITools && aiMapScan && !aiMapScan.loading && aiMapScan.features) {
        source.setData(aiMapScan);
      } else {
        source.setData({ type: 'FeatureCollection', features: [] });
      }
    }
  }, [aiMapScan, disableAITools]);

  // Helper to sync the route line on the map from the store
  const syncRouteToMap = (route) => {
    if (!map.current || !mapReady.current) return;
    const source = map.current.getSource('active-route');
    if (!source) return;
    const data = route ? route.geometry : { type: 'FeatureCollection', features: [] };
    console.log('[Map2D5] Syncing route to map. Has route:', !!route, 'Coords:', route?.geometry?.features?.[0]?.geometry?.coordinates?.length || 0);
    source.setData(data);
  };

  // React effect: sync when activeRoute changes
  useEffect(() => {
    syncRouteToMap(activeRoute);
  }, [activeRoute]);

  // BULLETPROOF BACKUP: Subscribe directly to the Zustand store so we catch
  // updates even if React's useEffect misses them due to timing.
  useEffect(() => {
    const unsub = useMapStore.subscribe(
      (state) => {
        if (mapReady.current && map.current) {
          const source = map.current.getSource('active-route');
          if (source) {
            const data = state.activeRoute ? state.activeRoute.geometry : { type: 'FeatureCollection', features: [] };
            source.setData(data);
          }
        }
      }
    );
    return () => unsub();
  }, []);

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

  // Sync help requests as markers
  useEffect(() => {
    if (!map.current) return;

    helpMarkers.current.forEach(marker => marker.remove());
    helpMarkers.current = [];

    const currentHelpRequests = helpRequests || [];
    currentHelpRequests.forEach(req => {
      const el = document.createElement('div');
      el.className = 'vehicle-marker';
      
      const dot = document.createElement('div');
      dot.className = 'marker-dot help-request';
      
      const label = document.createElement('div');
      label.className = 'marker-label';
      label.innerText = 'Help Required';
      label.style.color = '#ff453a';

      el.appendChild(dot);
      el.appendChild(label);

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([req.lng, req.lat])
        .addTo(map.current);

      helpMarkers.current.push(marker);
    });

    return () => {
      helpMarkers.current.forEach(marker => marker.remove());
      helpMarkers.current = [];
    };
  }, [helpRequests]);
  // Sync destination marker
  useEffect(() => {
    if (!map.current) return;

    if (destinationMarker.current) {
      destinationMarker.current.remove();
      destinationMarker.current = null;
    }

    if (endLocation) {
      const el = document.createElement('div');
      el.className = 'vehicle-marker';

      const dot = document.createElement('div');
      dot.className = 'marker-dot destination-location';

      const label = document.createElement('div');
      label.className = 'marker-label';
      label.innerText = endLocation.name || 'Destination';

      el.appendChild(dot);
      el.appendChild(label);

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([endLocation.lng, endLocation.lat])
        .addTo(map.current);

      destinationMarker.current = marker;
    }

    return () => {
      if (destinationMarker.current) {
        destinationMarker.current.remove();
        destinationMarker.current = null;
      }
    };
  }, [endLocation]);

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

      {/* AI Map Scan Loading Overlay */}
      {!disableAITools && aiMapScan?.loading && (
        <div style={{
          position: 'absolute',
          top: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(12px)',
          borderRadius: '9999px',
          border: '1px solid var(--dash-border)',
          padding: '8px 16px',
          color: 'white',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{ width: '16px', height: '16px', border: '2px solid var(--dash-blue)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: '14px', fontWeight: 500 }}>Running Full Map Scan...</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* AI Map Scan Result Header */}
      {!disableAITools && aiMapScan && !aiMapScan.loading && (
        <div style={{
          position: 'absolute',
          top: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(12px)',
          borderRadius: '9999px',
          border: '1px solid var(--dash-border)',
          padding: '8px 16px',
          color: 'white',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <Brain size={18} color="var(--dash-blue)" />
          <span style={{ fontSize: '14px', fontWeight: 500 }}>Full Map Scan Active</span>
          <div style={{ display: 'flex', gap: '8px', marginLeft: '12px', alignItems: 'center' }}>
            <span style={{ display: 'inline-block', width: '10px', height: '10px', backgroundColor: '#32d74b', borderRadius: '50%' }}></span> <span style={{ fontSize: '10px', marginRight: '4px' }}>Low</span>
            <span style={{ display: 'inline-block', width: '10px', height: '10px', backgroundColor: '#f59e0b', borderRadius: '50%' }}></span> <span style={{ fontSize: '10px', marginRight: '4px' }}>Med</span>
            <span style={{ display: 'inline-block', width: '10px', height: '10px', backgroundColor: '#9a3412', borderRadius: '50%' }}></span> <span style={{ fontSize: '10px' }}>High</span>
          </div>
          <button 
            onClick={() => useMapStore.getState().setAIMapScan(null)}
            style={{ background: 'none', border: 'none', color: 'var(--dash-text-muted)', cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >&times;</button>
        </div>
      )}

      {/* AI Prediction Popup Overlay */}
      {!disableAITools && aiPrediction && (
        <div style={{
          position: 'absolute',
          bottom: '80px',
          right: '24px',
          width: '320px',
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderRadius: '12px',
          border: '1px solid var(--dash-border)',
          padding: '16px',
          color: 'white',
          zIndex: 1000
        }}>
          {aiPrediction.loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '20px', height: '20px', border: '2px solid var(--dash-blue)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: '14px', color: 'var(--dash-text-muted)' }}>AI analyzing terrain & weather...</span>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Brain size={20} color={aiPrediction.riskLevel === 'HIGH' ? '#ff453a' : aiPrediction.riskLevel === 'MEDIUM' ? '#f59e0b' : '#32d74b'} />
                  <span style={{ fontWeight: 'bold', fontSize: '16px' }}>AI Risk Assessment</span>
                </div>
                <button 
                  onClick={() => useMapStore.getState().setAIPrediction(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--dash-text-muted)', cursor: 'pointer', fontSize: '20px' }}
                >&times;</button>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                <span style={{ fontSize: '12px', color: 'var(--dash-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Risk Level</span>
                <span style={{ 
                  fontSize: '18px', 
                  fontWeight: 'bold', 
                  color: aiPrediction.riskLevel === 'HIGH' ? '#ff453a' : aiPrediction.riskLevel === 'MEDIUM' ? '#f59e0b' : '#32d74b'
                }}>
                  {aiPrediction.riskLevel} {aiPrediction.riskScore !== undefined ? `(${(aiPrediction.riskScore * 100).toFixed(0)}%)` : ''}
                </span>
              </div>

              {aiPrediction.factors && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: 'var(--dash-text-muted)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Rainfall:</span> <span style={{ color: 'white' }}>{aiPrediction.factors.rainfallMm?.toFixed(1) || 0} mm/hr</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Elevation:</span> <span style={{ color: 'white' }}>{aiPrediction.factors.elevationM} m</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Soil Clay Content:</span> <span style={{ color: 'white' }}>{aiPrediction.factors.clayPercent}%</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Distance to River:</span> <span style={{ color: 'white' }}>{aiPrediction.factors.distanceToRiverM?.toFixed(0) || 0} m</span>
                  </div>
                </div>
              )}

              {(aiPrediction.riskLevel === 'HIGH' || aiPrediction.riskLevel === 'MEDIUM') && (
                <button 
                  className="apple-btn danger"
                  style={{ marginTop: '8px', width: '100%', display: 'flex', justifyContent: 'center', padding: '10px' }}
                  onClick={() => {
                    const geojson = getCircleGeoJSON(aiPrediction.lat, aiPrediction.lng, 300);
                    const newZone = {
                      id: `zone-${Date.now()}`,
                      geometry: geojson.features[0].geometry
                    };
                    executeAdd(newZone, aiPrediction.lat, aiPrediction.lng);
                    useMapStore.getState().setAIPrediction(null);
                    useMapStore.getState().setMapMode('view');
                  }}
                >
                  Mark as Flood Zone
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
