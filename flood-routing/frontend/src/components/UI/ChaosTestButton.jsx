import React from 'react';
import { Zap } from 'lucide-react';
import { useMapStore } from '../../store/useMapStore';

// Dummy route generator for Kasargod
const generateMockRoute = () => {
  return {
    geometry: {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [74.9854, 12.5101],
            [74.9880, 12.5120],
            [74.9920, 12.5160],
            [74.9980, 12.5200]
          ]
        }
      }]
    },
    metrics: { estimatedTimeMins: Math.floor(Math.random() * 10) + 10 }
  };
};

export default function ChaosTestButton() {
  const { triggerChaosTest, setActiveRoute } = useMapStore();

  const handleChaosTest = () => {
    // 1. Drop a random flood zone near the route
    const randomOffsetLng = (Math.random() - 0.5) * 0.005;
    const randomOffsetLat = (Math.random() - 0.5) * 0.005;
    const baseLng = 74.9854 + randomOffsetLng;
    const baseLat = 12.5101 + randomOffsetLat;
    const size = 0.002;
    
    const chaosZone = {
      id: `chaos-${Date.now()}`,
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [baseLng - size, baseLat - size],
          [baseLng + size, baseLat - size],
          [baseLng + size, baseLat + size],
          [baseLng - size, baseLat + size],
          [baseLng - size, baseLat - size]
        ]]
      }
    };
    
    triggerChaosTest([chaosZone]);

    // 2. Simulate recalculation delay
    const start = performance.now();
    setTimeout(() => {
      const end = performance.now();
      const latency = Math.round(end - start);
      
      // 3. Set the new route and report latency
      setActiveRoute(generateMockRoute(), latency);
    }, 400 + Math.random() * 200); // 400-600ms fake latency
  };

  return (
    <div style={{ position: 'absolute', bottom: '32px', right: '32px', zIndex: 10 }}>
      <button 
        className="apple-btn"
        style={{ background: 'rgba(255, 69, 58, 0.2)', border: '1px solid rgba(255, 69, 58, 0.5)', color: '#ff453a' }}
        onClick={handleChaosTest}
      >
        <Zap size={18} fill="currentColor" />
        Trigger Chaos Test
      </button>
    </div>
  );
}
