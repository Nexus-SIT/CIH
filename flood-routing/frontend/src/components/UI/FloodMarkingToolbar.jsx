import React from 'react';
import { PenTool, Navigation, Eraser, HelpCircle } from 'lucide-react';
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
        Navigate
      </button>
      
      <button 
        className={`apple-btn ${mapMode === 'lasso' ? 'primary' : ''}`}
        style={{ color: mapMode === 'lasso' ? 'white' : 'var(--danger-color)' }}
        onClick={() => setMapMode('lasso')}
      >
        <PenTool size={18} />
        Lasso Tool
      </button>

      <button 
        className={`apple-btn ${mapMode === 'erase' ? 'primary' : ''}`}
        style={{ color: mapMode === 'erase' ? 'white' : 'var(--warning-color)' }}
        onClick={() => setMapMode('erase')}
      >
        <Eraser size={18} />
        Eraser Tool
      </button>

      <button 
        className={`apple-btn ${mapMode === 'help' ? 'primary' : ''}`}
        style={{ color: mapMode === 'help' ? 'white' : '#3b82f6' }}
        onClick={() => setMapMode('help')}
      >
        <HelpCircle size={18} />
        Help Request
      </button>
    </div>
  );
}
