import { create } from 'zustand';

export const useMapStore = create((set) => ({
  floodZones: [],
  activeRoute: null,
  recalcLatency: null,
  mapMode: 'view', // 'view' | 'mark-flood'
  
  // Actions
  setMapMode: (mode) => set({ mapMode: mode }),
  
  addFloodZone: (zone) => set((state) => ({ 
    floodZones: [...state.floodZones, zone] 
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
