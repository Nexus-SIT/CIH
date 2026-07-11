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
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
  for (let i = 0; i < points; i++) {
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

export default function Map2D5({ readOnly = false, confirmChanges = false, onMapClick = null, disableAITools = false, disableHelpRequests = false }) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const mapReady = useRef(false);
  const { floodZones, activeRoute, responders, helpRequests, startLocation, endLocation, aiPrediction, aiMapScan } = useMapStore();

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

  // Ref to track active HTML markers on the map (vehicles + help popup triggers)
  const activeMarkers = useRef([]);
  const helpMarkers = useRef([]);
  const aiPopupRef = useRef(null);
  const startMarkerRef = useRef(null);
  const destMarkerRef = useRef(null);

  const updateLocationMarker = (ref, loc, type) => {
    if (!map.current) return;
    if (!loc) {
      if (ref.current) {
        ref.current.remove();
        ref.current = null;
      }
    } else {
      if (!ref.current) {
        const el = document.createElement('div');
        el.className = `custom-location-marker ${type}-marker`;
        el.innerHTML = `
          <div class="marker-pin">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
              <circle cx="12" cy="12" r="6" fill="white" />
            </svg>
          </div>
          <div class="marker-label">${type === 'source' ? 'Source' : 'Destination'}</div>
        `;
        ref.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([loc.lng, loc.lat])
          .addTo(map.current);
      } else {
        ref.current.setLngLat([loc.lng, loc.lat]);
      }
    }
  };

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
      }, 'water'); // Insert behind water layer

      map.current.addLayer({
        id: 'ai-prediction-temp-line',
        type: 'line',
        source: 'ai-prediction-temp',
        paint: {
          'line-color': '#f59e0b',
          'line-width': 2,
          'line-dasharray': [2, 2]
        }
      }, 'water'); // Insert behind water layer

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
          // Keep intensity consistent so colors don't fade to green when zooming in
          'heatmap-intensity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            9, 1,
            16, 1
          ],
          // Color ramp from transparent to Green to Yellow to Violet
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0, 'rgba(50, 215, 75, 0)',
            0.1, 'rgba(50, 215, 75, 0.7)',  // Green (Low Risk)
            0.4, 'rgba(245, 158, 11, 0.8)', // Yellow (Medium Risk)
            0.7, 'rgba(168, 85, 247, 0.9)'  // Violet (High Risk)
          ],
          // Scale radius exponentially so the points always overlap and don't turn into balls
          'heatmap-radius': [
            'interpolate',
            ['exponential', 2],
            ['zoom'],
            9, 15,      // zoomed out
            12, 40,
            14, 100,
            16, 250     // zoomed in
          ],
          // Opacity
          'heatmap-opacity': 0.7
        }
      }, 'water'); // Insert behind water layer

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

      // Add directional arrows on the route
      map.current.addLayer({
        id: 'active-route-arrows',
        type: 'symbol',
        source: 'active-route',
        layout: {
          'symbol-placement': 'line',
          'text-field': '▶',
          'text-size': 18,
          'symbol-spacing': 80,
          'text-keep-upright': false,
          'text-offset': [0, -0.05]
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#32d74b',
          'text-halo-width': 2
        }
      });

      // Help Request markers — native map circles
      map.current.addSource('help-request-markers', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      map.current.addLayer({
        id: 'help-request-glow',
        type: 'circle',
        source: 'help-request-markers',
        paint: {
          'circle-radius': 16,
          'circle-color': 'rgba(255, 69, 58, 0.25)',
          'circle-stroke-width': 0
        }
      });
      map.current.addLayer({
        id: 'help-request-circle',
        type: 'circle',
        source: 'help-request-markers',
        paint: {
          'circle-radius': 10,
          'circle-color': '#ff453a',
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff'
        }
      });

      // Explored nodes for Slow-Mo A*
      map.current.addSource('explored-nodes', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      map.current.addLayer({
        id: 'explored-nodes-circle',
        type: 'circle',
        source: 'explored-nodes',
        paint: {
          'circle-color': '#f59e0b',
          'circle-radius': 3,
          'circle-opacity': 0.6
        }
      });

      // Mark map as ready
      mapReady.current = true;
      console.log('[Map2D5] Map ready, sources initialized.');

      // Hydrate marker layers with any data that was set before the map loaded
      const initState = useMapStore.getState();

      if (initState.startLocation) {
        updateLocationMarker(startMarkerRef, initState.startLocation, 'source');
      }

      if (initState.endLocation) {
        updateLocationMarker(destMarkerRef, initState.endLocation, 'dest');
      }

      const initHelp = initState.helpRequests || [];
      if (initHelp.length > 0) {
        map.current.getSource('help-request-markers')?.setData({
          type: 'FeatureCollection',
          features: initHelp.map(req => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [req.lng, req.lat] }, properties: { id: req.id, description: req.description || 'Help Required' } }))
        });
      }
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
        // Prevent clicking on water bodies
        const waterFeatures = map.current.queryRenderedFeatures(e.point, {
          layers: ['water', 'waterway'].filter(l => map.current.getLayer(l))
        });

        if (waterFeatures.length > 0) {
          // User clicked on a water body. Clear any prediction and ignore.
          useMapStore.getState().setAIPrediction(null);
          return;
        }

        const { lat, lng } = e.lngLat;
        useMapStore.getState().setAIPrediction({ loading: true, lat, lng });

        fetch(`${API_BASE_URL}/predict-flood?lat=${lat}&lng=${lng}`)
          .then(res => {
            if (!res.ok) {
              // Return a default low-risk prediction if API error (e.g. out of bounds)
              return {
                riskScore: 0.12,
                riskLevel: 'LOW',
                factors: {
                  rainfallMm: 0,
                  clayPercent: 20,
                  elevationM: 35,
                  distanceToRiverM: 1500
                }
              };
            }
            return res.json();
          })
          .then(data => {
            useMapStore.getState().setAIPrediction({ ...data, lat, lng, loading: false });
          })
          .catch(err => {
            // Fallback to green/low risk on fetch error as well
            useMapStore.getState().setAIPrediction({
              riskScore: 0.12,
              riskLevel: 'LOW',
              factors: {
                rainfallMm: 0,
                clayPercent: 20,
                elevationM: 35,
                distanceToRiverM: 1500
              },
              lat,
              lng,
              loading: false
            });
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

  // Sync AI Prediction Popup on map
  useEffect(() => {
    if (!map.current || !mapReady.current) return;

    if (aiPopupRef.current) {
      aiPopupRef.current.remove();
      aiPopupRef.current = null;
    }

    if (!disableAITools && aiPrediction && !aiPrediction.loading && aiPrediction.lat) {
      const percentage = (aiPrediction.riskScore * 100).toFixed(0);
      const color = aiPrediction.riskLevel === 'HIGH' ? '#ff453a' : aiPrediction.riskLevel === 'MEDIUM' ? '#f59e0b' : '#32d74b';

      const popupContent = `
        <div style="color: white; font-family: system-ui; padding: 4px;">
          <div style="font-weight: bold; font-size: 14px; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
            <span style="display: inline-block; width: 8px; height: 8px; background-color: ${color}; border-radius: 50%;"></span>
            AI Prediction
          </div>
          <div style="font-size: 12px; color: #b0b0b8;">
            Flood Possibility: <strong style="color: ${color}; font-size: 14px;">${percentage}%</strong>
          </div>
          <div style="font-size: 10px; color: #8a8a93; margin-top: 4px;">
            Risk Level: ${aiPrediction.riskLevel}
          </div>
        </div>
      `;

      aiPopupRef.current = new maplibregl.Popup({ closeButton: false, className: 'ai-custom-popup' })
        .setLngLat([aiPrediction.lng, aiPrediction.lat])
        .setHTML(popupContent)
        .addTo(map.current);
    }

    return () => {
      if (aiPopupRef.current) {
        aiPopupRef.current.remove();
        aiPopupRef.current = null;
      }
    };
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

  // Slow-Mo A* Animation Effect
  useEffect(() => {
    const exploredNodes = useMapStore.getState().exploredNodes;
    if (!exploredNodes || exploredNodes.length === 0 || !mapReady.current || !map.current) {
      if (mapReady.current && map.current) {
        const source = map.current.getSource('explored-nodes');
        if (source) source.setData({ type: 'FeatureCollection', features: [] });
      }
      return;
    }

    let isCancelled = false;
    let currentIndex = 0;
    const batchSize = Math.max(1, Math.floor(exploredNodes.length / 100)); // Animate in ~100 frames

    const animate = () => {
      if (isCancelled || !map.current) return;

      currentIndex += batchSize;

      const currentNodes = exploredNodes.slice(0, currentIndex);

      const geojsonData = {
        type: 'FeatureCollection',
        features: currentNodes.map(node => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [node[1], node[0]] // [lng, lat]
          }
        }))
      };

      const source = map.current.getSource('explored-nodes');
      if (source) {
        source.setData(geojsonData);
      }

      if (currentIndex < exploredNodes.length) {
        requestAnimationFrame(animate);
      } else {
        // Animation finished! Draw the final route
        const pendingRoute = useMapStore.getState().pendingSlowMoRoute;
        if (pendingRoute && !isCancelled) {
          useMapStore.getState().setActiveRoute(pendingRoute, null);
        }
      }
    };

    requestAnimationFrame(animate);

    return () => {
      isCancelled = true;
    };
  }, [useMapStore.getState().exploredNodes]);

  // BULLETPROOF BACKUP: Subscribe directly to the Zustand store so we catch
  // updates even if React's useEffect misses them due to timing.
  useEffect(() => {
    const unsub = useMapStore.subscribe(
      (state) => {
        if (mapReady.current && map.current) {
          // Sync route
          const routeSource = map.current.getSource('active-route');
          if (routeSource) {
            const data = state.activeRoute ? state.activeRoute.geometry : { type: 'FeatureCollection', features: [] };
            routeSource.setData(data);
          }

          // Sync start location marker
          updateLocationMarker(startMarkerRef, state.startLocation, 'source');

          // Sync destination marker
          updateLocationMarker(destMarkerRef, state.endLocation, 'dest');

          // Sync help request markers
          const helpSource = map.current.getSource('help-request-markers');
          if (helpSource) {
            const reqs = state.helpRequests || [];
            helpSource.setData({
              type: 'FeatureCollection',
              features: reqs.map(req => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [req.lng, req.lat] }, properties: { id: req.id } }))
            });
          }
        }
      }
    );
    return () => unsub();
  }, []);

  // Sync responders (rescue teams) as premium markers on the map
  // Vehicle types (ambulance, boat, 4x4) use HTML markers for custom SVG icons
  // "my-location" uses native map circle layer for perfect positioning
  useEffect(() => {
    if (!map.current) return;

    // Clear existing vehicle HTML markers
    activeMarkers.current.forEach(marker => marker.remove());
    activeMarkers.current = [];

    const currentResponders = responders || [];
    currentResponders.forEach(responder => {
      // Skip my-location — handled by native layer below
      if (responder.type === 'my-location') return;

      const el = document.createElement('div');
      el.className = 'vehicle-marker';

      const dot = document.createElement('div');
      dot.className = `marker-dot ${responder.type}`;

      const label = document.createElement('div');
      label.className = 'marker-label';
      label.innerText = `${responder.name} (${responder.status})`;

      el.appendChild(dot);
      el.appendChild(label);

      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([responder.lng, responder.lat])
        .addTo(map.current);

      activeMarkers.current.push(marker);
    });

    return () => {
      activeMarkers.current.forEach(marker => marker.remove());
      activeMarkers.current = [];
    };
  }, [responders]);

  // Sync start location (My Location) as custom HTML marker
  useEffect(() => {
    if (!map.current || !mapReady.current) return;
    updateLocationMarker(startMarkerRef, startLocation, 'source');
  }, [startLocation]);

  // Sync help requests as native map circle layer + popups for resolve
  useEffect(() => {
    if (!map.current || !mapReady.current) return;

    // Clean up old popup markers
    helpMarkers.current.forEach(marker => marker.remove());
    helpMarkers.current = [];

    const source = map.current.getSource('help-request-markers');
    if (!source) return;

    if (disableHelpRequests) {
      source.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    const currentHelpRequests = helpRequests || [];

    // Update native circle layer
    source.setData({
      type: 'FeatureCollection',
      features: currentHelpRequests.map(req => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [req.lng, req.lat] },
        properties: { id: req.id, description: req.description || 'Help Required' }
      }))
    });

    // Add invisible popup-only markers for resolve functionality
    currentHelpRequests.forEach(req => {
      const el = document.createElement('div');
      el.style.width = '1px';
      el.style.height = '1px';
      el.style.opacity = '0';

      const popup = new maplibregl.Popup({ offset: 15, closeButton: false })
        .setHTML(`
          <div style="color: white; font-family: system-ui; padding: 4px; display: flex; flex-direction: column; gap: 8px; width: 140px;">
            <div style="font-weight: bold; font-size: 13px; color: #fca5a5; display: flex; align-items: center; gap: 6px; justify-content: center;">
               Help Required
            </div>
            <div style="font-size: 10px; color: #a1a1aa; text-align: center; line-height: 1.4;">
              Lat: ${req.lat.toFixed(4)}<br/>
              Lng: ${req.lng.toFixed(4)}
            </div>
            <button id="resolve-map-${req.id}" style="
              width: 100%;
              padding: 6px 12px;
              border-radius: 6px;
              background-color: rgba(239, 68, 68, 0.2);
              border: 1px solid rgba(239, 68, 68, 0.4);
              color: #fca5a5;
              font-size: 11px;
              font-weight: 600;
              cursor: pointer;
              transition: all 0.2s;
            ">Resolve Request</button>
          </div>
        `);

      popup.on('open', () => {
        const btn = document.getElementById(`resolve-map-${req.id}`);
        if (btn) {
          btn.addEventListener('click', () => {
            useMapStore.getState().removeHelpRequest(req.id);
            popup.remove();
          });
        }
      });

      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([req.lng, req.lat])
        .setPopup(popup)
        .addTo(map.current);

      helpMarkers.current.push(marker);
    });

    return () => {
      helpMarkers.current.forEach(marker => marker.remove());
      helpMarkers.current = [];
    };
  }, [helpRequests, disableHelpRequests]);

  // Sync destination as custom HTML marker
  useEffect(() => {
    if (!map.current || !mapReady.current) return;
    updateLocationMarker(destMarkerRef, endLocation, 'dest');
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
          backgroundColor: 'rgba(10, 10, 12, 0.85)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 99999,
          animation: 'fadeIn 0.3s ease-out'
        }}>
          <style>{`
            .ai-custom-popup .maplibregl-popup-content {
              background: rgba(10, 10, 12, 0.95) !important;
              backdrop-filter: blur(12px) !important;
              border: 1px solid var(--dash-border) !important;
              border-radius: 12px !important;
              box-shadow: 0 8px 32px rgba(0,0,0,0.6) !important;
              padding: 12px 16px !important;
            }
            .ai-custom-popup .maplibregl-popup-tip {
              border-top-color: rgba(10, 10, 12, 0.95) !important;
              border-bottom-color: rgba(10, 10, 12, 0.95) !important;
            }
          `}</style>
          <div style={{
            width: '400px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            backgroundColor: 'var(--dash-sidebar)',
            borderRadius: '12px',
            border: '1px solid var(--dash-border)',
            boxShadow: '0 4px 24px rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                borderRadius: '8px',
                width: '48px',
                height: '48px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                flexShrink: 0,
                border: '1px solid rgba(239, 68, 68, 0.2)'
              }}>
                <ShieldAlert size={24} style={{ color: '#ef4444' }} />
              </div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'white' }}>
                {pendingAction.type === 'create' ? 'Broadcast Emergency Alert?' : 'Cancel Emergency Alert?'}
              </h3>
            </div>

            <p style={{ margin: 0, fontSize: '13px', color: 'var(--dash-text-muted)', lineHeight: '1.5' }}>
              {pendingAction.type === 'create'
                ? 'Creating this flood zone will trigger real-time routing updates and broadcast emergency response instructions to all active responders in this sector.'
                : 'Deleting this flood zone will remove the hazard overlay, recalculate routes, and notify all responders that this sector is clear.'}
            </p>

            <div style={{
              backgroundColor: 'rgba(234, 179, 8, 0.05)',
              border: '1px solid rgba(234, 179, 8, 0.2)',
              padding: '12px 16px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px'
            }}>
              <AlertTriangle size={20} style={{ color: '#eab308', flexShrink: 0, marginTop: '2px' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '12px', color: '#fbbf24', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Critical Warning
                </span>
                <span style={{ fontSize: '12px', color: 'var(--dash-text-muted)', fontWeight: 400 }}>
                  This may send emergency response instructions to all connected vehicles.
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '4px' }}>
              <button
                onClick={handleCancel}
                style={{
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--dash-border)',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                style={{
                  background: '#ef4444',
                  color: 'white',
                  border: '1px solid #ef4444',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => { e.currentTarget.style.background = '#dc2626'; e.currentTarget.style.borderColor = '#dc2626'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.borderColor = '#ef4444'; }}
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
          left: 'calc(50% - 182px)',
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
          left: 'calc(50% - 182px)',
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
                <span style={{ fontSize: '12px', color: 'var(--dash-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Flood Possibility</span>
                <span style={{
                  fontSize: '18px',
                  fontWeight: 'bold',
                  color: aiPrediction.riskLevel === 'HIGH' ? '#ff453a' : aiPrediction.riskLevel === 'MEDIUM' ? '#f59e0b' : '#32d74b'
                }}>
                  {aiPrediction.riskScore !== undefined ? `${(aiPrediction.riskScore * 100).toFixed(0)}%` : '0%'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                <span style={{ fontSize: '12px', color: 'var(--dash-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Risk Level</span>
                <span style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  color: aiPrediction.riskLevel === 'HIGH' ? '#ff453a' : aiPrediction.riskLevel === 'MEDIUM' ? '#f59e0b' : '#32d74b'
                }}>
                  {aiPrediction.riskLevel}
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
