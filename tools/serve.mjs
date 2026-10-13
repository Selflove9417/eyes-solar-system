import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';

// resolve() so a relative root like "." works, not just an absolute one.
const root = resolve(process.argv[2] || process.cwd());
const port = Number(process.argv[3] || 8899);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };

createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://localhost');
    let p = decodeURIComponent(u.pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = resolve(join(root, p));
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403).end('forbidden'); return;
    }
    const buf = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
  }
}).listen(port, '127.0.0.1', () => console.log('serving ' + root + ' on http://127.0.0.1:' + port));
