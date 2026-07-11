import React from 'react';
import { NavigationArrow, ScribbleLoop, Eraser, Question, Brain } from '@phosphor-icons/react';
import { useMapStore } from '../../store/useMapStore';
import { API_BASE_URL } from '../../config';
export default function FloodMarkingToolbar() {
  const { mapMode, setMapMode } = useMapStore();

  return (
    <div 
      style={{ 
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '8px',
        borderRadius: '9999px',
        position: 'absolute', 
        bottom: '32px', 
        left: '50%', 
        transform: 'translateX(-50%)', 
        zIndex: 10,
        backgroundColor: 'var(--dash-sidebar)',
        border: '1px solid var(--dash-border)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
      }}
    >
      <button 
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          borderRadius: '9999px',
          cursor: 'pointer',
          border: 'none',
          padding: '8px 16px',
          backgroundColor: mapMode === 'view' ? 'var(--dash-blue)' : 'transparent',
          color: mapMode === 'view' ? '#000' : 'var(--text-primary)',
          transition: 'background-color 0.2s'
        }}
        onClick={() => setMapMode('view')}
      >
        <NavigationArrow size={20} weight={mapMode === 'view' ? 'bold' : 'regular'} />
        {mapMode === 'view' && <span style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Navigate</span>}
      </button>
      
      <button 
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          borderRadius: '9999px',
          cursor: 'pointer',
          border: 'none',
          padding: '8px 16px',
          backgroundColor: mapMode === 'lasso' ? 'rgba(255,255,255,0.1)' : 'transparent',
          color: mapMode === 'lasso' ? 'white' : 'var(--dash-text-muted)',
          transition: 'background-color 0.2s'
        }}
        onClick={() => setMapMode('lasso')}
      >
        <ScribbleLoop size={20} weight={mapMode === 'lasso' ? 'bold' : 'regular'} />
      </button>

      <button 
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          borderRadius: '9999px',
          cursor: 'pointer',
          border: 'none',
          padding: '8px 16px',
          backgroundColor: mapMode === 'ai-predict' ? 'rgba(255,255,255,0.1)' : 'transparent',
          color: mapMode === 'ai-predict' ? '#f59e0b' : 'var(--dash-text-muted)',
          transition: 'background-color 0.2s'
        }}
        onClick={() => setMapMode('ai-predict')}
        title="Single Area AI Scan"
      >
        <Brain size={20} weight={mapMode === 'ai-predict' ? 'fill' : 'regular'} />
      </button>

      <button 
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          borderRadius: '9999px',
          cursor: 'pointer',
          border: 'none',
          padding: '8px 16px',
          backgroundColor: 'transparent',
          color: '#a855f7', // Violet color for scan button
          transition: 'background-color 0.2s',
          border: '1px solid rgba(168, 85, 247, 0.3)',
          marginLeft: '4px'
        }}
        onClick={() => {
          // Trigger Full Map Scan
          setMapMode('view'); // Exit other modes
          useMapStore.getState().setAIMapScan({ loading: true });
          
          fetch(`${API_BASE_URL}/predict-flood/scan`)
            .then(res => res.json())
            .then(data => {
              if (data.error) throw new Error(data.error);
              useMapStore.getState().setAIMapScan(data);
            })
            .catch(err => {
              console.error(err);
              useMapStore.getState().setAIMapScan(null);
              alert("Full Map Scan failed: " + err.message);
            });
        }}
        title="Full Map AI Scan"
      >
        <span style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Full Scan</span>
      </button>

      <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--dash-border)', margin: '0 8px' }} />

      <button 
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          borderRadius: '9999px',
          cursor: 'pointer',
          border: 'none',
          padding: '8px 16px',
          backgroundColor: mapMode === 'erase' ? 'rgba(255,255,255,0.1)' : 'transparent',
          color: mapMode === 'erase' ? 'white' : 'var(--dash-text-muted)',
          transition: 'background-color 0.2s'
        }}
        onClick={() => setMapMode('erase')}
      >
        <Eraser size={20} weight={mapMode === 'erase' ? 'bold' : 'regular'} />
      </button>

      <button 
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          borderRadius: '9999px',
          cursor: 'pointer',
          border: 'none',
          padding: '8px 16px',
          backgroundColor: mapMode === 'help' ? 'rgba(255,255,255,0.1)' : 'transparent',
          color: mapMode === 'help' ? 'white' : 'var(--dash-text-muted)',
          transition: 'background-color 0.2s'
        }}
        onClick={() => setMapMode('help')}
      >
        <Question size={20} weight={mapMode === 'help' ? 'bold' : 'regular'} />
      </button>
    </div>
  );
}
