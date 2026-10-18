// tools/zip-util.mjs
// Zero-dependency standard PKZip (APPNOTE.TXT) reader and writer for Node.js
// Works identically across Windows, Linux (Ubuntu), and macOS without depending on external binaries.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
  }
  table[i] = c >>> 0;
}

export function crc32(buf) {
  if (typeof zlib.crc32 === 'function') {
    return zlib.crc32(buf) >>> 0;
  }
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

/**
 * Creates a standard PKZip archive from a list of items.
 * @param {Array<{ path: string, data: Buffer, mtime?: Date }>} files
 * @param {string} outputPath
 */
export function createZip(files, outputPath) {
  const localHeaders = [];
  const centralDirectoryHeaders = [];
  let currentOffset = 0;

  // Use a fixed timestamp or file mtime for deterministic builds
  const defaultMtime = new Date('2026-10-18T12:00:00Z');

  for (const file of files) {
    const filenameBuf = Buffer.from(file.path.replace(/\\/g, '/'), 'utf8');
    const uncompressedData = file.data;
    const uncompressedSize = uncompressedData.length;
    const fileCrc = crc32(uncompressedData);
    const compressedData = zlib.deflateRawSync(uncompressedData, { level: 9 });
    const compressedSize = compressedData.length;

    const mtime = file.mtime || defaultMtime;
    const dosTime = ((mtime.getUTCHours() << 11) | (mtime.getUTCMinutes() << 5) | (mtime.getUTCSeconds() >> 1)) & 0xFFFF;
    const dosDate = (((mtime.getUTCFullYear() - 1980) << 9) | ((mtime.getUTCMonth() + 1) << 5) | mtime.getUTCDate()) & 0xFFFF;

    // 1. Local file header (30 bytes + filename + data)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // Signature PK\x03\x04
    localHeader.writeUInt16LE(20, 4);         // Version needed: 2.0
    localHeader.writeUInt16LE(0x0800, 6);     // Flags: UTF-8 filename (bit 11)
    localHeader.writeUInt16LE(8, 8);          // Compression: Deflate (8)
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(fileCrc, 14);
    localHeader.writeUInt32LE(compressedSize, 18);
    localHeader.writeUInt32LE(uncompressedSize, 22);
    localHeader.writeUInt16LE(filenameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);         // Extra field length

    localHeaders.push(localHeader, filenameBuf, compressedData);

    // 2. Central Directory file header (46 bytes + filename)
    const cdHeader = Buffer.alloc(46);
    cdHeader.writeUInt32LE(0x02014b50, 0); // Signature PK\x01\x02
    cdHeader.writeUInt16LE(20, 4);         // Version made by: 2.0
    cdHeader.writeUInt16LE(20, 6);         // Version needed: 2.0
    cdHeader.writeUInt16LE(0x0800, 8);     // Flags: UTF-8
    cdHeader.writeUInt16LE(8, 10);         // Compression: Deflate
    cdHeader.writeUInt16LE(dosTime, 12);
    cdHeader.writeUInt16LE(dosDate, 14);
    cdHeader.writeUInt32LE(fileCrc, 16);
    cdHeader.writeUInt32LE(compressedSize, 20);
    cdHeader.writeUInt32LE(uncompressedSize, 24);
    cdHeader.writeUInt16LE(filenameBuf.length, 28);
    cdHeader.writeUInt16LE(0, 30);         // Extra field length
    cdHeader.writeUInt16LE(0, 32);         // Comment length
    cdHeader.writeUInt16LE(0, 34);         // Disk start
    cdHeader.writeUInt16LE(0, 36);         // Internal attributes
    cdHeader.writeUInt32LE(0, 38);         // External attributes
    cdHeader.writeUInt32LE(currentOffset, 42); // Offset of local header

    centralDirectoryHeaders.push(cdHeader, filenameBuf);

    currentOffset += localHeader.length + filenameBuf.length + compressedData.length;
  }

  const centralDirectoryOffset = currentOffset;
  let centralDirectorySize = 0;
  for (const b of centralDirectoryHeaders) centralDirectorySize += b.length;

  // 3. End of Central Directory Record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);       // Signature PK\x05\x06
  eocd.writeUInt16LE(0, 4);                // Disk number
  eocd.writeUInt16LE(0, 6);                // Disk with CD
  eocd.writeUInt16LE(files.length, 8);     // CD entries on this disk
  eocd.writeUInt16LE(files.length, 10);    // Total CD entries
  eocd.writeUInt32LE(centralDirectorySize, 12);
  eocd.writeUInt32LE(centralDirectoryOffset, 16);
  eocd.writeUInt16LE(0, 20);               // Comment length

  const allBuffers = [...localHeaders, ...centralDirectoryHeaders, eocd];
  const finalZipBuffer = Buffer.concat(allBuffers);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, finalZipBuffer);
  return finalZipBuffer;
}

/**
 * Extracts and inspects a PKZip archive buffer.
 * Returns array of { path: string, data: Buffer, uncompressedSize: number, compressedSize: number, crc32: number, method: number }
 * @param {Buffer} buffer
 */
export function readZip(buffer) {
  if (buffer.length < 22) {
    throw new Error('Buffer too small to be a valid ZIP archive');
  }
  const magic = buffer.readUInt32LE(0);
  if (magic !== 0x04034b50) {
    throw new Error(`Invalid ZIP magic bytes: 0x${magic.toString(16)} (expected 0x04034b50 / PK\\x03\\x04)`);
  }

  const files = [];
  let offset = 0;

  while (offset + 30 <= buffer.length) {
    const sig = buffer.readUInt32LE(offset);
    if (sig === 0x02014b50 || sig === 0x06054b50) {
      // Reached Central Directory or EOCD
      break;
    }
    if (sig !== 0x04034b50) {
      throw new Error(`Corrupted ZIP at offset ${offset}: signature 0x${sig.toString(16)}`);
    }

    const versionNeeded = buffer.readUInt16LE(offset + 4);
    const flags = buffer.readUInt16LE(offset + 6);
    const method = buffer.readUInt16LE(offset + 8);
    const dosTime = buffer.readUInt16LE(offset + 10);
    const dosDate = buffer.readUInt16LE(offset + 12);
    const expectedCrc = buffer.readUInt32LE(offset + 14);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const filenameLen = buffer.readUInt16LE(offset + 26);
    const extraLen = buffer.readUInt16LE(offset + 28);

    const filename = buffer.toString('utf8', offset + 30, offset + 30 + filenameLen);
    const dataOffset = offset + 30 + filenameLen + extraLen;
    const compressedData = buffer.subarray(dataOffset, dataOffset + compressedSize);

    let uncompressedData;
    if (method === 0) {
      uncompressedData = compressedData;
    } else if (method === 8) {
      uncompressedData = zlib.inflateRawSync(compressedData);
    } else {
      throw new Error(`Unsupported compression method ${method} for ${filename}`);
    }

    if (uncompressedData.length !== uncompressedSize) {
      throw new Error(`Size mismatch for ${filename}: expected ${uncompressedSize}, got ${uncompressedData.length}`);
    }

    const actualCrc = crc32(uncompressedData);
    if (actualCrc !== expectedCrc) {
      throw new Error(`CRC-32 mismatch for ${filename}: expected 0x${expectedCrc.toString(16)}, got 0x${actualCrc.toString(16)}`);
    }

    files.push({
      path: filename,
      data: uncompressedData,
      compressedSize,
      uncompressedSize,
      crc32: expectedCrc,
      method
    });

    offset = dataOffset + compressedSize;
  }

  return files;
}

/**
 * Extracts a ZIP buffer into a target directory on disk.
 * @param {Buffer} zipBuffer
 * @param {string} targetDir
 */
export function extractZipToDir(zipBuffer, targetDir) {
  const entries = readZip(zipBuffer);
  for (const entry of entries) {
    const fullPath = path.join(targetDir, entry.path);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, entry.data);
  }
  return entries;
}
