/**
 * Diagnose torrent connectivity from this sandbox:
 * 1. DHT bootstrap (router.bittorrent.com:6881 UDP)
 * 2. UDP tracker announce (tracker.opentrackr.org:1337)
 * 3. wss tracker (tracker.openwebtorrent.com)
 * 4. Full webtorrent metadata fetch for a well-seeded swarm
 */
import dgram from "node:dgram";
import WebSocket from "ws";

function udpProbe(name: string, host: string, port: number) {
  return new Promise<string>((resolve) => {
    const sock = dgram.createSocket("udp4");
    const done = (msg: string) => { try { sock.close(); } catch {} resolve(`${name}: ${msg}`); };
    const timer = setTimeout(() => done("TIMEOUT (no UDP answer in 4s)"), 4000);
    // a connection request for opentrackr protocol: magic 0x41727101980, action 0
    const buf = Buffer.alloc(16);
    buf.writeUInt32BE(0x41727101980 / 2 ** 32, 0);
    buf.writeUInt32BE(0x41727101980 % 2 ** 32, 4);
    buf.writeUInt32BE(0, 8);
    buf.writeUInt32BE(Math.floor(Math.random() * 2 ** 31), 12);
    sock.on("message", (m) => {
      clearTimeout(timer);
      if (m.length >= 8) done(`OK (${m.length}B, action=${m.readUInt32BE(4) === 0 ? "connect-ack" : m.readUInt32BE(4)})`);
      else done(`weird reply ${m.length}B`);
    });
    sock.on("error", (e) => { clearTimeout(timer); done(`ERR ${e.message}`); });
    sock.send(buf, port, host, (e) => { if (e) { clearTimeout(timer); done(`SEND-ERR ${e.message}`); } });
  });
}

function dhtProbe() {
  return new Promise<string>((resolve) => {
    const sock = dgram.createSocket("udp4");
    const done = (msg: string) => { try { sock.close(); } catch {} resolve(`DHT router.bittorrent.com: ${msg}`); };
    const timer = setTimeout(() => done("TIMEOUT (no UDP answer in 4s)"), 4000);
    // bencoded ping: {"t":"aa","y":"q","q":"ping","a":{"id":"01234567890123456789"}}
    const ping = Buffer.from("d1:ad2:id20:012345678901234567891:q4:ping1:aa:1:t2:aa1:y1:qe");
    sock.on("message", (m) => { clearTimeout(timer); done(`OK (${m.length}B reply)`); });
    sock.on("error", (e) => { clearTimeout(timer); done(`ERR ${e.message}`); });
    sock.send(ping, 6881, "router.bittorrent.com", (e) => { if (e) { clearTimeout(timer); done(`SEND-ERR ${e.message}`); } });
  });
}

function wssProbe() {
  return new Promise<string>((resolve) => {
    const done = (msg: string) => resolve(`wss tracker.openwebtorrent.com: ${msg}`);
    const timer = setTimeout(() => done("TIMEOUT (no WS open in 5s)"), 5000);
    try {
      const ws = new WebSocket("wss://tracker.openwebtorrent.com");
      ws.on("open", () => { clearTimeout(timer); done("OK (websocket connected)"); ws.close(); });
      ws.on("error", (e: Error) => { clearTimeout(timer); done(`ERR ${e.message}`); });
    } catch (e) { clearTimeout(timer); done(`ERR ${(e as Error).message}`); }
  });
}

const results = await Promise.all([
  udpProbe("UDP opentrackr", "tracker.opentrackr.org", 1337),
  udpProbe("UDP open.stealth.si", "open.stealth.si", 80),
  udpProbe("UDP exodus.desync", "exodus.desync.com", 6969),
  dhtProbe(),
  wssProbe(),
]);
console.log(results.join("\n"));
process.exit(0);
