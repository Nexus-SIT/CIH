import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { API_BASE_URL } from '../config';

// Module-level variable to track the reroute interval (outside Zustand to avoid serialization issues)
let _rerouteIntervalId = null;

export const useMapStore = create(
  persist(
    (set, get) => ({
      floodZones: [],
      activeRoute: null,
      recalcLatency: null,
      mapMode: 'view', // 'view' | 'lasso' | 'erase' | 'help'
      responders: [],
      helpRequests: [],
      startLocation: null,
      endLocation: null,
      vehicleType: 'ambulance',
      isRouting: false,
      routeError: null,
      rerouteEvents: [],

      // Actions
      setStartLocation: (loc) => set({ startLocation: loc }),
      setEndLocation: (loc) => set({ endLocation: loc }),
      setVehicleType: (type) => set({ vehicleType: type }),

      fetchRoute: async () => {
        const state = get();
        const { startLocation: start, endLocation: end, vehicleType } = state;
        if (!start || !end) {
          console.log('[Store] fetchRoute skipped: no start or end location');
          return;
        }

        // Prevent concurrent fetches
        if (state.isRouting) {
          console.log('[Store] fetchRoute skipped: already routing');
          return;
        }

        set({ isRouting: true, routeError: null });
        console.log(`[Store] fetchRoute called: (${start.lat.toFixed(4)},${start.lng.toFixed(4)}) -> (${end.lat.toFixed(4)},${end.lng.toFixed(4)}) vehicle=${vehicleType}`);

        try {
          const res = await fetch(`${API_BASE_URL}/route`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              startLat: start.lat,
              startLng: start.lng,
              endLat: end.lat,
              endLng: end.lng,
              vehicleType
            })
          });

          if (!res.ok) throw new Error('API Error: ' + res.status);
          const data = await res.json();
          console.log(`[Store] Route response: pathFound=${data.pathFound} nodes=${data.path?.length || 0} compute_ms=${data.compute_ms}`);

          if (data.pathFound === false) {
            set({ activeRoute: null, recalcLatency: data.compute_ms || 0, routeError: data.message || "No safe route available." });
            get().addRerouteEvent({
              time: new Date().toLocaleTimeString(),
              message: 'No safe route – destination cut off by flooding',
              type: 'reroute'
            });
          } else {
            set({
              activeRoute: {
                distance: data.distance,
                geometry: {
                  type: 'FeatureCollection',
                  features: [{
                    type: 'Feature',
                    geometry: {
                      type: 'LineString',
                      coordinates: data.path.map(p => [p.lng, p.lat])
                    }
                  }]
                }
              },
              recalcLatency: data.compute_ms || 12,
              routeError: null
            });
            get().addRerouteEvent({
              time: new Date().toLocaleTimeString(),
              message: `Route recalculated in ${data.compute_ms || '?'}ms (${data.path.length} nodes)`,
              type: 'reroute'
            });
          }
        } catch (err) {
          console.error("[Store] fetchRoute error:", err);
          set({ routeError: "Failed to find a route." });
        } finally {
          set({ isRouting: false });
        }
      },

      // Start a 3-second reroute polling interval
      startReroutePolling: () => {
        // Clear any existing interval to prevent duplicates
        if (_rerouteIntervalId) {
          clearInterval(_rerouteIntervalId);
          _rerouteIntervalId = null;
        }

        const { startLocation, endLocation, floodZones } = get();
        // Only poll if we have both endpoints and at least one flood zone
        if (!startLocation || !endLocation || floodZones.length === 0) {
          console.log('[Store] Reroute polling not needed (missing endpoints or no flood zones)');
          return;
        }

        // Immediately reroute once
        console.log('[Store] Immediate reroute + starting 3s polling interval');
        get().fetchRoute();

        _rerouteIntervalId = setInterval(() => {
          const state = get();
          if (!state.startLocation || !state.endLocation) {
            // Lost endpoints, stop polling
            get().stopReroutePolling();
            return;
          }
          if (state.floodZones.length === 0) {
            // No more flood zones, stop polling
            get().stopReroutePolling();
            return;
          }
          if (state.isRouting) {
            // Already routing, skip this tick
            console.log('[Store] Reroute poll skipped: already routing');
            return;
          }
          console.log('[Store] 3s reroute poll: recalculating shortest path');
          state.fetchRoute();
        }, 3000);
      },

      // Stop the reroute polling interval
      stopReroutePolling: () => {
        if (_rerouteIntervalId) {
          console.log('[Store] Stopping reroute polling interval');
          clearInterval(_rerouteIntervalId);
          _rerouteIntervalId = null;
        }
      },

      // Trigger reroute: starts 3s polling (replaces the old one-shot setTimeout)
      _triggerReroute: () => {
        const { startLocation, endLocation } = get();
        if (startLocation && endLocation) {
          // Small delay to ensure the backend has processed the flood-mark API call
          setTimeout(() => {
            get().startReroutePolling();
          }, 200);
        }
      },

      setMapMode: (mode) => set({ mapMode: mode }),

      addFloodZone: (zone) => {
        set((state) => ({ floodZones: [...state.floodZones, zone] }));
        get().addRerouteEvent({
          time: new Date().toLocaleTimeString(),
          message: 'Flood zone added – checking route impact...',
          type: 'flood'
        });
        // Auto-reroute
        get()._triggerReroute();
      },

      addHelpRequest: (request) => set((state) => ({
        helpRequests: [...state.helpRequests, request]
      })),

      deleteFloodZone: async (id) => {
        // Find the zone BEFORE removing it so we can tell the backend to clear those edges
        const zone = get().floodZones.find((z) => z.id === id);

        // Remove from frontend state immediately
        set((state) => ({
          floodZones: state.floodZones.filter((z) => z.id !== id)
        }));
        get().addRerouteEvent({
          time: new Date().toLocaleTimeString(),
          message: 'Flood zone removed – clearing edges & rechecking route...',
          type: 'flood'
        });

        // Tell the backend to mark those edges as 'clear' so the route can use them again
        // MUST await this before rerouting, otherwise reroute sees stale flooded edges
        if (zone && zone.geometry && zone.geometry.coordinates) {
          const coords = zone.geometry.coordinates[0]; // [[lng, lat], ...]
          const lats = coords.map(c => c[1]);
          const lngs = coords.map(c => c[0]);
          const avgLat = lats.reduce((s, v) => s + v, 0) / lats.length;
          const avgLng = lngs.reduce((s, v) => s + v, 0) / lngs.length;

          // Calculate radius (same logic as executeAdd in Map2D5)
          const R = 6371e3;
          let maxRadius = 200;
          for (const [lng, lat] of coords) {
            const dLat = (lat - avgLat) * Math.PI / 180;
            const dLng = (lng - avgLng) * Math.PI / 180;
            const a = Math.sin(dLat / 2) ** 2 + Math.cos(avgLat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
            const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            if (dist > maxRadius) maxRadius = dist;
          }
          maxRadius = Math.round(maxRadius + 50);

          try {
            const res = await fetch(`${API_BASE_URL}/flood/flood-mark`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                lat: avgLat,
                lng: avgLng,
                radiusMeters: maxRadius,
                status: 'clear'
              })
            });
            if (res.ok) {
              console.log(`[Store] Backend cleared flood edges for zone ${id}`);
            }
          } catch (err) {
            console.error('[Store] Failed to clear flood on backend:', err);
          }
        }

        // Reroute: if flood zones remain, use polling; otherwise do a one-shot recalc
        const remaining = get().floodZones;
        if (remaining.length > 0) {
          get()._triggerReroute();
        } else {
          // No flood zones left — polling would skip this, so recalculate directly
          get().stopReroutePolling();
          if (get().startLocation && get().endLocation) {
            console.log('[Store] All flood zones cleared – recalculating route');
            get().fetchRoute();
          }
        }
      },

      setActiveRoute: (route, latency) => set({
        activeRoute: route,
        recalcLatency: latency
      }),

      addRerouteEvent: (event) => set((state) => ({
        rerouteEvents: [event, ...state.rerouteEvents].slice(0, 20)
      })),

      clearFloodZones: async () => {
        // Clear all zones on the backend too — await all clears before rerouting
        const zones = get().floodZones;
        const clearPromises = [];
        for (const zone of zones) {
          if (zone.geometry && zone.geometry.coordinates) {
            const coords = zone.geometry.coordinates[0];
            const lats = coords.map(c => c[1]);
            const lngs = coords.map(c => c[0]);
            const avgLat = lats.reduce((s, v) => s + v, 0) / lats.length;
            const avgLng = lngs.reduce((s, v) => s + v, 0) / lngs.length;
            const R = 6371e3;
            let maxRadius = 200;
            for (const [lng, lat] of coords) {
              const dLat = (lat - avgLat) * Math.PI / 180;
              const dLng = (lng - avgLng) * Math.PI / 180;
              const a = Math.sin(dLat / 2) ** 2 + Math.cos(avgLat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
              const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
              if (dist > maxRadius) maxRadius = dist;
            }
            maxRadius = Math.round(maxRadius + 50);
            clearPromises.push(
              fetch(`${API_BASE_URL}/flood/flood-mark`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lat: avgLat, lng: avgLng, radiusMeters: maxRadius, status: 'clear' })
              }).catch(err => console.error('[Store] Failed to clear flood on backend:', err))
            );
          }
        }
        await Promise.all(clearPromises);
        get().stopReroutePolling();
        set({ floodZones: [], activeRoute: null, recalcLatency: null });
        // Recalculate route now that all edges are clear
        if (get().startLocation && get().endLocation) {
          console.log('[Store] All flood zones bulk-cleared – recalculating route');
          get().fetchRoute();
        }
      },

      // For chaos testing
      triggerChaosTest: (zones) => {
        set((state) => ({
          floodZones: [...state.floodZones, ...zones]
        }));
        get()._triggerReroute();
      }
    }),
    {
      name: 'flood-routing-store',
      partialize: (state) => ({
        floodZones: state.floodZones,
        activeRoute: state.activeRoute,
        recalcLatency: state.recalcLatency,
        mapMode: state.mapMode,
        responders: state.responders,
        helpRequests: state.helpRequests,
        startLocation: state.startLocation,
        endLocation: state.endLocation,
        vehicleType: state.vehicleType,
        routeError: state.routeError,
        rerouteEvents: state.rerouteEvents
      })
    }
  )
);
