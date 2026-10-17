'use strict';
// Realtime layer (FR-1.3): WebSocket at /api/v1/ws?token=<jwt>. Messages are triggers, not data;
// clients refetch the score, which is always rebuilt from the event log.
//   client -> server: {"action":"subscribe"|"unsubscribe","match_id":"m1"}
//   server -> client: {"type":"match.score_updated"|"match.status_changed"|"match.product_pinned", ...}
const { EventEmitter } = require('node:events');
const { WebSocketServer } = require('ws');
const { verifyJwt } = require('../domain/rbac/jwt');

const bus = new EventEmitter();
bus.setMaxListeners(0);

function attach(server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/api/v1/ws') { socket.destroy(); return; }
    try { verifyJwt(url.searchParams.get('token')); } catch { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const subs = new Set();
      const onEvent = (msg) => { if (subs.has(msg.match_id) && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)); };
      bus.on('match', onEvent);
      ws.on('message', (data) => {
        try {
          const m = JSON.parse(data.toString());
          if (typeof m.match_id !== 'string') return;
          if (m.action === 'subscribe') subs.add(m.match_id);
          else if (m.action === 'unsubscribe') subs.delete(m.match_id);
        } catch { /* ignore malformed client messages */ }
      });
      ws.on('close', () => bus.off('match', onEvent));
    });
  });
}

// Called after every appended event.
function matchEvent(matchId, type, version) {
  bus.emit('match', { type: 'match.score_updated', match_id: matchId, version });
  if (type === 'match_start') bus.emit('match', { type: 'match.status_changed', match_id: matchId, status: 'in_progress' });
  if (type === 'match_end') bus.emit('match', { type: 'match.status_changed', match_id: matchId, status: 'completed' });
}

module.exports = { attach, matchEvent };
