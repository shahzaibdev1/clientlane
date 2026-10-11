import { createServer } from 'node:http';
import process from 'node:process';
import console from 'node:console';
import { createReadStream } from 'node:fs';
import { stat, realpath } from 'node:fs/promises';
import { dirname, resolve, relative, extname, isAbsolute } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const root = await realpath(
  resolve(dirname(fileURLToPath(import.meta.url)), '../docs/product-tour'),
);
const argument = process.argv.indexOf('--port');
const port = argument === -1 ? 3012 : Number(process.argv[argument + 1]);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('Use a port from 1024 to 65535.');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.webm': 'video/webm',
  '.vtt': 'text/vtt',
  '.png': 'image/png',
  '.md': 'text/plain; charset=utf-8',
};
const within = (path) => {
  const part = relative(root, path);
  return part !== '..' && !part.startsWith('..\\') && !part.startsWith('../') && !isAbsolute(part);
};
createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const candidate = resolve(root, `.${path === '/' ? '/index.html' : path}`);
    if (!within(candidate)) {
      response.writeHead(403).end();
      return;
    }
    const file = await realpath(candidate);
    if (!within(file)) {
      response.writeHead(403).end();
      return;
    }
    const info = await stat(file);
    if (!info.isFile()) {
      response.writeHead(404).end();
      return;
    }
    const headers = {
      'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'X-Content-Type-Options': 'nosniff',
    };
    let start = 0,
      end = info.size - 1,
      status = 200;
    if (request.headers.range) {
      const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
      if (!range || (!range[1] && !range[2])) {
        response.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end();
        return;
      }
      if (!range[1]) start = Math.max(0, info.size - Number(range[2]));
      else start = Number(range[1]);
      if (range[1] && range[2]) end = Math.min(end, Number(range[2]));
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start > end ||
        start >= info.size
      ) {
        response.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end();
        return;
      }
      status = 206;
      headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
    }
    headers['Content-Length'] = end - start + 1;
    response.writeHead(status, headers);
    if (request.method === 'HEAD') response.end();
    else
      createReadStream(file, { start, end })
        .on('error', () => response.destroy())
        .pipe(response);
  } catch (error) {
    response.writeHead(error instanceof URIError ? 400 : 404).end();
  }
}).listen(port, '127.0.0.1', () => console.log(`Product tour: http://127.0.0.1:${port}`));
