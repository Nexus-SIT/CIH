import { create } from 'zustand';
import { API_BASE_URL } from '../config';

// Module-level variable to track the reroute interval (outside Zustand to avoid serialization issues)
let _rerouteIntervalId = null;

export const useMapStore = create((set, get) => ({
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

  deleteFloodZone: (id) => {
    set((state) => ({
      floodZones: state.floodZones.filter((z) => z.id !== id)
    }));
    get().addRerouteEvent({
      time: new Date().toLocaleTimeString(),
      message: 'Flood zone removed – rechecking route...',
      type: 'flood'
    });
    // Auto-reroute
    get()._triggerReroute();
  },
  
  setActiveRoute: (route, latency) => set({ 
    activeRoute: route, 
    recalcLatency: latency 
  }),
  
  addRerouteEvent: (event) => set((state) => ({
    rerouteEvents: [event, ...state.rerouteEvents].slice(0, 20)
  })),

  clearFloodZones: () => {
    get().stopReroutePolling();
    set({ floodZones: [], activeRoute: null, recalcLatency: null });
  },
  
  // For chaos testing
  triggerChaosTest: (zones) => {
    set((state) => ({
      floodZones: [...state.floodZones, ...zones]
    }));
    get()._triggerReroute();
  }
}));
