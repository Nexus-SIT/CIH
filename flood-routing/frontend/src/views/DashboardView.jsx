import React, { useState } from 'react';
import Map2D5 from '../components/Map/Map2D5';
import FloodMarkingToolbar from '../components/UI/FloodMarkingToolbar';
import ChaosTestButton from '../components/UI/ChaosTestButton';
import { useMapStore } from '../store/useMapStore';
import '../styles/design-system.css';

export default function DashboardView() {
    const { floodZones, activeRoute } = useMapStore();
    const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'responders'

    return (
        <div style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden' }}>
            {/* The 2.5D OSM Map Background */}
            <Map2D5 />
            
            {/* Top Bar: Command Center Header */}
            <div className="glass-panel" style={{ position: 'absolute', top: '16px', left: '24px', right: '24px', zIndex: 10, padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <h1 className="text-lg font-semibold m-0" style={{ letterSpacing: '0.5px' }}>Command Center</h1>
                    <span className="text-xs text-secondary uppercase">Kasargod District Sector</span>
                </div>

                <div style={{ display: 'flex', gap: '32px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <span className="text-xs text-secondary font-semibold uppercase">Active Zones</span>
                        <span className="text-sm font-semibold text-danger">
                            {floodZones.length} Critical
                        </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <span className="text-xs text-secondary font-semibold uppercase">Engine Status</span>
                        <span className="text-sm font-semibold text-success">
                            Routing Online
                        </span>
                    </div>
                </div>
            </div>

            {/* Left Panel: Analytics & Controls */}
            <div className="glass-panel flex-col p-4" style={{ position: 'absolute', top: '96px', left: '24px', width: '320px', zIndex: 10, display: 'flex', gap: '16px' }}>
                
                {/* Custom Tabs */}
                <div style={{ display: 'flex', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius-md)', padding: '4px' }}>
                    <button 
                        className={`apple-btn ${activeTab === 'overview' ? 'primary' : ''}`}
                        style={{ flex: 1, justifyContent: 'center', backgroundColor: activeTab === 'overview' ? 'var(--panel-border)' : 'transparent', border: 'none', color: activeTab === 'overview' ? 'white' : 'var(--text-secondary)' }}
                        onClick={() => setActiveTab('overview')}
                    >
                        Overview
                    </button>
                    <button 
                        className={`apple-btn ${activeTab === 'responders' ? 'primary' : ''}`}
                        style={{ flex: 1, justifyContent: 'center', backgroundColor: activeTab === 'responders' ? 'var(--panel-border)' : 'transparent', border: 'none', color: activeTab === 'responders' ? 'white' : 'var(--text-secondary)' }}
                        onClick={() => setActiveTab('responders')}
                    >
                        Responders
                    </button>
                </div>

                {activeTab === 'overview' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--panel-border)' }}>
                            <span className="text-sm text-secondary">Reported Floods</span>
                            <span className="text-sm font-semibold">{floodZones.length}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--panel-border)' }}>
                            <span className="text-sm text-secondary">Active Reroutes</span>
                            <span className="text-sm font-semibold">{activeRoute ? '1' : '0'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--panel-border)' }}>
                            <span className="text-sm text-secondary">SMS Triggers Sent</span>
                            <span className="text-sm font-semibold">14</span>
                        </div>

                        <div style={{ marginTop: '8px', backgroundColor: 'rgba(50, 215, 75, 0.1)', border: '1px solid rgba(50, 215, 75, 0.2)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
                            <h4 className="text-xs font-semibold text-success uppercase m-0 mb-1">System Healthy</h4>
                            <p className="text-sm m-0 text-secondary">All endpoints responding normally.</p>
                        </div>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {/* Mock Responder List */}
                        <div style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                <span className="text-sm font-semibold">Ambulance Alpha</span>
                                <span className="text-xs text-success uppercase tracking-wide">En Route</span>
                            </div>
                            <span className="text-xs text-secondary">Route ID: r_8f2a • Latency: 312ms</span>
                        </div>

                        <div style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                <span className="text-sm font-semibold">Rescue Boat 1</span>
                                <span className="text-xs text-secondary uppercase tracking-wide">Idle</span>
                            </div>
                            <span className="text-xs text-secondary">Awaiting dispatch instructions.</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Toolbars */}
            <FloodMarkingToolbar />
            <ChaosTestButton />
        </div>
    );
}
