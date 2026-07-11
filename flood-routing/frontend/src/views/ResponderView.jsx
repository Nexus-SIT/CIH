import React from 'react';
import Map2D5 from '../components/Map/Map2D5';
import FloodMarkingToolbar from '../components/UI/FloodMarkingToolbar';
import LatencyCounter from '../components/UI/LatencyCounter';
import ExplainabilityPanel from '../components/UI/ExplainabilityPanel';
import ChaosTestButton from '../components/UI/ChaosTestButton';
import '../styles/design-system.css';

export default function ResponderView() {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden' }}>
      <Map2D5 />
      
      {/* UI Overlays */}
      <LatencyCounter />
      <ExplainabilityPanel />
      <FloodMarkingToolbar />
      <ChaosTestButton />
    </div>
  );
}
