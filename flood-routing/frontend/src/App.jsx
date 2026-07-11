import React, { useState, useEffect } from 'react';
import ResponderView from './views/ResponderView';
import DashboardView from './views/DashboardView';
import { useMapStore } from './store/useMapStore';
import { WS_BASE_URL } from './config';

function App() {
  const [currentView, setCurrentView] = useState('responder'); // 'responder' | 'dashboard'
  const fetchRoute = useMapStore(state => state.fetchRoute);
  const startLocation = useMapStore(state => state.startLocation);
  const endLocation = useMapStore(state => state.endLocation);

  useEffect(() => {
      const ws = new WebSocket(WS_BASE_URL);

      ws.onmessage = (event) => {
          try {
              const data = JSON.parse(event.data);
              if (data.type === 'flood_update') {
                  // Wait 100ms for graph to be updated then fetch
                  setTimeout(() => {
                      if (useMapStore.getState().startLocation && useMapStore.getState().endLocation) {
                          useMapStore.getState().fetchRoute();
                      }
                  }, 100);
              }
          } catch (err) {
              console.error("WS Parse Error:", err);
          }
      };

      return () => ws.close();
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      {/* Dev View Switcher Banner */}
      <div className="bg-slate-950 border-b border-slate-800 px-4 py-2.5 flex justify-between items-center text-xs">
        <span className="font-semibold text-slate-400 tracking-wider uppercase">Emergency Command Portal</span>
        <div className="flex space-x-2">
          <button
            onClick={() => setCurrentView('responder')}
            className={`px-3 py-1.5 rounded-lg transition-all font-medium uppercase tracking-wide cursor-pointer ${currentView === 'responder'
                ? 'bg-red-600 text-white shadow'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
              }`}
          >
            Responder View
          </button>
          <button
            onClick={() => setCurrentView('dashboard')}
            className={`px-3 py-1.5 rounded-lg transition-all font-medium uppercase tracking-wide cursor-pointer ${currentView === 'dashboard'
                ? 'bg-red-600 text-white shadow'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
              }`}
          >
            Dashboard View
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {currentView === 'responder' ? <ResponderView /> : <DashboardView />}
      </div>
    </div>
  );
}

export default App;
