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

    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
    const [isNavExpanded, setIsNavExpanded] = useState(true);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [pickingLocationFor, setPickingLocationFor] = useState(null);
    const [isSlowMoRunning, setIsSlowMoRunning] = useState(false);
    const [volunteerRole, setVolunteerRole] = useState('new_user');

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
        // Reset mapMode to 'view' so flood marking tools don't carry over from Command
        useMapStore.getState().setMapMode('view');

        // Auto-assign hardcoded location as the starting point
        const latitude = 12.5015;
        const longitude = 74.9890;
        setStartLocation({ lat: latitude, lng: longitude, name: 'My Location' });

        // Add the responder marker to the map
        const currentResponders = useMapStore.getState().responders;
        const existing = currentResponders.find(r => r.id === 'my-loc');
        if (!existing) {
            useMapStore.setState({
                responders: [
                    ...currentResponders,
                    { id: 'my-loc', name: 'My Location', type: 'my-location', lat: latitude, lng: longitude, status: 'Active' }
                ]
            });
        }

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
        // Hardcode location for consistent testing between website and app
        let latitude = 12.5015;
        let longitude = 74.9890;
        
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
    };

    const handleMapClick = (lngLat) => {
        const name = `Map Pick (${lngLat.lat.toFixed(4)}, ${lngLat.lng.toFixed(4)})`;
        if (pickingLocationFor === 'start') {
            setStartLocation({ lat: lngLat.lat, lng: lngLat.lng, name });
            // Update the responder marker position too
            const currentResponders = useMapStore.getState().responders;
            useMapStore.setState({
                responders: currentResponders.map(r => r.id === 'my-loc' ? { ...r, lat: lngLat.lat, lng: lngLat.lng } : r)
            });
            setPickingLocationFor(null);
        } else {
            setEndLocation({ lat: lngLat.lat, lng: lngLat.lng, name });
        }
        if (isMobile) {
            setIsNavExpanded(false);
        }
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
                                coordinates: [
                                    [startLocation.lng, startLocation.lat],
                                    ...data.path.map(p => [p.lng, p.lat]),
                                    [endLocation.lng, endLocation.lat]
                                ]
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
        <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
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
                    @keyframes simpleFade {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                    .mobile-nav-container {
                        overflow: hidden;
                    }
                    .mobile-nav-collapsed {
                        position: absolute !important;
                        bottom: 32px !important;
                        top: auto !important;
                        left: 50% !important;
                        right: auto !important;
                        transform: translateX(-50%) !important;
                        z-index: 1000;
                        padding: 0 !important;
                        width: auto !important;
                        min-width: 200px;
                        height: 52px !important;
                        border-radius: 999px !important;
                        background: var(--accent-color) !important;
                        box-shadow: 0 8px 32px rgba(0,0,0,0.5) !important;
                        cursor: pointer;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        border: none !important;
                        backdrop-filter: none !important;
                        animation: simpleFade 0.2s ease-in-out;
                    }
                    .pill-content {
                        display: flex;
                        align-items: stretch;
                        width: 100%;
                        height: 100%;
                        color: white;
                        font-weight: bold;
                        font-size: 15px;
                    }
                    .mobile-nav-expanded {
                        /* Normal glass panel styles */
                        max-height: 65vh;
                        animation: simpleFade 0.2s ease-in-out;
                    }
                `}
            </style>

            {(pickingLocationFor === 'start' || !endLocation) && (
                <div style={{ position: 'absolute', top: 120, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: pickingLocationFor === 'start' ? 'rgba(59, 130, 246, 0.9)' : 'rgba(59, 130, 246, 0.9)', color: 'white', padding: '8px 16px', borderRadius: '20px', fontWeight: 'bold', fontSize: '14px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', pointerEvents: 'none' }}>
                    {pickingLocationFor === 'start' ? '📍 Click on the map to set Starting Point' : 'Click anywhere on the map to set Destination'}
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
            {isMobile && !isNavExpanded ? (
                /* Pill Content (Only visible when collapsed) */
                <div 
                    className="mobile-nav-collapsed"
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsNavExpanded(true);
                    }}
                >
                    <div className="pill-content">
                        <div 
                            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '0 24px', borderRight: '1px solid rgba(255,255,255,0.2)' }}
                            onClick={(e) => {
                                e.stopPropagation(); // Don't expand the panel
                                if (isLoading) return;
                                const state = useMapStore.getState();
                                if (state.floodZones && state.floodZones.length > 0) {
                                    state.startReroutePolling();
                                } else {
                                    fetchRoute();
                                }
                            }}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="5 3 19 12 5 21 5 3"></polygon>
                            </svg>
                            {isLoading ? 'Nav...' : 'Navigate'}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="1"></circle>
                                <circle cx="19" cy="12" r="1"></circle>
                                <circle cx="5" cy="12" r="1"></circle>
                            </svg>
                        </div>
                    </div>
                </div>
            ) : (
                /* Expanded Content (Visible when expanded or on desktop) */
                <div 
                    className={`glass-panel field-nav-panel p-4 mobile-nav-container ${isMobile ? 'mobile-nav-expanded' : ''}`} 
                    style={{ ...(isMobile && { maxHeight: '65vh', paddingBottom: '32px' }) }}
                >
                    <div className="nav-content-wrapper">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--panel-border)', paddingBottom: '12px' }}>
                            <h2 className="text-md font-semibold m-0">
                            Field Navigation
                        </h2>
                        {isMobile && (
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsNavExpanded(false);
                                }} 
                                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', cursor: 'pointer', fontSize: '18px', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                            >
                                &times;
                            </button>
                        )}
                    </div>

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
                    
                    {/* From: Start Location */}
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', width: '36px' }}>From:</span>
                        <div 
                            onClick={() => setPickingLocationFor(pickingLocationFor === 'start' ? null : 'start')}
                            style={{ 
                                flex: 1, padding: '8px', 
                                background: pickingLocationFor === 'start' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.05)', 
                                border: pickingLocationFor === 'start' ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid transparent',
                                borderRadius: '6px', fontSize: '12px', 
                                color: startLocation ? 'white' : 'var(--text-secondary)', 
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                cursor: 'pointer', transition: 'all 0.2s ease'
                            }}
                        >
                            <span>{startLocation ? startLocation.name || 'My Location' : 'Click to set start'}</span>
                            <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                                {pickingLocationFor === 'start' ? '📍 Pick on map' : '✏️'}
                            </span>
                        </div>
                    </div>

                    {/* To: Destination */}
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', width: '36px' }}>To:</span>
                        <div style={{ flex: 1, padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', fontSize: '12px', color: endLocation ? 'white' : 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>{endLocation ? endLocation.name || `${endLocation.lat.toFixed(4)}, ${endLocation.lng.toFixed(4)}` : 'Search below or click map'}</span>
                        </div>
                    </div>

                    {/* Landmark Search */}
                    <form onSubmit={handleSearch} style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search landmark / place..."
                            style={{ 
                                flex: 1, padding: '8px 12px', 
                                background: 'rgba(255,255,255,0.08)', 
                                border: '1px solid rgba(255,255,255,0.15)', 
                                borderRadius: '8px', fontSize: '12px', color: 'white', outline: 'none',
                                transition: 'border-color 0.2s ease'
                            }}
                            onFocus={(e) => e.target.style.borderColor = 'rgba(59, 130, 246, 0.5)'}
                            onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.15)'}
                        />
                        <button type="submit" className="apple-btn" disabled={isSearching || !searchQuery.trim()} style={{ padding: '8px 14px', fontSize: '12px' }}>
                            {isSearching ? '...' : '🔍'}
                        </button>
                    </form>

                    {/* Search Results Dropdown */}
                    {searchResults.length > 0 && (
                        <div style={{ 
                            maxHeight: '150px', overflowY: 'auto', 
                            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)',
                            borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)',
                            display: 'flex', flexDirection: 'column'
                        }}>
                            {searchResults.slice(0, 6).map((result, idx) => (
                                <div 
                                    key={idx}
                                    onClick={() => {
                                        setEndLocation({ lat: parseFloat(result.lat), lng: parseFloat(result.lon), name: result.display_name.split(',')[0] });
                                        setSearchResults([]);
                                        setSearchQuery('');
                                    }}
                                    style={{ 
                                        padding: '10px 12px', fontSize: '12px', color: 'white', 
                                        cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.06)',
                                        transition: 'background 0.15s ease'
                                    }}
                                    onMouseEnter={(e) => e.target.style.background = 'rgba(59, 130, 246, 0.15)'}
                                    onMouseLeave={(e) => e.target.style.background = 'transparent'}
                                >
                                    <div style={{ fontWeight: 500 }}>{result.display_name.split(',')[0]}</div>
                                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                        {result.display_name.split(',').slice(1, 3).join(',')}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {helpRequests && helpRequests.length > 0 && (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                            <span style={{ fontSize: '12px', width: '36px', color: 'var(--text-secondary)' }}>Help:</span>
                            <select 
                                style={{ flex: 1, padding: '6px', background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', fontSize: '12px', outline: 'none' }}
                                onChange={(e) => {
                                    if (e.target.value === '') return;
                                    const req = helpRequests.find(r => r.id === e.target.value);
                                    if (req) {
                                        useMapStore.getState().setEndLocation({ lat: req.lat, lng: req.lng, name: req.description });
                                    }
                                }}
                                value=""
                            >
                                <option value="" style={{ color: '#000' }}>-- Select Help Request --</option>
                                {helpRequests.map(req => (
                                    <option key={req.id} value={req.id} style={{ color: '#000' }}>
                                        {req.description} ({req.lat.toFixed(2)}, {req.lng.toFixed(2)})
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}



                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                        <button
                            onClick={() => {
                                const state = useMapStore.getState();
                                if (state.floodZones && state.floodZones.length > 0) {
                                    state.startReroutePolling();
                                } else {
                                    fetchRoute();
                                }
                            }}
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

                    {(currentRoute || endLocation) && (
                        <button
                            onClick={() => {
                                useMapStore.getState().setActiveRoute(null, null);
                                useMapStore.getState().setExploredNodes(null);
                                useMapStore.getState().setPendingSlowMoRoute(null);
                                setEndLocation(null);
                                setIsSlowMoRunning(false);
                            }}
                            className="apple-btn"
                            style={{ width: '100%', marginTop: '8px', display: 'flex', justifyContent: 'center', backgroundColor: 'rgba(255, 69, 58, 0.15)', color: '#ff453a', border: '1px solid rgba(255, 69, 58, 0.3)' }}
                        >
                            Clear Route
                        </button>
                    )}
                </div>


                {routeError && isOnline && (
                    <div style={{ backgroundColor: 'rgba(255, 69, 58, 0.1)', border: '1px solid rgba(255, 69, 58, 0.2)', padding: '12px', borderRadius: 'var(--radius-md)', marginTop: '16px' }}>
                        <h4 className="text-xs font-semibold text-danger uppercase m-0 mb-1">Route Issue</h4>
                        <p className="text-sm m-0 text-secondary">{routeError}</p>
                    </div>
                )}
                
                {/* Volunteer Reporting Panel */}
                <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span className="text-xs text-secondary font-semibold uppercase">Report Hazard</span>
                    
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', width: '36px' }}>Role:</span>
                        <select 
                            value={volunteerRole}
                            onChange={(e) => setVolunteerRole(e.target.value)}
                            style={{ flex: 1, padding: '6px', background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', fontSize: '12px', outline: 'none' }}
                        >
                            <option value="new_user" style={{ color: '#000' }}>New User</option>
                            <option value="trusted_user" style={{ color: '#000' }}>Trusted Volunteer</option>
                            <option value="moderator" style={{ color: '#000' }}>Moderator</option>
                        </select>
                    </div>
                    
                    <button
                        onClick={async () => {
                            if (!startLocation) {
                                alert("Location not acquired yet.");
                                return;
                            }
                            try {
                                const res = await fetch(`${API_BASE_URL}/volunteer/report-flood`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        lat: startLocation.lat,
                                        lng: startLocation.lng,
                                        radiusMeters: 150, // Default 150m for reports
                                        userRole: volunteerRole
                                    })
                                });
                                if (res.ok) {
                                    const data = await res.json();
                                    if (data.autoApproved) {
                                        // Auto-draw the flood zone and recalculate route
                                        const points = 64;
                                        const coords = [];
                                        const km = 150 / 1000;
                                        const distanceX = km / (111.320 * Math.cos(startLocation.lat * Math.PI / 180));
                                        const distanceY = km / 110.574;
                                        for (let i = 0; i < points; i++) {
                                            const theta = (i / points) * (2 * Math.PI);
                                            const x = distanceX * Math.cos(theta);
                                            const y = distanceY * Math.sin(theta);
                                            coords.push([startLocation.lng + x, startLocation.lat + y]);
                                        }
                                        coords.push(coords[0]);
                                        
                                        const newZone = {
                                            id: `zone-${Date.now()}`,
                                            geometry: { type: 'Polygon', coordinates: [coords] }
                                        };
                                        useMapStore.getState().addFloodZone(newZone);
                                        alert("High-priority report auto-approved. Flood zone added to the map.");
                                    } else {
                                        alert("Report submitted successfully and is pending dashboard review.");
                                    }
                                } else {
                                    alert("Failed to submit report.");
                                }
                            } catch (err) {
                                console.error("Error submitting report", err);
                                alert("Error submitting report.");
                            }
                        }}
                        className="apple-btn"
                        style={{ width: '100%', marginTop: '4px', display: 'flex', justifyContent: 'center', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)' }}
                    >
                        Report Flood at My Location
                    </button>
                </div>
                
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
            )}
        </div>
    );
}