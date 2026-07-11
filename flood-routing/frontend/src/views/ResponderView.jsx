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
    const { 
        helpRequests, startLocation, endLocation, vehicleType, 
        isRouting: isLoading, routeError, setStartLocation, setEndLocation, 
        setVehicleType, fetchRoute, activeRoute: currentRoute, recalcLatency: latency 
    } = useMapStore();
    
    const isOnline = useNetworkStatus();
    const [webSocketStatus, setWebSocketStatus] = useState('Disconnected');
    const [latestRerouteReason, setLatestRerouteReason] = useState('');

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [pickingLocationFor, setPickingLocationFor] = useState(null);
    const [isSlowMoRunning, setIsSlowMoRunning] = useState(false);

    // Fallback state for SMS text display when offline
    const [smsBackupText, setSmsBackupText] = useState(
        "Proceed 500m north, bypass main junction due to waterlogging."
    );

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

    useEffect(() => {
        handleShareLocation();
        
        // Resume polling if there are persisted active flood zones and endpoints
        const state = useMapStore.getState();
        if (state.startLocation && state.endLocation && state.floodZones && state.floodZones.length > 0) {
            state.startReroutePolling();
        }
    }, []);

    const handleVehicleChange = (type) => {
        setVehicleType(type);
        if (startLocation && endLocation) {
            // Note: We use setTimeout to let state update first
            setTimeout(() => fetchRoute(), 50);
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
            });
        }
    };

    const handleMapClick = (lngLat) => {
        setEndLocation({ lat: lngLat.lat, lng: lngLat.lng, name: `Map Pick (${lngLat.lat.toFixed(4)}, ${lngLat.lng.toFixed(4)})` });
    };

    const handleSlowMoAStar = async () => {
        if (!startLocation || !endLocation || isLoading || isSlowMoRunning || !isOnline) return;
        setIsSlowMoRunning(true);
        useMapStore.getState().setActiveRoute(null, null);
        useMapStore.getState().setExploredNodes(null);
        useMapStore.getState().setPendingSlowMoRoute(null);
        
        try {
            const res = await fetch(`${API_BASE_URL}/route`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    startLat: startLocation.lat,
                    startLng: startLocation.lng,
                    endLat: endLocation.lat,
                    endLng: endLocation.lng,
                    vehicleType
                })
            });
            const data = await res.json();
            
            if (data.explored && data.explored.length > 0) {
                useMapStore.getState().setExploredNodes(data.explored);
            }
            if (data.pathFound) {
                useMapStore.getState().setPendingSlowMoRoute({
                    distance: data.distance,
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
                });
            }
        } catch (err) {
            console.error(err);
        }
        
        // Reset button state after a generous timeout to allow animation to finish
        setTimeout(() => {
            setIsSlowMoRunning(false);
        }, 15000); 
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
                    .marker-dot.destination-location {
                        background-color: #ff453a !important;
                        border: 3px solid white !important;
                        border-radius: 50% !important;
                        width: 20px !important;
                        height: 20px !important;
                        box-shadow: 0 0 10px rgba(255, 69, 58, 0.8);
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

            {!endLocation && (
                <div style={{ position: 'absolute', top: 120, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: 'rgba(59, 130, 246, 0.9)', color: 'white', padding: '8px 16px', borderRadius: '20px', fontWeight: 'bold', fontSize: '14px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', pointerEvents: 'none' }}>
                    Click anywhere on the map to set Destination
                </div>
            )}

            {/* The 2.5D OSM Map Background */}
            <Map2D5 onMapClick={handleMapClick} disableAITools={true} />

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
                            <span>{startLocation ? startLocation.name || 'My Location' : 'Locating current location...'}</span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', width: '36px' }}>To:</span>
                        <div style={{ flex: 1, padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', fontSize: '12px', color: endLocation ? 'white' : 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                            <span>{endLocation ? endLocation.name || `${endLocation.lat.toFixed(4)}, ${endLocation.lng.toFixed(4)}` : 'Click map to select destination'}</span>
                        </div>
                    </div>

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

                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                        <button
                            onClick={() => fetchRoute()}
                            className="apple-btn primary"
                            disabled={!startLocation || !endLocation || isLoading || isSlowMoRunning || !isOnline}
                            style={{ flex: 1, display: 'flex', justifyContent: 'center' }}
                        >
                            {isLoading ? 'Calculating...' : 'Navigate'}
                        </button>
                        
                        <button
                            onClick={handleSlowMoAStar}
                            className="apple-btn"
                            disabled={!startLocation || !endLocation || isLoading || isSlowMoRunning || !isOnline}
                            style={{ flex: 1, display: 'flex', justifyContent: 'center', backgroundColor: '#f59e0b', color: '#000', border: 'none' }}
                        >
                            {isSlowMoRunning ? 'Visualizing...' : 'Slow-Mo A*'}
                        </button>
                    </div>
                </div>


                {routeError && isOnline && (
                    <div style={{ backgroundColor: 'rgba(255, 69, 58, 0.1)', border: '1px solid rgba(255, 69, 58, 0.2)', padding: '12px', borderRadius: 'var(--radius-md)', marginTop: '16px' }}>
                        <h4 className="text-xs font-semibold text-danger uppercase m-0 mb-1">Route Issue</h4>
                        <p className="text-sm m-0 text-secondary">{routeError}</p>
                    </div>
                )}
                
                {/* Explainability Context */}
                {latestRerouteReason && isOnline && !routeError && (
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