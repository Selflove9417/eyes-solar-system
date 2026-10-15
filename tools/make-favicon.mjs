import fs from 'node:fs';

// 1x1 transparent PNG or 16x16 PNG
// A minimal 16x16 valid PNG buffer
const png16 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAZElEQVQ4T2NkoBAwUqifYdQAk2EQ' +
  '9v//fwbGD0wMRFmEZBhI+z8D44cvDIz/e/EaQpRh+PfvHwPDv78MTMhg4bMEYjEw//uH1/eUYgM+' +
  'Q/kZ3n+G8jP9+A7lZ/z5F9U0fJb8/08zDQAAbO81C9z+s6YAAAAASUVORK5CYII=',
  'base64'
);

// Build .ico format wrapping the PNG
const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0); // reserved
icoHeader.writeUInt16LE(1, 2); // icon type
icoHeader.writeUInt16LE(1, 4); // 1 image

const iconDirEntry = Buffer.alloc(16);
iconDirEntry.writeUInt8(16, 0); // width
iconDirEntry.writeUInt8(16, 1); // height
iconDirEntry.writeUInt8(0, 2);  // color count
iconDirEntry.writeUInt8(0, 3);  // reserved
iconDirEntry.writeUInt16LE(1, 4); // color planes
iconDirEntry.writeUInt16LE(32, 6); // bpp
iconDirEntry.writeUInt32LE(png16.length, 8); // size
iconDirEntry.writeUInt32LE(6 + 16, 12); // offset

const icoBuffer = Buffer.concat([icoHeader, iconDirEntry, png16]);
fs.writeFileSync('favicon.ico', icoBuffer);
fs.writeFileSync('assets/img/favicon.ico', icoBuffer);
console.log('favicon.ico generated successfully, size:', icoBuffer.length);
