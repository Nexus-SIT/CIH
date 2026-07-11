import React, { useState, useEffect } from 'react';
import ResponderView from './views/ResponderView';
import DashboardView from './views/DashboardView';
import { useMapStore } from './store/useMapStore';
import { WS_BASE_URL } from './config';

import { MagnifyingGlass, Bell, Gear, User } from '@phosphor-icons/react';

function App() {
  const [currentView, setCurrentView] = useState('responder'); // 'responder' | 'dashboard'

  useEffect(() => {
    const ws = new WebSocket(WS_BASE_URL);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'flood_update') {
          // Rerouting is now handled by the store's 3-second polling interval.
          // No duplicate fetchRoute call needed here.
          console.log('[WS] Flood update received:', data.affectedEdges?.length, 'edges affected');
        }
      } catch (err) {
        console.error("WS Parse Error:", err);
      }
    };

    return () => ws.close();
  }, []);

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--dash-bg)', color: 'var(--text-primary)' }}>
      {/* Main Top Navigation */}
      <header className="flex justify-between items-center px-6" style={{ height: '64px', backgroundColor: 'var(--dash-sidebar)', borderBottom: '1px solid var(--dash-border)' }}>
        <div className="flex items-center gap-8 h-full">
          {/* Brand */}
          <div className="flex items-center">
            <h1 className="text-lg font-bold tracking-wide" style={{ color: 'var(--dash-blue)' }}>Emergency Command</h1>
          </div>
          
          {/* Navigation Links */}
          <nav className="flex items-center gap-6 h-full">
            <button
              onClick={() => setCurrentView('responder')}
              className="h-full flex items-center text-sm font-medium transition-colors relative cursor-pointer"
              style={{ color: currentView === 'responder' ? 'var(--text-primary)' : 'var(--dash-text-muted)', background: 'none', border: 'none' }}
            >
              Responder
              {currentView === 'responder' && (
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '2px', backgroundColor: 'var(--dash-blue)' }} />
              )}
            </button>
            <button
              onClick={() => setCurrentView('dashboard')}
              className="h-full flex items-center text-sm font-medium transition-colors relative cursor-pointer"
              style={{ color: currentView === 'dashboard' ? 'var(--text-primary)' : 'var(--dash-text-muted)', background: 'none', border: 'none' }}
            >
              Dashboard
              {currentView === 'dashboard' && (
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '2px', backgroundColor: 'var(--dash-blue)' }} />
              )}
            </button>
          </nav>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-5">
          <button style={{ background: 'none', border: 'none', color: 'var(--dash-text-muted)', cursor: 'pointer' }} className="hover:text-white transition-colors">
            <MagnifyingGlass size={20} weight="bold" />
          </button>
          <button style={{ background: 'none', border: 'none', color: 'var(--dash-text-muted)', cursor: 'pointer', position: 'relative' }} className="hover:text-white transition-colors">
            <Bell size={20} weight="bold" />
            <div style={{ position: 'absolute', top: '-2px', right: '-2px', width: '8px', height: '8px', backgroundColor: 'var(--danger-color)', borderRadius: '50%', border: '2px solid var(--dash-sidebar)' }} />
          </button>
          <button style={{ background: 'none', border: 'none', color: 'var(--dash-text-muted)', cursor: 'pointer' }} className="hover:text-white transition-colors">
            <Gear size={20} weight="bold" />
          </button>
          <div className="flex items-center justify-center rounded-full overflow-hidden ml-2" style={{ width: '32px', height: '32px', backgroundColor: 'var(--dash-blue-bg)', cursor: 'pointer', border: '1px solid var(--dash-border)' }}>
             <User size={18} weight="fill" color="var(--dash-blue)" />
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {currentView === 'responder' ? <ResponderView /> : <DashboardView />}
      </div>
    </div>
  );
}

export default App;
