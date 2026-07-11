import React from 'react';
import { Activity } from 'lucide-react';
import { useMapStore } from '../../store/useMapStore';

export default function LatencyCounter() {
  const { recalcLatency } = useMapStore();

  if (!recalcLatency) return null;

  return (
    <div 
      className="glass-panel flex items-center gap-2 p-4" 
      style={{ position: 'absolute', top: '32px', right: '32px', zIndex: 10 }}
    >
      <Activity size={18} className="text-success" />
      <div className="flex flex-col">
        <span className="text-xs text-secondary font-semibold text-uppercase" style={{ letterSpacing: '0.5px' }}>
          Recalculated
        </span>
        <span className="text-sm font-semibold" style={{ fontFamily: 'monospace' }}>
          {recalcLatency}ms
        </span>
      </div>
    </div>
  );
}
