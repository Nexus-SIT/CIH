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
        left: 'calc(50% - 182px)', 
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
          color: mapMode === 'view' ? '#000' : 'var(--dash-text-muted)',
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
          backgroundColor: mapMode === 'lasso' ? 'var(--dash-blue)' : 'transparent',
          color: mapMode === 'lasso' ? '#000' : 'var(--dash-text-muted)',
          transition: 'background-color 0.2s'
        }}
        onClick={() => setMapMode('lasso')}
      >
        <ScribbleLoop size={20} weight={mapMode === 'lasso' ? 'bold' : 'regular'} />
        {mapMode === 'lasso' && <span style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mark Flood</span>}
      </button>

      <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--dash-border)', margin: '0 4px' }} />

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
          backgroundColor: mapMode === 'erase' ? 'var(--dash-blue)' : 'transparent',
          color: mapMode === 'erase' ? '#000' : 'var(--dash-text-muted)',
          transition: 'background-color 0.2s'
        }}
        onClick={() => setMapMode('erase')}
      >
        <Eraser size={20} weight={mapMode === 'erase' ? 'bold' : 'regular'} />
        {mapMode === 'erase' && <span style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Erase</span>}
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
          backgroundColor: mapMode === 'help' ? 'var(--dash-blue)' : 'transparent',
          color: mapMode === 'help' ? '#000' : 'var(--dash-text-muted)',
          transition: 'background-color 0.2s'
        }}
        onClick={() => setMapMode('help')}
      >
        <Question size={20} weight={mapMode === 'help' ? 'bold' : 'regular'} />
        {mapMode === 'help' && <span style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Help</span>}
      </button>
    </div>
  );
}
