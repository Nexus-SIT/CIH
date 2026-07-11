# API Contract - Flood Routing

API contract — lock this in hour 0-1, before anyone writes feature code. This is the shape of data moving between Karthik's engine, Manish's dashboard, Allen's responder app, and Chirag's SMS system. 

Karthik owns and exposes all of these endpoints. Everyone else consumes them.

## 1. Get initial route
REST — one-time fetch when a responder starts a journey
`POST /api/route`

**Request:**
```json
{
  "start": { "lat": 12.4996, "lng": 74.9869 },
  "end": { "lat": 12.5231, "lng": 74.9950 },
  "vehicle_type": "ambulance"
}
```
*`vehicle_type` is one of: `"ambulance"`, `"4x4"`, `"boat"`. This drives which flood-depth thresholds block the route.*

**Response:**
```json
{
  "route_id": "r_8f2a",
  "path": [
    { "lat": 12.4996, "lng": 74.9869 },
    { "lat": 12.5010, "lng": 74.9880 }
  ],
  "eta_seconds": 420,
  "compute_ms": 312
}
```
*`compute_ms` is the number Manish's latency counter displays — Karthik's engine must always return this, not something the frontend estimates.*

## 2. Mark a flood (admin/volunteer, connected)
`POST /api/flood`

**Request:**
```json
{
  "location": { "lat": 12.5010, "lng": 74.9880 },
  "reported_by": "admin",
  "depth_estimate_m": 0.6
}
```
*`reported_by` is one of: `"admin"`, `"volunteer"`, `"sms_report"`. This feeds the confidence-scoring logic.*

**Response:**
```json
{
  "flood_id": "f_1123",
  "confidence": "high",
  "affected_edges": ["e_204", "e_205"],
  "reroutes_triggered": ["r_8f2a"]
}
```
*`confidence` is one of: `"low"`, `"medium"`, `"high"`. Only "high" triggers an immediate reroute.*

## 3. Live route updates (WebSocket, not REST)
Reroutes need to reach the frontend instantly, so this is a push, not something the frontend polls for.

**Connect:** `wss://.../ws/route/{route_id}`

**Server pushes on any reroute:**
```json
{
  "event": "route_updated",
  "route_id": "r_8f2a",
  "path": [ { "lat": 12.4996, "lng": 74.9869 } ],
  "reason": "Avoided MG Road — 0.6m flood depth, reported 3 min ago",
  "compute_ms": 289
}
```
*`reason` is the exact string Manish's "why this route" panel displays — Karthik's engine generates this, not the frontend.*

## 4. Safe-zone shading data
`GET /api/safezones`

**Response:**
```json
{
  "zones": [
    { "edge_id": "e_204", "status": "red" },
    { "edge_id": "e_205", "status": "yellow" }
  ]
}
```
*`status` is one of: `"green"`, `"yellow"`, `"red"`. Poll this or subscribe via WebSocket (`event: "zones_updated"`).*

## 5. Responder registry (for SMS push targeting)
Chirag needs this to know who to text when a flood affects their route.

`POST /api/responder/register`
```json
{
  "phone": "+91XXXXXXXXXX",
  "route_id": "r_8f2a"
}
```
`POST /api/responder/checkin`
Call periodically while online. Minimal: phone, route_id, timestamp.

## 6. SMS trigger (internal, engine → SMS system)
Server-to-server.
```json
{
  "phone": "+91XXXXXXXXXX",
  "instruction": "Turn right at Kasargod Junction in 200m",
  "route_id": "r_8f2a"
}
```
*Chirag's system converts path/landmark data into SMS instructions.*

## 7. Inbound SMS flood report
Volunteer texts FLOOD LM12.
```json
{
  "location": { "lat": 12.5010, "lng": 74.9880 },
  "reported_by": "sms_report",
  "landmark_code": "LM12"
}
```
*Pre-register a small landmark code table (LM01–LM20 mapped to known Kasargod points).*
