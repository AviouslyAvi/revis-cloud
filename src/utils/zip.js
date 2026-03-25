// Minimal ZIP builder using raw buffers (no external deps)
// Extracted from the original Revis local server

const crc32Table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  crc32Table[i] = c;
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = crc32Table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Build a ZIP file from an array of { name: string, data: Buffer } entries
 * @returns {Buffer} The complete ZIP file
 */
function buildZip(files) {
  const path = require('path');
  const usedNames = new Set();

  function uniqueName(base) {
    let name = base;
    let i = 2;
    while (usedNames.has(name)) {
      const ext = path.extname(base);
      const stem = path.basename(base, ext);
      name = `${stem} (${i})${ext}`;
      i++;
    }
    usedNames.add(name);
    return name;
  }

  const zipParts = [];
  const centralDir = [];
  let offset = 0;

  for (const file of files) {
    const fileName = uniqueName(file.name);
    const nameBuffer = Buffer.from(fileName, 'utf8');

    // Local file header
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    const fileCrc = crc32(file.data);
    local.writeUInt32LE(fileCrc, 14);
    local.writeUInt32LE(file.data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);

    zipParts.push(local, nameBuffer, file.data);

    // Central directory entry
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(fileCrc, 16);
    central.writeUInt32LE(file.data.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralDir.push(central, nameBuffer);

    offset += 30 + nameBuffer.length + file.data.length;
  }

  const centralOffset = offset;
  let centralSize = 0;
  centralDir.forEach(b => centralSize += b.length);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...zipParts, ...centralDir, eocd]);
}

module.exports = { buildZip };
