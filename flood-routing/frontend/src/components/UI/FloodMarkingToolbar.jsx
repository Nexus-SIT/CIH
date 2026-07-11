import React from 'react';
import { MousePointerClick, Navigation } from 'lucide-react';
import { useMapStore } from '../../store/useMapStore';

export default function FloodMarkingToolbar() {
  const { mapMode, setMapMode } = useMapStore();

  return (
    <div 
      className="glass-panel flex p-4 gap-2" 
      style={{ position: 'absolute', bottom: '32px', left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}
    >
      <button 
        className={`apple-btn ${mapMode === 'view' ? 'primary' : ''}`}
        onClick={() => setMapMode('view')}
      >
        <Navigation size={18} />
        View Mode
      </button>
      <button 
        className={`apple-btn ${mapMode === 'mark-flood' ? 'danger' : ''}`}
        onClick={() => setMapMode('mark-flood')}
      >
        <MousePointerClick size={18} />
        Mark Flood Zone
      </button>
    </div>
  );
}
