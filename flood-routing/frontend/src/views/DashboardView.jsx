import React, { useState } from 'react';
import Map2D5 from '../components/Map/Map2D5';
import FloodMarkingToolbar from '../components/UI/FloodMarkingToolbar';
import ChaosTestButton from '../components/UI/ChaosTestButton';
import { useMapStore } from '../store/useMapStore';
import '../styles/design-system.css';
import { 
    SquaresFour, MapTrifold, UsersThree, ChartLineUp, 
    Broadcast, Question, HouseLine, TrafficSignal, CloudRain, CaretRight, Stack, CaretDown, CaretUp
} from '@phosphor-icons/react';

export default function DashboardView() {
    const { floodZones, activeRoute, responders, rerouteEvents, isRouting, recalcLatency } = useMapStore();
    const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'responders' | 'metrics'
    const [isEventLogOpen, setIsEventLogOpen] = useState(true);

    return (
        <div style={{ display: 'flex', width: '100%', height: '100%', backgroundColor: 'var(--dash-bg)', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            {/* Left Sidebar */}
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', width: '320px', minWidth: '320px', flexShrink: 0, backgroundColor: 'var(--dash-sidebar)', borderRight: '1px solid var(--dash-border)' }}>
                
                {/* Command Center Header */}
                <div style={{ padding: '24px', display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', width: '48px', height: '48px', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid var(--dash-border)' }}>
                        <SquaresFour size={24} color="var(--text-primary)" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '4px 0 0 0', color: 'var(--dash-blue)' }}>Command Center</h2>
                        <span style={{ fontSize: '12px', color: 'var(--dash-text-muted)' }}>Active Sector 7</span>
                    </div>
                </div>

                {/* Navigation Menu */}
                <div style={{ display: 'flex', flexDirection: 'column', padding: '0 16px', gap: '4px', marginBottom: '32px' }}>
                    <button 
                        onClick={() => setActiveTab('overview')}
                        style={{ 
                            display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s', border: 'none',
                            backgroundColor: activeTab === 'overview' ? 'rgba(255,255,255,0.05)' : 'transparent',
                            borderLeft: activeTab === 'overview' ? '3px solid var(--dash-blue)' : '3px solid transparent',
                            color: activeTab === 'overview' ? 'var(--text-primary)' : 'var(--dash-text-muted)'
                        }}
                    >
                        <MapTrifold size={20} weight={activeTab === 'overview' ? 'fill' : 'regular'} />
                        <span style={{ fontWeight: 500, fontSize: '14px' }}>Overview</span>
                    </button>
                    <button 
                        onClick={() => setActiveTab('responders')}
                        style={{ 
                            display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s', border: 'none',
                            backgroundColor: activeTab === 'responders' ? 'rgba(255,255,255,0.05)' : 'transparent',
                            borderLeft: activeTab === 'responders' ? '3px solid var(--dash-blue)' : '3px solid transparent',
                            color: activeTab === 'responders' ? 'var(--text-primary)' : 'var(--dash-text-muted)'
                        }}
                    >
                        <UsersThree size={20} weight={activeTab === 'responders' ? 'fill' : 'regular'} />
                        <span style={{ fontWeight: 500, fontSize: '14px' }}>Responders</span>
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
                        </>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
