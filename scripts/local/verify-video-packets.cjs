require('@babel/register');
const assert = require('assert');
const VideoPackets = require('../../app/services/device-preview/VideoPackets').default;
const packet = (high, low, data) => {
  const header = Buffer.alloc(12);
  header.writeUInt32BE(high, 0);
  header.writeUInt32BE(low, 4);
  header.writeUInt32BE(data.length, 8);
  return Buffer.concat([header, data]);
};
const received = [];
const parser = new VideoPackets(p => received.push(p));
const bytes = Buffer.concat([
  packet(0x80000000, 0, Buffer.from([1, 2])),
  packet(0x40000001, 23, Buffer.from([3, 4, 5])),
  packet(1, 24, Buffer.from([6])),
]);
for (const byte of bytes) parser.push(Buffer.from([byte]));
assert.equal(received.length, 3);
assert.equal(received[0].config, true);
assert.equal(received[1].key, true);
assert.equal(received[1].timestamp, 4294967319);
assert.deepEqual(received[1].data, Buffer.from([3, 4, 5]));
assert.equal(received[2].key, false);
const combined = [];
new VideoPackets(p => combined.push(p)).push(bytes);
assert.deepEqual(combined, received);
const oversized = Buffer.alloc(12);
oversized.writeUInt32BE(5 * 1024 * 1024, 8);
assert.throws(() => parser.push(oversized), /投屏数据异常/);
console.info('Video packet fragmentation, flags, timestamps and bounds: passed.');
