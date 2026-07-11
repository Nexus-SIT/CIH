import React from 'react';

export default function DashboardView() {
  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Dispatcher Dashboard</h1>
        <p className="text-sm text-slate-400 mt-1">Kasargod Emergency Command Center</p>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-white mb-2">Live Telemetry Overview</h2>
        <p className="text-sm text-slate-300">
          This panel is currently being worked on. Once complete, it will display active responder routes, flood severity overlays, and SMS trigger dispatches.
        </p>
      </div>
    </div>
  );
}
