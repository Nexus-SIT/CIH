# AI-Powered Flood Routing & Responder Dispatch System

## Overview
The **AI-Powered Flood Routing & Responder Dispatch System** is a real-time, highly dynamic GIS web application built to assist emergency responders and command centers during active flood crises. 

The system leverages live environmental data, crowd-sourced volunteer hazard reports, and an optimized A* pathfinding algorithm to calculate the safest and most efficient routes for various emergency vehicles. When flood zones are dynamically drawn or reported on the map, the backend graph structure updates instantly to prevent ground vehicles from navigating into hazardous waters, while dynamically routing watercraft (boats) directly through flooded pathways.

---

## Key Features

### 1. Dynamic Vehicle-Specific Pathfinding (A* Algorithm)
- The routing engine utilizes a custom implementation of `ngraph.path` to calculate routes across a vast OpenStreetMap (OSM) graph.
- **Ambulance & 4x4 (Core Explorer):** Standard and off-road emergency vehicles are strictly routed to avoid any flooded edges. If a route becomes flooded mid-journey, the system triggers a real-time reroute to find a safe detour.
- **Rescue Boats:** Watercraft have inverted routing rules—they are specifically authorized and required to traverse flooded pathways to reach stranded civilians, creating a highly realistic disaster response simulation.

### 2. High-Performance Redis Route Caching
- Complex graph calculations are cached in Redis. If a route between two nodes for a specific vehicle type has already been computed and the graph topology (flood state) hasn't changed, the system serves the cached route with near-zero latency. 
- When flood conditions change, the cache is intelligently invalidated by bumping the global graph version.

### 3. Real-Time Volunteer Hazard Reporting & Trust System
- Volunteers on the ground can report active flood zones.
- The system employs a Trust-Based Role System (`new_user`, `trusted_user`, `moderator`). Reports from trusted users and moderators are auto-approved and immediately impact the global routing graph.

### 4. Interactive Command Center Dashboard
- A premium, Apple-style glassmorphic UI built in React with MapLibre GL JS.
- Provides a comprehensive overview of active responders, help requests, and current flood hazards.
- **Slow-Mo A* Visualizer:** Operators can trigger a "Slow-Mo A*" visualization that animating the pathfinding node exploration in real-time, providing total explainability into why a specific route was chosen.

### 5. Mobile Responder View
- A responsive, mobile-first interface designed for first responders in the field.
- Features dynamic, smooth-collapsing navigation menus to maximize screen space for the map.
- Real-time turn-by-turn tracking, SMS fallback instructions for offline scenarios, and one-tap hazard reporting.

### 6. AI Flood Prediction & Heatmaps
- Integrates with the Open-Meteo API to fetch real-time and forecasted rainfall data.
- Generates intelligent flood risk heatmaps overlayed on the map to visualize predictive hazard zones based on rainfall intensity, elevation, and proximity to water bodies.

---

## Technology Stack

**Frontend:**
- **Framework:** React.js (Vite)
- **Mapping Engine:** MapLibre GL JS
- **State Management:** Zustand
- **Styling:** CSS (Vanilla) with Premium Glassmorphism & Apple-inspired aesthetics
- **Icons:** Phosphor Icons & Lucide React

**Backend:**
- **Runtime:** Node.js
- **Server:** Express.js
- **Graph & Routing Engine:** `ngraph.graph` & `ngraph.path`
- **Caching:** Redis (with `redis` npm package)
- **Real-Time Communcation:** WebSockets
- **Data Source:** OpenStreetMap (OSM)

---

## Project Structure

```
flood-routing/
├── backend/
│   ├── src/
│   │   ├── engine/          # A* Routing, Graph logic, Vehicle Rules, Redis Client
│   │   ├── routes/          # Express API endpoints (route, flood, help, etc.)
│   │   ├── data/            # OSM Graph processing scripts and raw map data
│   │   └── config.js        # Environment and API configurations
│   ├── package.json
│   └── index.js             # Main Express server entry point
├── frontend/
│   ├── src/
│   │   ├── components/      # React components (Map2D5, Sidebar, ExplainabilityPanel)
│   │   ├── views/           # Main application views (DashboardView, ResponderView)
│   │   ├── store/           # Zustand state management (useMapStore)
│   │   └── styles/          # Custom CSS and Design System variables
│   ├── package.json
│   └── vite.config.js
├── API_CONTRACT.md          # Documentation on frontend/backend data structures
├── Endpoints.md             # Documentation on available REST API routes
└── docker-compose.yml       # Docker configuration for Redis and other services
```

---

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- Redis Server (Running locally or via Docker)
- MapTiler API Key (for MapLibre base maps)

### Installation

1. **Start the Redis Server:**
   Ensure you have a Redis instance running locally on port `6379`. You can use Docker:
   ```bash
   docker run -p 6379:6379 -d redis
   ```

2. **Backend Setup:**
   ```bash
   cd backend
   npm install
   npm run dev
   ```
   The backend will start on `http://localhost:3000`.

3. **Frontend Setup:**
   ```bash
   cd frontend
   npm install
   # Set up your MapTiler Key in frontend/src/config.js or via environment variables
   npm run dev
   ```
   The frontend will start on `http://localhost:5173`.

---

## Usage Scenarios

- **Marking Floods:** In the Command Center, use the Lasso or Brush tools to draw a flood polygon. Watch as active routes instantly recalculate to avoid the new hazard.
- **Vehicle Switching:** Change a responder's vehicle to "Boat" and observe how the routing engine refuses to navigate standard dry roads, locking strictly onto flooded pathways.
- **Explainability:** Click the "Slow-Mo A*" button to watch the routing algorithm's search space expand, helping dispatchers understand exactly why a specific path was chosen.
