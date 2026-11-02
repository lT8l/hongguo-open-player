const crypto = require('node:crypto');
function box(type, payload = Buffer.alloc(0)) {
  const out = Buffer.alloc(8 + payload.length);
  out.writeUInt32BE(out.length); out.write(type, 4); payload.copy(out, 8);
  return out;
}
function full(type, numbers) {
  const payload = Buffer.alloc(4 + numbers.length * 4);
  numbers.forEach((n, i) => payload.writeUInt32BE(n, 4 + 4 * i));
  return box(type, payload);
}
function encryptedMp4(plain, key, nonce, flags = 0, { metadataLast = false, largeOffsets = false } = {}) {
  const iv = Buffer.alloc(16); nonce.copy(iv);
  const cipher = crypto.createCipheriv('aes-128-ctr', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const senc = Buffer.alloc(8 + nonce.length);
  senc.writeUInt32BE(flags); senc.writeUInt32BE(1, 4); nonce.copy(senc, 8);
  const chunkBox = offset => {
    if (!largeOffsets) return full('stco', [1, offset]);
    const payload = Buffer.alloc(16); payload.writeUInt32BE(1, 4); payload.writeBigUInt64BE(BigInt(offset), 8);
    return box('co64', payload);
  };
  const makeMoov = offset => box('moov', box('trak', box('mdia', box('minf', box('stbl', Buffer.concat([
    full('stsz', [0, 1, plain.length]), chunkBox(offset), full('stsc', [1, 1, 1, 1]), box('senc', senc)
  ]))))));
  const ftyp = box('ftyp'); const moov = makeMoov(0);
  return metadataLast ? Buffer.concat([ftyp, box('mdat', encrypted), makeMoov(ftyp.length + 8)])
    : Buffer.concat([ftyp, makeMoov(ftyp.length + moov.length + 8), box('mdat', encrypted)]);
}
module.exports = { box, encryptedMp4 };
