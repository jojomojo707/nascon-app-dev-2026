'use strict';
// Worker: consumes order/match domain events from RabbitMQ and logs them (internal job queue).
const amqp = require('amqplib');
const { EXCHANGE } = require('./lib/queue');

async function run() {
  const conn = await amqp.connect(process.env.QUEUE_URL);
  const ch = await conn.createChannel();
  await ch.assertExchange(EXCHANGE, 'topic', { durable: true });
  const q = await ch.assertQueue('domain-events-worker', { durable: true });
  await ch.bindQueue(q.queue, EXCHANGE, '#');
  console.log('Worker consuming domain events');
  ch.consume(q.queue, (msg) => {
    if (!msg) return;
    console.log(`[event] ${msg.fields.routingKey} ${msg.content.toString()}`);
    ch.ack(msg);
  });
  conn.on('close', () => process.exit(1));
}

function start() {
  run().catch((err) => {
    console.error('Worker waiting for queue:', err.message);
    setTimeout(start, 3000);
  });
}
start();
