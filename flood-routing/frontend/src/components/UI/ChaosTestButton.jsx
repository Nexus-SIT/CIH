import React from 'react';
import { Zap } from 'lucide-react';
import { useMapStore } from '../../store/useMapStore';
import { API_BASE_URL } from '../../config';


export default function ChaosTestButton() {
  const { triggerChaosTest, setActiveRoute } = useMapStore();

  const handleChaosTest = async () => {
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

    try {
      await fetch(`${API_BASE_URL}/flood`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: { lat: baseLat, lng: baseLng },
          reported_by: 'admin',
          depth_estimate_m: 0.8
        })
      });
    } catch (err) {
      console.error("Chaos test flood API failed", err);
    }
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
