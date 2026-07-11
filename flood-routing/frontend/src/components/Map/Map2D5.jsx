import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { useMapStore } from '../../store/useMapStore';
import { USE_MOCK_DATA, API_BASE_URL } from '../../config';
import 'maplibre-gl/dist/maplibre-gl.css';

export default function Map2D5() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const { mapMode, addFloodZone, floodZones, activeRoute } = useMapStore();

  useEffect(() => {
    if (map.current) return; // initialize map only once
    
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [74.9854, 12.5101], // Kasargod
      zoom: 13,
      pitch: 60, // 2.5D view
      bearing: -20,
      antialias: true
    });

    map.current.on('style.load', () => {
      // Flood Zones Source
      map.current.addSource('flood-zones', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      
      map.current.addLayer({
        id: 'flood-zones-fill',
        type: 'fill',
        source: 'flood-zones',
        paint: {
          'fill-color': 'var(--danger-color, #ff453a)',
          'fill-opacity': 0.4
        }
      });
      
      map.current.addLayer({
        id: 'flood-zones-line',
        type: 'line',
        source: 'flood-zones',
        paint: {
          'line-color': 'var(--danger-color, #ff453a)',
          'line-width': 2
        }
      });

      // Active Route Source
      map.current.addSource('active-route', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
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
          'line-color': 'var(--success-color, #32d74b)',
          'line-width': 6,
          'line-opacity': 0.8
        }
      });
    });
  });

  // Sync state with MapLibre layers
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    const source = map.current.getSource('flood-zones');
    if (source) {
      const geojsonData = {
        type: 'FeatureCollection',
        features: floodZones.map(zone => ({
          type: 'Feature',
          properties: {},
          geometry: zone.geometry
        }))
      };
      source.setData(geojsonData);
    }
  }, [floodZones]);

  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    const source = map.current.getSource('active-route');
    if (source) {
      if (activeRoute) {
        source.setData(activeRoute.geometry);
      } else {
        source.setData({ type: 'FeatureCollection', features: [] });
      }
    }
  }, [activeRoute]);

  // Click handler for marking mode
  useEffect(() => {
    const handleClick = async (e) => {
      if (useMapStore.getState().mapMode === 'mark-flood') {
        const { lng, lat } = e.lngLat;
        // Generate a mock polygon around the clicked point for simplicity
        const size = 0.002;
        const newZone = {
          id: `zone-${Date.now()}`,
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [lng - size, lat - size],
              [lng + size, lat - size],
              [lng + size, lat + size],
              [lng - size, lat + size],
              [lng - size, lat - size]
            ]]
          }
        };
        
        if (USE_MOCK_DATA) {
          addFloodZone(newZone);
        } else {
          try {
            const res = await fetch(`${API_BASE_URL}/flood`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                location: { lat, lng },
                reported_by: 'admin',
                depth_estimate_m: 0.6
              })
            });
            if (res.ok) {
              // Optimistically add to UI, or await polling
              addFloodZone(newZone);
            }
          } catch (err) {
            console.error("Failed to mark flood zone via API", err);
          }
        }
      }
    };

    const currentMap = map.current;
    if (currentMap) {
      currentMap.on('click', handleClick);
      return () => currentMap.off('click', handleClick);
    }
  }, [addFloodZone]);

  // Poll GET /api/safezones when using real backend
  useEffect(() => {
    if (USE_MOCK_DATA) return;
    
    let intervalId;
    const fetchSafeZones = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/safezones`);
        if (res.ok) {
          const data = await res.json();
          // The API contract returns: { "zones": [ { "edge_id": "e_204", "status": "red" } ] }
          // We can parse and update the store here (this is simplified as we don't have edges geometries yet)
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

  return (
    <div 
      ref={mapContainer} 
      style={{ width: '100%', height: '100vh', position: 'absolute', top: 0, left: 0, zIndex: 0 }} 
    />
  );
}
