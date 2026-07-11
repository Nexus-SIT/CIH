import React, { useState, useEffect } from 'react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import Map2D5 from '../components/Map/Map2D5';
import { USE_MOCK_DATA, API_BASE_URL, WS_BASE_URL } from '../config';
import '../styles/design-system.css';

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
            let data;
            
            if (USE_MOCK_DATA) {
                // Using mock payload for instant standalone operation
                data = MOCK_ROUTE_RESPONSE;
                // Add an artificial delay for realism
                await new Promise(resolve => setTimeout(resolve, 500));
            } else {
                // POST request to /api/route matching the exact spec
                const res = await fetch(`${API_BASE_URL}/route`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        start: { lat: 12.4996, lng: 74.9869 },
                        end: { lat: 12.5231, lng: 74.9950 },
                        vehicle_type: selectedVehicle
                    })
                });
                if (!res.ok) throw new Error('API Error');
                data = await res.json();
            }

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
        if (USE_MOCK_DATA) {
            setWebSocketStatus('Connected (Simulated)');
            return;
        }

        setWebSocketStatus('Connecting...');
        const ws = new WebSocket(`${WS_BASE_URL}/route/${routeId}`);

        ws.onopen = () => setWebSocketStatus('Connected');
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.event === 'route_updated') {
                    setCurrentRoute(prev => ({ ...prev, path: data.path }));
                    setLatestRerouteReason(data.reason);
                    setLatency(data.compute_ms);
                }
            } catch (err) {
                console.error("WS Parse Error:", err);
            }
        };
        ws.onclose = () => setWebSocketStatus('Disconnected');
        ws.onerror = () => setWebSocketStatus('Error');
    };

    useEffect(() => {
        fetchRoute(vehicleType);
    }, [isOnline]);

    const handleVehicleChange = (type) => {
        setVehicleType(type);
        fetchRoute(type);
    };

    return (
        <div style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden' }}>
            {/* The 2.5D OSM Map Background */}
            <Map2D5 />
            
            {/* Top Status Bar (Glassmorphic) */}
            <div className="glass-panel top-status-bar">
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span className="text-xs text-secondary font-semibold uppercase">Network</span>
                    <span className={`text-sm font-semibold ${isOnline ? 'text-success' : 'text-danger'}`}>
                        {isOnline ? 'Online (WS Active)' : 'SMS Fallback'}
                    </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span className="text-xs text-secondary font-semibold uppercase">Latency</span>
                    <span className="text-sm font-semibold" style={{ fontFamily: 'monospace' }}>
                        {latency}ms
                    </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span className="text-xs text-secondary font-semibold uppercase">ETA</span>
                    <span className="text-sm font-semibold">
                        {currentRoute ? `${Math.round(currentRoute.eta_seconds / 60)} mins` : '--'}
                    </span>
                </div>
            </div>

            {/* Field Navigation Panel: Left on desktop, bottom sheet on mobile */}
            <div className="glass-panel field-nav-panel p-4">
                <h2 className="text-md font-semibold m-0" style={{ borderBottom: '1px solid var(--panel-border)', paddingBottom: '12px' }}>
                    Field Navigation
                </h2>
                
                {/* Vehicle Selector */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span className="text-xs text-secondary font-semibold uppercase">Vehicle Class</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {['ambulance', '4x4', 'boat'].map((type) => (
                            <button
                                key={type}
                                disabled={!isOnline}
                                onClick={() => handleVehicleChange(type)}
                                className={`apple-btn ${vehicleType === type ? 'primary' : ''}`}
                                style={{ flex: 1, justifyContent: 'center', opacity: !isOnline ? 0.5 : 1 }}
                            >
                                {type}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Explainability Context */}
                {latestRerouteReason && isOnline && (
                    <div style={{ backgroundColor: 'rgba(255, 69, 58, 0.1)', border: '1px solid rgba(255, 69, 58, 0.2)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
                        <h4 className="text-xs font-semibold text-danger uppercase m-0 mb-1">Reroute Executed</h4>
                        <p className="text-sm m-0 text-secondary">{latestRerouteReason}</p>
                    </div>
                )}

                {/* SMS Fallback Mode Display */}
                {!isOnline && (
                    <div style={{ backgroundColor: 'rgba(255, 214, 10, 0.1)', border: '1px solid rgba(255, 214, 10, 0.2)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
                        <h4 className="text-xs font-semibold uppercase m-0 mb-1" style={{ color: 'var(--warning-color)' }}>Cached Instructions</h4>
                        <p className="text-sm m-0 text-secondary" style={{ fontFamily: 'monospace' }}>{smsBackupText}</p>
                    </div>
                )}
            </div>
        </div>
    );
}