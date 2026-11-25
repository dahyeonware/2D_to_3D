// SSE 이벤트 버스: status-changed, issue-changed, maintenance-added (P1-8)
export function createEventBus() {
  const clients = new Set();
  let seq = 0;
  return {
    subscribe(req, res) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write(`retry: 3000\n: connected\n\n`);
      clients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 25000);
      req.on('close', () => {
        clearInterval(ping);
        clients.delete(res);
      });
    },
    publish(type, data) {
      const msg = `id: ${++seq}\nevent: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
      for (const res of clients) res.write(msg);
    },
    get size() {
      return clients.size;
    },
  };
}
