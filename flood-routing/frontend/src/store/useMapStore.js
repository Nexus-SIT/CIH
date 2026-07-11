import { create } from 'zustand';

export const useMapStore = create((set) => ({
  floodZones: [],
  activeRoute: null,
  recalcLatency: null,
  mapMode: 'view', // 'view' | 'lasso' | 'erase'
  responders: [
    { id: 'v_1', name: 'Ambulance Alpha', type: 'ambulance', lat: 12.4996, lng: 74.9869, status: 'En Route' },
    { id: 'v_2', name: 'Rescue Boat 1', type: 'boat', lat: 12.5150, lng: 74.9920, status: 'Idle' }
  ],
  
  // Actions
  setMapMode: (mode) => set({ mapMode: mode }),
  
  addFloodZone: (zone) => set((state) => ({ 
    floodZones: [...state.floodZones, zone] 
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
