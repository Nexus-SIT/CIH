import express from 'express';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import http from 'http';
import config from './config.js';

// Placeholder imports for modules to be implemented
import { loadGraph, findNearestNode } from './engine/graph.js';
// import routeRoutes from './routes/route.js';
// import floodRoutes from './routes/flood.js';
// import safezoneRoutes from './routes/safezones.js';
// import responderRoutes from './routes/responder.js';

const app = express();
const server = http.createServer(app);

// Initialize WebSocket server
const wss = new WebSocketServer({ server, path: '/ws' });

app.use(cors());
app.use(express.json());

// Mount routes (commented out until implemented)
// app.use('/api/route', routeRoutes);
// app.use('/api/flood', floodRoutes);
// app.use('/api/safezones', safezoneRoutes);
// app.use('/api/responder', responderRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Flood Routing API is running' });
});

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('Client connected to WebSocket');
  
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

    // Test findNearestNode
    console.log('\n--- Testing findNearestNode ---');
    // Kasargod approximate coordinates: 12.50, 75.00
    const nearest = findNearestNode(12.5, 75.0);
    console.log('Nearest node to (12.5, 75.0):', nearest);
    console.log('-------------------------------\n');

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
