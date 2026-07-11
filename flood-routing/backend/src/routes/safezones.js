import express from 'express';
import { getGraph } from '../engine/graph.js';

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const graph = getGraph();
    if (!graph) throw new Error('Graph is not loaded');

    // Find a reference safe point (a node that has at least one clear edge)
    let startNodeId = null;
    
    // Pick first node just as a reference
    graph.forEachNode(node => {
      if (!startNodeId) startNodeId = node.id;
    });

    if (!startNodeId) {
      return res.json({ reachableNodes: [] });
    }

    // Flood-fill (BFS) to find all reachable nodes from the reference point
    const reachableNodes = new Set();
    const queue = [startNodeId];
    reachableNodes.add(startNodeId);

    let idx = 0;
    while (idx < queue.length) {
      const currentId = queue[idx++];
      
      graph.forEachLinkedNode(currentId, (linkedNode, link) => {
        // Only traverse clear edges
        if (link.data && link.data.status !== 'flooded') {
          if (!reachableNodes.has(linkedNode.id)) {
            reachableNodes.add(linkedNode.id);
            queue.push(linkedNode.id);
          }
        }
      });
    }

    // Return the list of reachable node objects
    const result = [];
    reachableNodes.forEach(id => {
      const node = graph.getNode(id);
      if (node) result.push({ id, ...node.data });
    });

    res.json({ reachableNodes: result, count: result.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
