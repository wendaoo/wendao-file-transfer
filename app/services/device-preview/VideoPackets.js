/* eslint no-bitwise: off */
// scrcpy 3.3.4: dummy byte followed by 12-byte headers and encoded packets.
export default class VideoPackets {
  constructor(onPacket) {
    this.buffer = Buffer.alloc(0);
    this.onPacket = onPacket;
  }

  push(data) {
    this.buffer = Buffer.concat([this.buffer, data]);
    while (this.buffer.length >= 12) {
      const size = this.buffer.readUInt32BE(8);

      if (size > 4 * 1024 * 1024) {
        throw new Error('投屏数据异常，请重新连接');
      }

      if (this.buffer.length < 12 + size) return;
      const high = this.buffer.readUInt32BE(0);
      const packet = {
        config: Boolean(high & 0x80000000),
        key: Boolean(high & 0x40000000),
        timestamp:
          (high & 0x3fffffff) * 4294967296 + this.buffer.readUInt32BE(4),
        data: this.buffer.subarray(12, 12 + size),
      };

      this.buffer = this.buffer.subarray(12 + size);
      this.onPacket(packet);
    }
  }
}
