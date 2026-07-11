import React, { useState, useEffect } from 'react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

// Tailored to match the Hour 0-1 API Contract exactly
const MOCK_ROUTE_RESPONSE = {
    route_id: "r_8f2a",
    path: [
        { lat: 12.4996, lng: 74.9869 },
        { lat: 12.5010, lng: 74.9880 }
    ],
    eta_seconds: 420,
    compute_ms: 312
};

export default function ResponderView() {
    const isOnline = useNetworkStatus();
    const [vehicleType, setVehicleType] = useState('ambulance'); // 'ambulance' | '4x4' | 'boat'
    const [currentRoute, setCurrentRoute] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [webSocketStatus, setWebSocketStatus] = useState('Disconnected');
    const [latestRerouteReason, setLatestRerouteReason] = useState('');
    const [latency, setLatency] = useState(0);

    // Fallback state for SMS text display when offline
    const [smsBackupText, setSmsBackupText] = useState(
        "Proceed 500m north, bypass main junction due to waterlogging."
    );

    // Triggered when a vehicle class changes or when user starts a journey
    const fetchRoute = async (selectedVehicle) => {
        setIsLoading(true);
        if (!isOnline) {
            setIsLoading(false);
            return; // Block API call if offline, let the UI drop to SMS fallback mode
        }

        try {
            // POST request to /api/route matching the exact spec
            // const res = await fetch('/api/route', {
            //   method: 'POST',
            //   headers: { 'Content-Type': 'application/json' },
            //   body: JSON.stringify({
            //     start: { lat: 12.4996, lng: 74.9869 },
            //     end: { lat: 12.5231, lng: 74.9950 },
            //     vehicle_type: selectedVehicle
            //   })
            // });
            // const data = await res.json();

            // Using mock payload for instant standalone operation
            const data = MOCK_ROUTE_RESPONSE;

            setCurrentRoute(data);
            setLatency(data.compute_ms);
            initializeWebSocket(data.route_id);
        } catch (error) {
            console.error("Failed to fetch route:", error);
        } finally {
            setIsLoading(false);
        }
    };

    // Connects to Karthik's wss://.../ws/route/{route_id} contract channel
    const initializeWebSocket = (routeId) => {
        setWebSocketStatus('Connecting...');
        // const ws = new WebSocket(`wss://your-backend-domain/ws/route/${routeId}`);

        // ws.onopen = () => setWebSocketStatus('Connected');
        // ws.onmessage = (event) => {
        //   const data = JSON.parse(event.data);
        //   if (data.event === 'route_updated') {
        //     setCurrentRoute(prev => ({ ...prev, path: data.path }));
        //     setLatestRerouteReason(data.reason);
        //     setLatency(data.compute_ms);
        //   }
        // };
        // ws.onclose = () => setWebSocketStatus('Disconnected');
    };

    useEffect(() => {
        fetchRoute(vehicleType);
    }, [isOnline]);

    const handleVehicleChange = (type) => {
        setVehicleType(type);
        fetchRoute(type);
    };

    return (
        <div className="flex flex-col min-h-screen bg-slate-900 text-slate-100 font-sans">

            {/* Network Alert Banners */}
            {!isOnline ? (
                <div className="bg-amber-600 text-white font-semibold text-center py-3 px-4 shadow-md transition-all">
                    <div className="text-sm tracking-wide uppercase">SMS Fallback Mode Active</div>
                    <div className="text-xs font-normal opacity-90 mt-0.5">Routing updates will proceed via text messages.</div>
                </div>
            ) : (
                <div className="bg-emerald-700 text-white text-xs font-medium px-4 py-2 flex justify-between items-center border-b border-emerald-600">
                    <div className="flex items-center space-x-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        <span>Connected to Live Engine</span>
                    </div>
                    <div className="opacity-80">Compute Engine Latency: {latency}ms</div>
                </div>
            )}

            {/* Main Container */}
            <main className="flex-1 max-w-md w-full mx-auto px-4 py-6 flex flex-col space-y-6">

                {/* Header Block */}
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-white">Field Navigation</h1>
                    <p className="text-sm text-slate-400 mt-1">Active sector: Kasargod Delta Area</p>
                </div>

                {/* Touch-Friendly Vehicle Type Selector */}
                <section className="bg-slate-800 rounded-xl p-4 border border-slate-700 shadow-sm">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                        Select Active Vehicle Class
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                        {['ambulance', '4x4', 'boat'].map((type) => (
                            <button
                                key={type}
                                disabled={!isOnline}
                                onClick={() => handleVehicleChange(type)}
                                className={`py-4 px-2 rounded-lg font-medium text-sm transition-all border flex flex-col items-center justify-center uppercase tracking-wide cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${vehicleType === type
                                    ? 'bg-red-600 text-white border-red-500 shadow-md font-bold'
                                    : 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600'
                                    }`}
                            >
                                <span className="text-xs">{type}</span>
                            </button>
                        ))}
                    </div>
                </section>

                {/* Dynamic Context Output Block */}
                {isOnline ? (
                    <section className="flex-1 flex flex-col space-y-4">
                        {/* Map Placeholder Panel */}
                        <div className="relative aspect-[4/3] w-full bg-slate-950 rounded-xl border border-slate-800 flex flex-col items-center justify-center overflow-hidden">
                            <div className="absolute top-3 left-3 bg-slate-900/90 text-[10px] font-mono px-2 py-1 rounded text-slate-400 border border-slate-700">
                                Route ID: {currentRoute?.route_id || 'Generating...'}
                            </div>

                            {isLoading ? (
                                <div className="text-sm text-slate-400 tracking-wide animate-pulse">Calculating optimal vector...</div>
                            ) : (
                                <div className="text-center px-4">
                                    <div className="text-xs font-mono text-slate-500">
                                        [Mapbox GL Geometry Stream Layer]
                                    </div>
                                    <div className="text-sm text-slate-300 font-medium mt-2">
                                        {currentRoute?.path?.length || 0} Path Coordinates Loaded
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Core Info Display Cards */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl">
                                <span className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Estimated Arrival</span>
                                <span className="text-2xl font-bold text-white mt-1 block">
                                    {currentRoute ? `${Math.round(currentRoute.eta_seconds / 60)} mins` : '--'}
                                </span>
                            </div>
                            <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl">
                                <span className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Live WS Feed</span>
                                <span className={`text-sm font-semibold mt-2 inline-flex items-center px-2 py-0.5 rounded text-xs border ${webSocketStatus === 'Connected'
                                    ? 'bg-emerald-950/50 text-emerald-400 border-emerald-800'
                                    : 'bg-slate-700 text-slate-400 border-slate-600'
                                    }`}>
                                    {webSocketStatus}
                                </span>
                            </div>
                        </div>

                        {/* Live Reweighting Reroute Explainability Block */}
                        {latestRerouteReason && (
                            <div className="bg-red-950/30 border border-red-900/60 rounded-xl p-4">
                                <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wider">Dynamic Reroute Execution Context</h4>
                                <p className="text-sm text-slate-300 mt-2 leading-relaxed">{latestRerouteReason}</p>
                            </div>
                        )}
                    </section>
                ) : (
                    /* Offline/SMS Fallback Presentation Panel */
                    <section className="bg-slate-800 border border-amber-600/30 rounded-xl p-5 flex flex-col space-y-4 shadow-inner">
                        <div>
                            <h3 className="text-sm font-bold text-amber-500 uppercase tracking-wider">Cached Route Instructions</h3>
                            <p className="text-xs text-slate-400 mt-1">Displaying localized landscape fallbacks via localized check-ins.</p>
                        </div>

                        <div className="bg-slate-900 border border-slate-700 p-4 rounded-lg font-mono text-sm text-slate-300 leading-relaxed select-all">
                            {smsBackupText}
                        </div>

                        <button
                            onClick={() => window.location.href = `sms:+91XXXXXXXXXX?body=STATUS%20${currentRoute?.route_id || 'UNKNOWN'}`}
                            className="w-full bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium py-3 rounded-lg border border-slate-600 transition-colors uppercase tracking-wide cursor-pointer"
                        >
                            Ping Inbound Gateway Status
                        </button>
                    </section>
                )}
            </main>
        </div>
    );
}