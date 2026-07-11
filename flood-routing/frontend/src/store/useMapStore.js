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
  
  // Actions
  setStartLocation: (loc) => set({ startLocation: loc }),
  setEndLocation: (loc) => set({ endLocation: loc }),
  setVehicleType: (type) => set({ vehicleType: type }),
  
  fetchRoute: async () => {
    const state = get();
    const { startLocation: start, endLocation: end, vehicleType } = state;
    if (!start || !end) return;

    set({ isRouting: true, routeError: null });

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
        
        if (!res.ok) throw new Error('API Error');
        const data = await res.json();

        if (data.pathFound === false) {
            set({ activeRoute: null, recalcLatency: data.compute_ms || 0, routeError: data.message || "No safe route available. The destination may be completely cut off by flooding." });
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
        }
    } catch (err) {
        console.error("Failed to fetch route:", err);
        set({ routeError: "Failed to find a route." });
    } finally {
        set({ isRouting: false });
    }
  },

  setMapMode: (mode) => set({ mapMode: mode }),
  
  addFloodZone: (zone) => set((state) => ({ 
    floodZones: [...state.floodZones, zone] 
  })),

  addHelpRequest: (request) => set((state) => ({
    helpRequests: [...state.helpRequests, request]
  })),

  deleteFloodZone: (id) => set((state) => ({
    floodZones: state.floodZones.filter((z) => z.id !== id)
  })),
  
  setActiveRoute: (route, latency) => set({ 
    activeRoute: route, 
    recalcLatency: latency 
  }),
  
  clearFloodZones: () => set({ floodZones: [], activeRoute: null, recalcLatency: null }),
  
  // For chaos testing
  triggerChaosTest: (zones) => set((state) => ({
    floodZones: [...state.floodZones, ...zones]
  }))
}));
