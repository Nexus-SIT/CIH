import React, { useState, useEffect } from 'react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import Map2D5 from '../components/Map/Map2D5';
import { API_BASE_URL, WS_BASE_URL } from '../config';
import { useMapStore } from '../store/useMapStore';
import '../styles/design-system.css';

import ambulanceImg from '../../images/ambulance.webq';
import carImg from '../../images/car.webq';
import rescueImg from '../../images/rescue.webq';



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

    const handleShareLocation = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((position) => {
                let { latitude, longitude } = position.coords;

                // Check if user is testing from outside Kasargod sector, clamp if so
                const isOutsideBounds = longitude < 74.90 || longitude > 75.08 || latitude < 12.42 || latitude > 12.60;
                if (isOutsideBounds) {
                    console.warn(`User location (${latitude}, ${longitude}) is outside Kasargod bounds. Simulating inside active region for testing.`);
                    latitude = 12.5015;
                    longitude = 74.9890;
                }
                
                // Add or update the user's location on the map via the store
                const currentResponders = useMapStore.getState().responders;
                const existing = currentResponders.find(r => r.id === 'my-loc');
                if (!existing) {
                    useMapStore.setState({
                        responders: [
                            ...currentResponders,
                            { id: 'my-loc', name: 'My Location', type: 'my-location', lat: latitude, lng: longitude, status: 'Active' }
                        ]
                    });
                } else {
                    useMapStore.setState({
                        responders: currentResponders.map(r => r.id === 'my-loc' ? { ...r, lat: latitude, lng: longitude } : r)
                    });
                }

                // Sync with backend API
                fetch(`${API_BASE_URL}/responder`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        responderId: 'my-loc',
                        vehicleType: vehicleType,
                        initialLat: latitude,
                        initialLng: longitude
                    })
                }).then((res) => {
                    if (res.ok) {
                        fetch(`${API_BASE_URL}/responder/location`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                responderId: 'my-loc',
                                lat: latitude,
                                lng: longitude
                            })
                        });
                    }
                }).catch(err => console.error("Failed to sync location to backend:", err));

                const text = `Responder Location: https://maps.google.com/?q=${latitude},${longitude}`;
                if (navigator.share) {
                    navigator.share({ title: 'My Location', text }).catch(console.error);
                } else {
                    window.location.href = `sms:?body=${encodeURIComponent(text)}`;
                }
            }, (err) => {
                console.error("Location error:", err);
                alert("Unable to retrieve your location. Please check your browser permissions.");
            });
        } else {
            alert("Geolocation is not supported by this browser.");
        }
    };

    return (
        <div style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden' }}>
            <style>
                {`
                    .marker-dot {
                        opacity: 0.3 !important;
                        filter: grayscale(100%);
                        transition: all 0.3s ease;
                    }
                    .marker-dot${vehicleType === '4x4' ? '[class~="4x4"]' : '.' + vehicleType} {
                        opacity: 1 !important;
                        filter: grayscale(0%);
                        transform: scale(1.25);
                        z-index: 1000;
                    }
                    .marker-dot.my-location {
                        background-color: #3b82f6 !important;
                        border: 3px solid white !important;
                        border-radius: 50% !important;
                        width: 20px !important;
                        height: 20px !important;
                        box-shadow: 0 0 10px rgba(59, 130, 246, 0.8);
                        opacity: 1 !important;
                        filter: none !important;
                        z-index: 2000;
                    }
                    .marker-dot.ambulance {
                        background-image: url('${ambulanceImg}');
                        background-size: contain;
                        background-repeat: no-repeat;
                        background-position: center;
                        background-color: transparent !important;
                        width: 48px !important;
                        height: 48px !important;
                        border-radius: 0 !important;
                        border: none !important;
                    }
                    .marker-dot[class~="4x4"] {
                        background-image: url('${carImg}');
                        background-size: contain;
                        background-repeat: no-repeat;
                        background-position: center;
                        background-color: transparent !important;
                        width: 48px !important;
                        height: 48px !important;
                        border-radius: 0 !important;
                        border: none !important;
                    }
                    .marker-dot.boat {
                        background-image: url('${rescueImg}');
                        background-size: contain;
                        background-repeat: no-repeat;
                        background-position: center;
                        background-color: transparent !important;
                        width: 48px !important;
                        height: 48px !important;
                        border-radius: 0 !important;
                        border: none !important;
                    }
                `}
            </style>

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

                {/* Share Location Button */}
                <button
                    onClick={handleShareLocation}
                    className="apple-btn"
                    style={{ width: '100%', marginTop: '16px', display: 'flex', justifyContent: 'center', gap: '8px', alignItems: 'center' }}
                >
                    📍 Share My Location
                </button>

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