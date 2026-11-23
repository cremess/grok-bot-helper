const test = require('node:test');
const assert = require('node:assert/strict');
const { buildIco } = require('../scripts/ico');

test('builds ICO headers, dimensions, offsets and PNG images', () => {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const entries = [
    { size: 16, png: Buffer.concat([signature, Buffer.from([1, 2, 3])]) },
    { size: 256, png: Buffer.concat([signature, Buffer.from([4, 5, 6, 7, 8])]) },
  ];
  const ico = buildIco(entries);

  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 2);
  let expectedOffset = 6 + 16 * entries.length;
  entries.forEach(({ size, png }, index) => {
    const entryOffset = 6 + index * 16;
    assert.equal(ico.readUInt8(entryOffset), size === 256 ? 0 : size);
    assert.equal(ico.readUInt8(entryOffset + 1), size === 256 ? 0 : size);
    assert.equal(ico.readUInt8(entryOffset + 2), 0);
    assert.equal(ico.readUInt8(entryOffset + 3), 0);
    assert.equal(ico.readUInt16LE(entryOffset + 4), 1);
    assert.equal(ico.readUInt16LE(entryOffset + 6), 32);
    assert.equal(ico.readUInt32LE(entryOffset + 8), png.length);
    const offset = ico.readUInt32LE(entryOffset + 12);
    assert.equal(offset, expectedOffset);
    assert.deepEqual(ico.subarray(offset, offset + png.length), png);
    expectedOffset += png.length;
  });
  assert.equal(ico.length, expectedOffset);
});
