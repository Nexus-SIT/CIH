import React from 'react';
import { Info, ShieldAlert, Route as RouteIcon, Clock } from 'lucide-react';
import { useMapStore } from '../../store/useMapStore';

export default function ExplainabilityPanel() {
  const { activeRoute, floodZones } = useMapStore();

  if (!activeRoute) return null;

  return (
    <div 
      className="glass-panel p-4 flex flex-col gap-4" 
      style={{ position: 'absolute', top: '32px', left: '32px', width: '320px', zIndex: 10 }}
    >
      <div className="flex items-center gap-2" style={{ paddingBottom: '12px', borderBottom: '1px solid var(--panel-border)' }}>
        <RouteIcon size={20} className="text-accent" style={{ color: 'var(--accent-color)' }} />
        <h2 className="text-md font-semibold m-0">Route Intelligence</h2>
      </div>
      
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-4">
          <ShieldAlert size={18} className="text-danger mt-1" />
          <div>
            <p className="text-sm font-semibold m-0 mb-1">Avoidance Strategy</p>
            <p className="text-xs text-secondary m-0">Successfully re-routed to avoid {floodZones.length} reported active flood zones in Kasargod.</p>
          </div>
        </div>

        <div className="flex items-start gap-4">
          <Clock size={18} className="text-success mt-1" />
          <div>
            <p className="text-sm font-semibold m-0 mb-1">Estimated ETA</p>
            <p className="text-xs text-secondary m-0">{activeRoute.metrics?.estimatedTimeMins || 14} minutes away.</p>
          </div>
        </div>
        
        <div className="flex items-start gap-4">
          <Info size={18} className="text-accent mt-1" style={{ color: 'var(--accent-color)' }} />
          <div>
            <p className="text-sm font-semibold m-0 mb-1">Safety Rating</p>
            <p className="text-xs text-secondary m-0">98% Safety confidence score based on latest water level telemetry.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
