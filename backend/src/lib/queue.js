'use strict';
// Best-effort publisher of domain events to RabbitMQ (FR-2.3). Never blocks or fails a request.
const EXCHANGE = 'domain.events';
let channel = null;

async function connect() {
  const url = process.env.QUEUE_URL;
  if (!url) return;
  try {
    const amqp = require('amqplib');
    const conn = await amqp.connect(url);
    conn.on('error', () => { channel = null; });
    conn.on('close', () => { channel = null; setTimeout(connect, 5000); });
    channel = await conn.createChannel();
    await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
  } catch {
    channel = null;
    setTimeout(connect, 5000);
  }
}

function publish(routingKey, event) {
  if (!channel) return false;
  try {
    return channel.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(event)), { contentType: 'application/json' });
  } catch { return false; }
}

module.exports = { connect, publish, EXCHANGE };
