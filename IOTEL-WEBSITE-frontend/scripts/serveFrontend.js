// Serve public website assets only; source/configuration files stay private.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff' };
function createServer() {
 return http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (!['GET', 'HEAD'].includes(req.method)) return res.writeHead(405, { Allow: 'GET, HEAD' }).end();
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { return res.writeHead(400).end('Malformed URL'); }
  if (/[\\\x00-\x1f]/.test(pathname)) return res.writeHead(400).end('Invalid path');
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
  const parts = relative.split('/');
  const extension = path.extname(relative).toLowerCase();
  const publicPath = parts.length === 1 ? ['.html', '.ico', '.png'].includes(extension) : ['static', 'public', 'admin', 'staff'].includes(parts[0]);
  if (!publicPath || !types[extension] || parts.some(part => part.startsWith('.') || part.includes(':'))) return res.writeHead(403).end('Forbidden');
  try {
   const filename = await fs.realpath(path.join(root, relative));
   if (!filename.startsWith(root + path.sep)) return res.writeHead(403).end('Forbidden');
   const stat = await fs.stat(filename);
   if (!stat.isFile()) return res.writeHead(404).end('Not found');
   const content = req.method === 'HEAD' ? null : await fs.readFile(filename);
   res.writeHead(200, { 'Content-Type': types[extension], 'Content-Length': stat.size });
   res.end(content);
  } catch (error) { res.writeHead(['ENOENT', 'ENOTDIR'].includes(error.code) ? 404 : 500).end('File unavailable'); }
 });
}
if (require.main === module) {
 const port = Number(process.env.PORT || 9010);
 createServer().listen(port, process.env.HOST || '127.0.0.1', () => console.log(`IOTEL frontend running at http://localhost:${port}`));
}
module.exports = { createServer };
