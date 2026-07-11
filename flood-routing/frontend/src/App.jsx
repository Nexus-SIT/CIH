import React, { useState, useEffect } from 'react';
import ResponderView from './views/ResponderView';
import DashboardView from './views/DashboardView';
import { useMapStore } from './store/useMapStore';
import { WS_BASE_URL } from './config';

import { MagnifyingGlass, Bell, Gear, User } from '@phosphor-icons/react';

function App() {
  const [currentView, setCurrentView] = useState('dashboard'); // 'responder' | 'dashboard'

  useEffect(() => {
    const ws = new WebSocket(WS_BASE_URL);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'flood_update') {
          console.log('[WS] Flood update received:', data.affectedEdges?.length, 'edges affected');
        }
      } catch (err) {
        console.error("WS Parse Error:", err);
      }
    };

    return () => ws.close();
  }, []);

  return (
    <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--dash-bg)', color: 'var(--text-primary)', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Main Top Navigation */}
      <header style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 24px', height: '64px', backgroundColor: 'var(--dash-sidebar)', borderBottom: '1px solid var(--dash-border)', position: 'relative', zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px', height: '100%' }}>
          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <h1 style={{ fontSize: '18px', fontWeight: 'bold', letterSpacing: '0.5px', margin: 0, color: 'var(--text-primary)' }}>
              Aegis <span style={{ color: 'var(--dash-blue)' }}>Command</span>
            </h1>
          </div>
          
          {/* Navigation Links */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: '24px', height: '100%' }}>
            <button
              onClick={() => setCurrentView('responder')}
              style={{ 
                height: '100%', 
                display: 'flex', 
                alignItems: 'center', 
                fontSize: '14px', 
                fontWeight: 500, 
                position: 'relative', 
                cursor: 'pointer', 
                background: 'none', 
                border: 'none',
                color: currentView === 'responder' ? 'var(--text-primary)' : 'var(--dash-text-muted)'
              }}
            >
              Responder
              {currentView === 'responder' && (
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '2px', backgroundColor: 'var(--dash-blue)' }} />
              )}
            </button>
            <button
              onClick={() => setCurrentView('dashboard')}
              style={{ 
                height: '100%', 
                display: 'flex', 
                alignItems: 'center', 
                fontSize: '14px', 
                fontWeight: 500, 
                position: 'relative', 
                cursor: 'pointer', 
                background: 'none', 
                border: 'none',
                color: currentView === 'dashboard' ? 'var(--text-primary)' : 'var(--dash-text-muted)'
              }}
            >
              Dashboard
              {currentView === 'dashboard' && (
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '2px', backgroundColor: 'var(--dash-blue)' }} />
              )}
            </button>
          </nav>
        </div>

        {/* Right Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <button style={{ background: 'none', border: 'none', color: 'var(--dash-text-muted)', cursor: 'pointer', padding: 0 }}>
            <MagnifyingGlass size={20} weight="bold" />
          </button>
          <button style={{ background: 'none', border: 'none', color: 'var(--dash-text-muted)', cursor: 'pointer', padding: 0, position: 'relative' }}>
            <Bell size={20} weight="bold" />
            <div style={{ position: 'absolute', top: '-2px', right: '-2px', width: '8px', height: '8px', backgroundColor: 'var(--danger-color)', borderRadius: '50%', border: '2px solid var(--dash-sidebar)' }} />
          </button>
          <button style={{ background: 'none', border: 'none', color: 'var(--dash-text-muted)', cursor: 'pointer', padding: 0 }}>
            <Gear size={20} weight="bold" />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', overflow: 'hidden', marginLeft: '8px', width: '32px', height: '32px', backgroundColor: 'var(--dash-blue-bg)', cursor: 'pointer', border: '1px solid var(--dash-border)' }}>
             <User size={18} weight="fill" color="var(--dash-blue)" />
          </div>
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {currentView === 'responder' ? <ResponderView /> : <DashboardView />}
      </div>
    </div>
  );
}

export default App;
