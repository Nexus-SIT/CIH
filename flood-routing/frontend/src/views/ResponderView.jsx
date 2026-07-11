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
    const { helpRequests } = useMapStore();
    const isOnline = useNetworkStatus();
    const [vehicleType, setVehicleType] = useState('ambulance'); // 'ambulance' | '4x4' | 'boat'
    const [currentRoute, setCurrentRoute] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [webSocketStatus, setWebSocketStatus] = useState('Disconnected');
    const [latestRerouteReason, setLatestRerouteReason] = useState('');
    const [latency, setLatency] = useState(0);

    const [startLocation, setStartLocation] = useState(null);
    const [endLocation, setEndLocation] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [pickingLocationFor, setPickingLocationFor] = useState(null);
    const [floodUpdateTrigger, setFloodUpdateTrigger] = useState(null);

    // Fallback state for SMS text display when offline
    const [smsBackupText, setSmsBackupText] = useState(
        "Proceed 500m north, bypass main junction due to waterlogging."
    );

    // Triggered when user clicks Navigate
    const fetchRoute = async (selectedVehicle = vehicleType, start = startLocation, end = endLocation) => {
        if (!start || !end) {
            alert("Please select both a Start and End location.");
            return;
        }

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
                    startLat: start.lat,
                    startLng: start.lng,
                    endLat: end.lat,
                    endLng: end.lng,
                    vehicleType: selectedVehicle
                })
            });
            if (!res.ok) throw new Error('API Error');
            data = await res.json();

            if (data.pathFound === false) {
                alert(data.message || "No safe route available. The destination may be completely cut off by flooding.");
                setCurrentRoute(null);
                useMapStore.getState().setActiveRoute(null);
                setLatency(data.compute_ms || 0);
            } else {
                setCurrentRoute(data);
                useMapStore.getState().setActiveRoute({
                    geometry: {
                        type: 'FeatureCollection',
                        features: [{
                            type: 'Feature',
                            geometry: {
                                type: 'LineString',
                                coordinates: data.path.map(p => [p.lng, p.lat])
                            }
                        }]
                    }
                }, data.distance);
                setLatency(data.compute_ms || 12);
            }
        } catch (error) {
            console.error("Failed to fetch route:", error);
            alert("Failed to find a route.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;
        setIsSearching(true);
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`);
            const data = await res.json();
            setSearchResults(data);
        } catch (err) {
            console.error("Search failed:", err);
        }
        setIsSearching(false);
    };

    // Connects to WebSocket on mount
    useEffect(() => {
        setWebSocketStatus('Connecting...');
        const ws = new WebSocket(WS_BASE_URL);

        ws.onopen = () => setWebSocketStatus('Connected');
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'flood_update') {
                    setLatestRerouteReason('New flood zone reported. Recalculating route...');
                    setFloodUpdateTrigger(Date.now());
                } else if (data.type === 'route_update') {
                    // Optional: handle route_update broadcast if we wanted to
                }
            } catch (err) {
                console.error("WS Parse Error:", err);
            }
        };
        ws.onclose = () => setWebSocketStatus('Disconnected');
        ws.onerror = () => setWebSocketStatus('Error');

        return () => ws.close();
    }, []);

    // Re-fetch route automatically if flood updates arrive
    useEffect(() => {
        if (floodUpdateTrigger && startLocation && endLocation) {
            fetchRoute();
        }
    }, [floodUpdateTrigger]);

    const handleVehicleChange = (type) => {
        setVehicleType(type);
        if (startLocation && endLocation) {
            fetchRoute(type, startLocation, endLocation);
        }
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

                setStartLocation({ lat: latitude, lng: longitude, name: 'My Location' });

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
                }
            }, (err) => {
                console.error("Location error:", err);
                alert("Unable to retrieve your location. Please check your browser permissions.");
            });
        } else {
            alert("Geolocation is not supported by this browser.");
        }
    };

    const handleMapClick = (lngLat) => {
        if (pickingLocationFor === 'start') {
            setStartLocation({ lat: lngLat.lat, lng: lngLat.lng, name: `Map Pick (${lngLat.lat.toFixed(4)}, ${lngLat.lng.toFixed(4)})` });
            
            // Also update the "my-loc" marker visually
            const currentResponders = useMapStore.getState().responders;
            const existing = currentResponders.find(r => r.id === 'my-loc');
            if (!existing) {
                useMapStore.setState({
                    responders: [
                        ...currentResponders,
                        { id: 'my-loc', name: 'My Location', type: 'my-location', lat: lngLat.lat, lng: lngLat.lng, status: 'Active' }
                    ]
                });
            } else {
                useMapStore.setState({
                    responders: currentResponders.map(r => r.id === 'my-loc' ? { ...r, lat: lngLat.lat, lng: lngLat.lng } : r)
                });
            }
        } else if (pickingLocationFor === 'end') {
            setEndLocation({ lat: lngLat.lat, lng: lngLat.lng, name: `Map Pick (${lngLat.lat.toFixed(4)}, ${lngLat.lng.toFixed(4)})` });
        }
        setPickingLocationFor(null);
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

            {pickingLocationFor && (
                <div style={{ position: 'absolute', top: 120, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: 'rgba(59, 130, 246, 0.9)', color: 'white', padding: '8px 16px', borderRadius: '20px', fontWeight: 'bold', fontSize: '14px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', pointerEvents: 'none' }}>
                    Click anywhere on the map to set {pickingLocationFor === 'start' ? 'Start' : 'Destination'}
                </div>
            )}

            {/* The 2.5D OSM Map Background */}
            <Map2D5 onMapClick={handleMapClick} />

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
                    <span className="text-xs text-secondary font-semibold uppercase">Distance</span>
                    <span className="text-sm font-semibold">
                        {currentRoute && currentRoute.distance ? `${(currentRoute.distance / 1000).toFixed(1)} km` : '--'}
                    </span>
                </div>
            </div>

            {/* Field Navigation Panel: Left on desktop, bottom sheet on mobile */}
            <div className="glass-panel field-nav-panel p-4">
                <h2 className="text-md font-semibold m-0" style={{ borderBottom: '1px solid var(--panel-border)', paddingBottom: '12px' }}>
                    Field Navigation
                </h2>

                {/* Vehicle Selector */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                    <span className="text-xs text-secondary font-semibold uppercase">Vehicle Class</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {['ambulance', '4x4', 'boat'].map((type) => (
                            <button
                                key={type}
                                disabled={!isOnline}
                                onClick={() => handleVehicleChange(type)}
                                className={`apple-btn ${vehicleType === type ? 'primary' : ''}`}
                                style={{ flex: 1, justifyContent: 'center', opacity: !isOnline ? 0.5 : 1, textTransform: 'capitalize' }}
                            >
                                {type}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Navigation Search & Route Panel */}
                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span className="text-xs text-secondary font-semibold uppercase">Navigation</span>
                    
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', width: '36px' }}>From:</span>
                        <div style={{ flex: 1, padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', fontSize: '12px', color: startLocation ? 'white' : 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                            <span>{startLocation ? startLocation.name || `${startLocation.lat.toFixed(4)}, ${startLocation.lng.toFixed(4)}` : 'Not Set'}</span>
                        </div>
                        <button onClick={() => setPickingLocationFor('start')} className="apple-btn" style={{ padding: '6px 10px', fontSize: '11px' }}>
                            📍 Pick
                        </button>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', width: '36px' }}>To:</span>
                        <div style={{ flex: 1, padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', fontSize: '12px', color: endLocation ? 'white' : 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                            <span>{endLocation ? endLocation.name || `${endLocation.lat.toFixed(4)}, ${endLocation.lng.toFixed(4)}` : 'Not Set'}</span>
                        </div>
                        <button onClick={() => setPickingLocationFor('end')} className="apple-btn" style={{ padding: '6px 10px', fontSize: '11px' }}>
                            📍 Pick
                        </button>
                    </div>

                    <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                        <input 
                            type="text" 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search destination..." 
                            style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid var(--panel-border)', background: 'rgba(0,0,0,0.5)', color: 'white', outline: 'none' }}
                        />
                        <button type="submit" className="apple-btn" disabled={isSearching} style={{ padding: '8px 12px' }}>
                            {isSearching ? '...' : 'Search'}
                        </button>
                    </form>

                    {searchResults.length > 0 && (
                        <div style={{ maxHeight: '120px', overflowY: 'auto', background: 'rgba(0,0,0,0.5)', borderRadius: '4px', border: '1px solid var(--panel-border)', marginTop: '4px' }}>
                            {searchResults.slice(0, 5).map(result => (
                                <div 
                                    key={result.place_id} 
                                    onClick={() => {
                                        setEndLocation({ lat: parseFloat(result.lat), lng: parseFloat(result.lon), name: result.display_name.split(',')[0] });
                                        setSearchResults([]);
                                        setSearchQuery('');
                                    }}
                                    style={{ padding: '8px', fontSize: '12px', borderBottom: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}
                                >
                                    {result.display_name}
                                </div>
                            ))}
                        </div>
                    )}

                    {helpRequests && helpRequests.length > 0 && (
                        <div style={{ marginTop: '8px' }}>
                            <span className="text-xs text-danger font-semibold uppercase">Active Help Requests</span>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px', maxHeight: '150px', overflowY: 'auto' }}>
                                {helpRequests.map(req => (
                                    <div 
                                        key={req.id}
                                        onClick={() => setEndLocation({ lat: req.lat, lng: req.lng, name: req.description })}
                                        style={{ padding: '10px', background: 'rgba(255,69,58,0.1)', border: '1px solid rgba(255,69,58,0.2)', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s' }}
                                    >
                                        <div style={{ fontWeight: '600', color: '#ff453a', marginBottom: '2px' }}>🚨 {req.description}</div>
                                        <div style={{ color: 'var(--text-secondary)' }}>Lat: {req.lat.toFixed(4)}, Lng: {req.lng.toFixed(4)}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <button
                        onClick={() => fetchRoute()}
                        className="apple-btn primary"
                        disabled={!startLocation || !endLocation || isLoading}
                        style={{ width: '100%', marginTop: '12px', display: 'flex', justifyContent: 'center' }}
                    >
                        {isLoading ? 'Calculating...' : 'Navigate'}
                    </button>
                </div>

                {/* Share Location Button */}
                <button
                    onClick={handleShareLocation}
                    className="apple-btn"
                    style={{ width: '100%', marginTop: '16px', display: 'flex', justifyContent: 'center', gap: '8px', alignItems: 'center' }}
                >
                    📍 Share / Update My Location
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