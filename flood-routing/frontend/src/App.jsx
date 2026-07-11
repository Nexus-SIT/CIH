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
        if (data.type === 'connected') {
          const { sessionId } = data;
          const state = useMapStore.getState();
          
          // If the backend has restarted, its sessionId will be different.
          // We must clear the store completely so we start fresh from the start.
          if (state.backendSessionId && state.backendSessionId !== sessionId) {
            console.log('[App] Backend server restarted! Starting fresh from the start.');
            // Clear zones on the store
            useMapStore.setState({
              floodZones: [],
              activeRoute: null,
              recalcLatency: null,
              startLocation: null,
              endLocation: null,
              routeError: null,
              rerouteEvents: [],
              backendSessionId: sessionId
            });
          } else {
            // Store the session ID for future checks
            useMapStore.setState({ backendSessionId: sessionId });
          }
        } else if (data.type === 'flood_update') {
          console.log('[WS] Flood update received:', data.affectedEdges?.length, 'edges affected');
        } else if (data.type === 'new_volunteer_report') {
          useMapStore.getState().addVolunteerReport(data.report);
        } else if (data.type === 'volunteer_report_resolved') {
          useMapStore.getState().removeVolunteerReport(data.reportId);
        }
      } catch (err) {
        console.error("WS Parse Error:", err);
      }
    };

    // Listen for local storage changes from other tabs to keep state perfectly in sync!
    const handleStorageChange = (e) => {
      if (e.key === 'flood-routing-store') {
        useMapStore.persist.rehydrate();
      }
    };
    window.addEventListener('storage', handleStorageChange);

    return () => {
      ws.close();
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  return (
    <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--dash-bg)', color: 'var(--text-primary)', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Main Top Navigation */}
      <header style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 24px', height: '64px', backgroundColor: 'var(--dash-sidebar)', borderBottom: '1px solid var(--dash-border)', position: 'relative', zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px', height: '100%' }}>
          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: '20px', fontWeight: 'bold', color: 'white', letterSpacing: '0.05em' }}>
              Aegis <span style={{ color: 'var(--dash-blue)' }}>Command</span>
            </span>
          </div>

          {/* View Switcher */}
          <div style={{ display: 'flex', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '4px', border: '1px solid var(--dash-border)' }}>
            <button
              onClick={() => setCurrentView('dashboard')}
              style={{
                padding: '6px 16px', borderRadius: '6px', fontSize: '14px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s', border: 'none',
                backgroundColor: currentView === 'dashboard' ? 'var(--dash-blue)' : 'transparent',
                color: currentView === 'dashboard' ? '#000' : 'var(--dash-text-muted)'
              }}
            >
              Command
            </button>
            <button
              onClick={() => setCurrentView('responder')}
              style={{
                padding: '6px 16px', borderRadius: '6px', fontSize: '14px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s', border: 'none',
                backgroundColor: currentView === 'responder' ? 'var(--dash-blue)' : 'transparent',
                color: currentView === 'responder' ? '#000' : 'var(--dash-text-muted)'
              }}
            >
              Responder
            </button>
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
