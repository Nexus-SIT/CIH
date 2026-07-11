import express from 'express';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import http from 'http';
import config from './config.js';

import { loadGraph, findNearestNode } from './engine/graph.js';
import routeRoutes from './routes/route.js';
import floodRoutes from './routes/flood.js';
import safezoneRoutes from './routes/safezones.js';
import responderRoutes from './routes/responder.js';
import helpRoutes from './routes/help.js';
import predictRoutes from './routes/predict.js';
import smsRoutes from './sms/route.js';
import volunteerRoutes from './routes/volunteer.js';

const app = express();
const server = http.createServer(app);

// Initialize WebSocket server
const wss = new WebSocketServer({ server, path: '/ws' });

// Make the WebSocket server accessible to routes
app.set('wss', wss);

app.use(cors());
app.use(express.json());

// Mount routes
app.use('/api/route', routeRoutes);
app.use('/api/flood', floodRoutes);
app.use('/api/safezones', safezoneRoutes);
app.use('/api/responder', responderRoutes);
app.use('/api/help', helpRoutes);
app.use('/api/predict-flood', predictRoutes);
app.use('/api/sms', smsRoutes);
app.use('/api/volunteer', volunteerRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Flood Routing API is running' });
});

const sessionId = Date.now().toString();

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('Client connected to WebSocket');
  
  // We can send a welcome message or initial state if needed
  ws.send(JSON.stringify({ 
    type: 'connected', 
    sessionId, 
    message: 'Connected to Flood Routing Realtime System' 
  }));

  ws.on('message', (message) => {
    console.log('Received message:', message.toString());
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

async function startServer() {
  try {
    console.log(`Loading graph data from ${config.dataFilePath}...`);
    await loadGraph(config.dataFilePath);
    console.log('Graph loaded successfully.');

    server.listen(config.port, () => {
      console.log(`HTTP Server running on port ${config.port}`);
      console.log(`WebSocket server running on ws://localhost:${config.port}/ws`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
