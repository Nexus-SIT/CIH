import { create } from 'zustand';
import { API_BASE_URL } from '../config';

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

  // Trigger reroute after a short delay (allows the backend graph to be updated first)
  _triggerReroute: () => {
    const { startLocation, endLocation } = get();
    if (startLocation && endLocation) {
      // Small delay to ensure the backend has processed the flood-mark API call
      setTimeout(() => {
        console.log('[Store] Auto-triggering reroute due to flood zone change');
        get().fetchRoute();
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

  clearFloodZones: () => set({ floodZones: [], activeRoute: null, recalcLatency: null }),
  
  // For chaos testing
  triggerChaosTest: (zones) => {
    set((state) => ({
      floodZones: [...state.floodZones, ...zones]
    }));
    get()._triggerReroute();
  }
}));
