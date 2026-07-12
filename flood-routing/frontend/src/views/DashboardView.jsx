import React, { useState, useEffect } from 'react';
import Map2D5 from '../components/Map/Map2D5';
import FloodMarkingToolbar from '../components/UI/FloodMarkingToolbar';
import ChaosTestButton from '../components/UI/ChaosTestButton';
import { useMapStore } from '../store/useMapStore';
import '../styles/design-system.css';
import { 
    SquaresFour, MapTrifold, UsersThree, ChartLineUp, 
    Broadcast, Question, HouseLine, TrafficSignal, CloudRain, CaretRight, Stack, CaretDown, CaretUp, Brain, ToggleLeft, ToggleRight,
    Warning, ShieldCheck, ShieldWarning, User
} from '@phosphor-icons/react';
import { API_BASE_URL } from '../config';

export default function DashboardView() {
    const { floodZones, activeRoute, responders, rerouteEvents, isRouting, recalcLatency, mapMode, setMapMode, setAIMapScan, aiMapScan, aiSelectedPoints, setAISelectedPoints, helpRequests, removeHelpRequest, volunteerReports, removeVolunteerReport, addFloodZone } = useMapStore();
    const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'responders' | 'metrics'
    const [isEventLogOpen, setIsEventLogOpen] = useState(true);
    const isAIMode = mapMode === 'ai-predict';

    // Auto-run AI Scan every 5 minutes
    useEffect(() => {
        let intervalId;
        const runScan = () => {
            setAIMapScan({ loading: true });
            fetch(`${API_BASE_URL}/predict-flood/scan`)
                .then(res => res.json())
                .then(data => {
                    if (data.error) throw new Error(data.error);
                    setAIMapScan(data);
                    setAISelectedPoints([]); // Clear any spot check points since we only use interactive clicks now
                })
                .catch(err => {
                    console.error("AI Scan failed:", err);
                    setAIMapScan(null);
                    setAISelectedPoints([]);
                });
        };

        if (isAIMode) {
            runScan(); // Run immediately on toggle
            intervalId = setInterval(runScan, 5 * 60 * 1000); // 5 minutes polling
        } else {
            setAIMapScan(null);
            setAISelectedPoints([]);
        }

        return () => clearInterval(intervalId);
    }, [isAIMode, setAIMapScan, setAISelectedPoints]);

    const handleResolveVolunteerReport = async (reportId, action, report) => {
        try {
            if (action === 'approve') {
                const res = await fetch(`${API_BASE_URL}/flood/flood-mark`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        lat: report.lat,
                        lng: report.lng,
                        radiusMeters: report.radiusMeters,
                        status: 'flooded'
                    })
                });
                
                if (res.ok) {
                    const points = 64;
                    const coords = [];
                    const km = report.radiusMeters / 1000;
                    const distanceX = km / (111.320 * Math.cos(report.lat * Math.PI / 180));
                    const distanceY = km / 110.574;
                    for (let i = 0; i < points; i++) {
                        const theta = (i / points) * (2 * Math.PI);
                        const x = distanceX * Math.cos(theta);
                        const y = distanceY * Math.sin(theta);
                        coords.push([report.lng + x, report.lat + y]);
                    }
                    coords.push(coords[0]);
                    
                    const newZone = {
                        id: `zone-${Date.now()}`,
                        geometry: { type: 'Polygon', coordinates: [coords] }
                    };
                    addFloodZone(newZone);
                }
            }
            
            await fetch(`${API_BASE_URL}/volunteer/resolve-report`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reportId, action })
            });
            
            removeVolunteerReport(reportId);
        } catch (err) {
            console.error('Failed to resolve volunteer report', err);
        }
    };

    return (
        <div style={{ display: 'flex', width: '100%', height: '100%', backgroundColor: 'var(--dash-bg)', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            {/* Left Sidebar */}
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', width: '320px', minWidth: '320px', flexShrink: 0, backgroundColor: 'var(--dash-sidebar)', borderRight: '1px solid var(--dash-border)' }}>
                
                {/* Command Center Header */}
                <div style={{ padding: '28px 24px 16px 24px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <h2 style={{ 
                        fontSize: '20px', 
                        fontWeight: 600, 
                        margin: 0, 
                        color: '#ffffff',
                        letterSpacing: '-0.3px',
                        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif'
                    }}>
                        Common Centre
                    </h2>
                    <span style={{ 
                        fontSize: '13px', 
                        fontWeight: 400,
                        color: '#8e8e93',
                        letterSpacing: '-0.08px'
                    }}>
                        Kasaragod
                    </span>
                </div>

                {/* Navigation Menu */}
                <div style={{ display: 'flex', flexDirection: 'column', padding: '0 16px', gap: '8px', marginBottom: '32px' }}>
                    <button 
                        onClick={() => setActiveTab('overview')}
                        style={{ 
                            position: 'relative',
                            display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)', border: 'none',
                            backgroundColor: activeTab === 'overview' ? 'rgba(255,255,255,0.08)' : 'transparent',
                            color: activeTab === 'overview' ? '#ffffff' : 'var(--dash-text-muted)'
                        }}
                    >
                        <MapTrifold size={20} weight={activeTab === 'overview' ? 'fill' : 'regular'} />
                        <span style={{ fontWeight: 500, fontSize: '15px' }}>Overview</span>
                    </button>
                    <button 
                        onClick={() => setActiveTab('responders')}
                        style={{ 
                            position: 'relative',
                            display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)', border: 'none',
                            backgroundColor: activeTab === 'responders' ? 'rgba(255,255,255,0.08)' : 'transparent',
                            color: activeTab === 'responders' ? '#ffffff' : 'var(--dash-text-muted)'
                        }}
                    >
                        <UsersThree size={20} weight={activeTab === 'responders' ? 'fill' : 'regular'} />
                        <span style={{ fontWeight: 500, fontSize: '15px' }}>Responders</span>
                    </button>
                </div>

                {/* Left Panel Content Area (Tabs) */}
                <div style={{ padding: '0 24px', display: 'flex', flexDirection: 'column', gap: '24px', flex: 1, overflowY: 'auto' }}>
                    {activeTab === 'overview' ? (
                        <>
                            {/* Stats */}
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dash-text-muted)' }}>REPORTED FLOODS</span>
                                    <span style={{ fontSize: '20px', fontWeight: 'bold', color: 'white' }}>{floodZones.length.toString().padStart(2, '0')}</span>
                                </div>
                                <div style={{ width: '100%', height: '2px', backgroundColor: 'var(--dash-border)', position: 'relative' }}>
                                    <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: Math.min(100, floodZones.length * 10) + '%', backgroundColor: 'var(--dash-blue)' }} />
                                </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dash-text-muted)' }}>ACTIVE REROUTES</span>
                                    <span style={{ fontSize: '20px', fontWeight: 'bold', color: 'white' }}>{activeRoute ? '01' : '00'}</span>
                                </div>
                                <div style={{ width: '100%', height: '2px', backgroundColor: 'var(--dash-border)', position: 'relative' }}>
                                    <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: activeRoute ? '15%' : '0%', backgroundColor: 'var(--dash-blue)' }} />
                                </div>
                            </div>

                            {/* AI Prediction Engine Panel */}
                            <div style={{ display: 'flex', flexDirection: 'column', marginTop: '16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                    <Brain size={16} color="var(--dash-text-muted)" />
                                    <span style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dash-text-muted)' }}>AI Prediction Engine</span>
                                </div>
                                <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid var(--dash-border)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    {/* AI Mode Toggle */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            <span style={{ fontSize: '14px', fontWeight: 500, color: 'white' }}>AI Mode</span>
                                            <span style={{ fontSize: '11px', color: 'var(--dash-text-muted)' }}>Click map to predict risk</span>
                                        </div>
                                        <button 
                                            onClick={() => {
                                                const nextMode = isAIMode ? 'view' : 'ai-predict';
                                                setMapMode(nextMode);
                                                if (nextMode === 'view') {
                                                    setAIMapScan(null);
                                                }
                                            }}
                                            style={{ background: 'none', border: 'none', color: isAIMode ? '#f59e0b' : 'var(--dash-text-muted)', cursor: 'pointer', padding: 0 }}
                                        >
                                            {isAIMode ? <ToggleRight size={32} weight="fill" /> : <ToggleLeft size={32} weight="regular" />}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Help Requests Panel */}
                            {helpRequests && helpRequests.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', marginTop: '16px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                        <Broadcast size={16} color="var(--dash-text-muted)" />
                                        <span style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dash-text-muted)' }}>Help Requests ({helpRequests.length})</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                                        {helpRequests.map((req) => (
                                            <div 
                                                key={req.id} 
                                                style={{ 
                                                    padding: '12px', 
                                                    borderRadius: '12px', 
                                                    backgroundColor: 'rgba(239, 68, 68, 0.05)', 
                                                    border: '1px solid rgba(239, 68, 68, 0.2)',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center'
                                                }}
                                            >
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#fca5a5', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <Warning size={14} color="#fca5a5" weight="fill" />
                                                        {req.description}
                                                    </span>
                                                    <span style={{ fontSize: '11px', color: 'var(--dash-text-muted)' }}>
                                                        Lat: {req.lat.toFixed(4)}, Lng: {req.lng.toFixed(4)}
                                                    </span>
                                                </div>
                                                <button
                                                    onClick={() => removeHelpRequest(req.id)}
                                                    style={{
                                                        padding: '6px 10px',
                                                        borderRadius: '6px',
                                                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                                        border: '1px solid rgba(239, 68, 68, 0.3)',
                                                        color: '#fca5a5',
                                                        fontSize: '11px',
                                                        fontWeight: 600,
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s'
                                                    }}
                                                    onMouseOver={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)'; }}
                                                    onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)'; }}
                                                >
                                                    Resolve
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {/* Volunteer Reports Section */}
                            {volunteerReports && volunteerReports.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <UsersThree size={16} color="var(--dash-text-muted)" />
                                        <span style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dash-text-muted)' }}>Pending Volunteer Reports ({volunteerReports.length})</span>
                                    </div>
                                    {volunteerReports.map((report) => (
                                        <div key={report.id} style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                <span style={{ fontSize: '14px', fontWeight: 600, color: 'white', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    {report.userRole === 'moderator' ? (
                                                        <>
                                                            <ShieldAlert size={16} color="#ff453a" weight="fill" style={{ flexShrink: 0 }} />
                                                            <span>Moderator Report</span>
                                                        </>
                                                    ) : report.userRole === 'trusted_user' ? (
                                                        <>
                                                            <ShieldCheck size={16} color="#32d74b" weight="fill" style={{ flexShrink: 0 }} />
                                                            <span>Trusted User Report</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <User size={16} color="var(--dash-text-muted)" style={{ flexShrink: 0 }} />
                                                            <span>New User Report</span>
                                                        </>
                                                    )}
                                                </span>
                                                <span style={{ fontSize: '12px', color: 'var(--dash-text-muted)' }}>Wt: {report.weight}</span>
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                                                <button
                                                    onClick={() => handleResolveVolunteerReport(report.id, 'approve', report)}
                                                    style={{ flex: 1, padding: '6px', borderRadius: '6px', backgroundColor: 'rgba(50, 215, 75, 0.1)', border: '1px solid rgba(50, 215, 75, 0.3)', color: '#32d74b', fontSize: '12px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                                                >
                                                    Approve
                                                </button>
                                                <button
                                                    onClick={() => handleResolveVolunteerReport(report.id, 'reject', report)}
                                                    style={{ flex: 1, padding: '6px', borderRadius: '6px', backgroundColor: 'rgba(255, 69, 58, 0.1)', border: '1px solid rgba(255, 69, 58, 0.3)', color: '#ff453a', fontSize: '12px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                                                >
                                                    Reject
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Existing Responders Section */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                <UsersThree size={16} color="var(--dash-text-muted)" />
                                <span style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dash-text-muted)' }}>Active Responders</span>
                            </div>
                            {responders && responders.length > 0 ? (
                                responders.map((responder) => (
                                    <div key={responder.id} style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid var(--dash-border)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                            <span style={{ fontSize: '14px', fontWeight: 600, color: 'white' }}>{responder.name}</span>
                                            <span style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', color: responder.status === 'Active' || responder.status === 'En Route' ? 'var(--success-color)' : 'var(--dash-text-muted)' }}>
                                                {responder.status}
                                            </span>
                                        </div>
                                        <span style={{ fontSize: '12px', color: 'var(--dash-text-muted)' }}>
                                            Type: {responder.type}
                                        </span>
                                    </div>
                                ))
                            ) : (
                                <div style={{ padding: '12px', borderRadius: '8px', textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.05)' }}>
                                    <span style={{ fontSize: '14px', color: 'var(--dash-text-muted)' }}>No active responders</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Map Area */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden', backgroundColor: 'var(--dash-bg)' }}>
                <Map2D5 confirmChanges={true} />

                {/* Right Overlays: Active Alerts & Atmospheric */}
                <div style={{ position: 'absolute', right: '24px', top: '24px', display: 'flex', flexDirection: 'column', gap: '16px', zIndex: 10, width: '340px' }}>
                    
                    {/* Active Alerts List (Real Data) */}
                    <div style={{ backgroundColor: 'var(--dash-sidebar)', borderRadius: '16px', padding: '16px', border: '1px solid var(--dash-border)', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isEventLogOpen ? '12px' : '0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '14px', fontWeight: 600, color: 'white' }}>Live Event Log</span>
                                {rerouteEvents.length > 0 && (
                                    <div style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', backgroundColor: 'rgba(255, 69, 58, 0.2)', color: 'var(--danger-color)' }}>
                                        URGENT
                                    </div>
                                )}
                            </div>
                            <button 
                                onClick={() => setIsEventLogOpen(!isEventLogOpen)}
                                style={{ background: 'none', border: 'none', color: 'var(--dash-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                                {isEventLogOpen ? <CaretUp size={16} /> : <CaretDown size={16} />}
                            </button>
                        </div>
                        
                        {isEventLogOpen && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
                                {rerouteEvents.length === 0 ? (
                                    <div style={{ borderRadius: '12px', padding: '16px', textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid var(--dash-border)' }}>
                                        <span style={{ fontSize: '12px', color: 'var(--dash-text-muted)' }}>No events yet. Draw a flood zone to trigger routing.</span>
                                    </div>
                                ) : (
                                    rerouteEvents.map((evt, i) => (
                                        <div key={i} style={{ borderRadius: '12px', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid var(--dash-border)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', width: '40px', height: '40px', backgroundColor: evt.type === 'reroute' ? 'rgba(50, 215, 75, 0.1)' : evt.type === 'flood' ? 'rgba(255, 69, 58, 0.1)' : 'rgba(255,255,255,0.05)' }}>
                                                    {evt.type === 'reroute' ? (
                                                        <Stack size={20} color="var(--success-color)" weight="fill" />
                                                    ) : evt.type === 'flood' ? (
                                                        <HouseLine size={20} color="var(--danger-color)" weight="fill" />
                                                    ) : (
                                                        <TrafficSignal size={20} color="var(--dash-blue)" weight="fill" />
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'white', margin: 0 }}>
                                                        {evt.type === 'reroute' ? 'System Reroute' : evt.type === 'flood' ? 'Flood Warning' : 'Update'}
                                                    </span>
                                                    <span style={{ fontSize: '11px', color: 'var(--dash-text-muted)' }}>{evt.message}</span>
                                                </div>
                                            </div>
                                            <span style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--dash-text-muted)', backgroundColor: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>
                                                {evt.time}
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <FloodMarkingToolbar />
                
                {/* Reposition Chaos button */}
                <div style={{ position: 'absolute', top: '16px', left: '16px', zIndex: 10 }}>
                   <ChaosTestButton />
                </div>
            </div>
        </div>
    );
}
