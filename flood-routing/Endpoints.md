# Flood Routing Backend API Endpoints

This document outlines all the REST endpoints and WebSocket events provided by the backend for the Flood-Aware Evacuation Routing System.

## 🌍 Base URLs
- **HTTP Base URL:** `http://localhost:3000`
- **WebSocket URL:** `ws://localhost:3000/ws`

---

## 🛣️ Route & Graph API (`/api/route`)

### 1. Get Entire Graph
Fetches the entire graph data for frontend map rendering.
- **Method:** `GET` 
- **Endpoint:** `/api/route/graph`
- **Response:** `{ "nodes": [...], "edges": [...] }`

### 2. Calculate A* Route (With Vehicle Rules)
Calculates the fastest path avoiding flooded zones (unless the vehicle type allows it).
- **Method:** `POST`
- **Endpoint:** `/api/route`
- **Body:** 
  ```json
  {
    "startLat": 12.5,
    "startLng": 75.0,
    "endLat": 12.51,
    "endLng": 75.01,
    "vehicleType": "ambulance" // Options: "ambulance", "standard", etc.
  }
  ```
- **Response:** `{ "path": [...nodes], "explored": [], "distance": 1400.5 }`
- **Side Effect:** Broadcasts a `route_update` WebSocket event.

---

## 🌊 Flood Control API (`/api/flood`)

### 3. Mark a Zone as Flooded (or Clear)
Marks a geographic area as flooded and dynamically re-weights the graph.
- **Method:** `POST`
- **Endpoint:** `/api/flood/flood-mark`
- **Body:**
  ```json
  {
    "lat": 12.505,
    "lng": 75.005,
    "radiusMeters": 500,
    "status": "flooded" // Options: "flooded", "clear"
  }
  ```
- **Response:** `{ "success": true, "affectedEdgesCount": 45 }`
- **Side Effect:** Broadcasts a `flood_update` WebSocket event.

---

## 🏥 Safe Zones API (`/api/safezones`)

### 4. Get All Reachable Nodes (Flood-fill Algorithm)
Returns all nodes that are physically reachable and not cut off by flooded roads.
- **Method:** `GET`
- **Endpoint:** `/api/safezones`
- **Response:** `{ "reachableNodes": [...nodes], "count": 5020 }`

---

## 🚑 Responder Registry API (`/api/responder`)

### 5. Register a New Responder / Vehicle
- **Method:** `POST`
- **Endpoint:** `/api/responder/register`
- **Body:**
  ```json
  {
    "responderId": "amb-101",
    "vehicleType": "ambulance",
    "initialLat": 12.5,
    "initialLng": 75.0
  }
  ```
- **Response:** Session object containing `{ "responderId": "amb-101", "currentLat": 12.5, ... }`

### 6. Update Responder GPS Location
- **Method:** `POST`
- **Endpoint:** `/api/responder/location`
- **Body:**
  ```json
  {
    "responderId": "amb-101",
    "lat": 12.502,
    "lng": 75.003
  }
  ```
- **Response:** Updated session object.
- **Side Effect:** Broadcasts a `responder_update` WebSocket event.

### 7. Get All Active Responders
- **Method:** `GET`
- **Endpoint:** `/api/responder/all`
- **Response:** `[ { "responderId": "amb-101", ... } ]`

---

## 📡 WebSocket Broadcasts (`/ws`)

Connect to `ws://localhost:3000/ws` to listen for the following real-time events. Data is received as JSON strings.

### Flood Marked Event
```json
{
  "type": "flood_update",
  "affectedEdges": [
    { "fromId": "123", "toId": "456", "status": "flooded" }
  ],
  "status": "flooded"
}
```

### Route Generated Event
```json
{
  "type": "route_update",
  "path": [...],
  "distance": 1400.5
}
```

### Responder Location Moved Event
```json
{
  "type": "responder_update",
  "responderId": "amb-101",
  "currentLat": 12.502,
  "currentLng": 75.003
}
```

---
*Note: A generic `/health` check GET endpoint is also available at the root URL.*
