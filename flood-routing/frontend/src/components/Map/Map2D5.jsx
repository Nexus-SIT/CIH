import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { useMapStore } from '../../store/useMapStore';
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
    const handleClick = (e) => {
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
        addFloodZone(newZone);
      }
    };

    const currentMap = map.current;
    if (currentMap) {
      currentMap.on('click', handleClick);
      return () => currentMap.off('click', handleClick);
    }
  }, [addFloodZone]);

  return (
    <div 
      ref={mapContainer} 
      style={{ width: '100%', height: '100vh', position: 'absolute', top: 0, left: 0, zIndex: 0 }} 
    />
  );
}
