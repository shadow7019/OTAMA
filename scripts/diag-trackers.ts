/**
 * Test which announce trackers respond from this sandbox + whether DHT
 * bootstrap nodes answer, and whether .torrent files can be fetched for
 * instant-metadata playback.
 */
import dgram from "node:dgram";

const UDP_TRACKERS: [string, number][] = [
  ["tracker.opentrackr.org", 1337],
  ["open.stealth.si", 80],
  ["tracker.torrent.eu.org", 451],
  ["open.demonii.com", 1337],
  ["open.tracker.cl", 1337],
  ["exodus.desync.com", 6969],
  ["tracker.skynetcloud.site", 6969],
  ["tracker.qu.ax", 6969],
  ["tracker.ducks.party", 1984],
  ["explodie.org", 6969],
  ["tracker.nyaa.vc", 6969],
  ["tracker.gmi.gd", 6969],
  ["tracker-udp.gbitt.info", 80],
  ["tracker.corpscorp.online", 80],
  ["tracker.peerfect.org", 6969],
];

const DHT_ROUTERS: [string, number][] = [
  ["router.bittorrent.com", 6881],
  ["router.utorrent.com", 6881],
  ["router.transmissionbt.com", 6881],
  ["dht.transmissionbt.com", 6881],
  ["router.bitcomet.com", 6881],
  ["dht.libtorrent.org", 25401],
];

function udpPing(host: string, port: number, magic: bigint | null): Promise<string> {
  return new Promise((resolve) => {
    const sock = dgram.createSocket("udp4");
    const done = (m: string) => { try { sock.close(); } catch {} resolve(m); };
    const timer = setTimeout(() => done("TIMEOUT"), 3500);
    sock.on("message", (m) => { clearTimeout(timer); done(`OK ${m.length}B`); });
    sock.on("error", (e) => { clearTimeout(timer); done(`ERR ${e.message}`); });
    let buf: Buffer;
    if (magic !== null) {
      buf = Buffer.alloc(16);
      buf.writeUInt32BE(Number(magic >> 32n), 0);
      buf.writeUInt32BE(Number(magic & 0xffffffffn), 4);
      buf.writeUInt32BE(0, 8);
      buf.writeUInt32BE(Math.floor(Math.random() * 2 ** 31), 12);
    } else {
      buf = Buffer.from("d1:ad2:id20:012345678901234567891:q4:ping1:aa:1:t2:aa1:y1:qe");
    }
    sock.send(buf, port, host, (e) => { if (e) { clearTimeout(timer); done(`SEND-ERR`); } });
  });
}

const CONN = 0x41727101980n;
const jobs: Promise<string>[] = [];
for (const [h, p] of UDP_TRACKERS) jobs.push(udpPing(h, p, CONN).then((r) => `udp://${h}:${p} -> ${r}`));
for (const [h, p] of DHT_ROUTERS) jobs.push(udpPing(h, p, null).then((r) => `DHT ${h}:${p} -> ${r}`));
console.log((await Promise.all(jobs)).join("\n"));
process.exit(0);
