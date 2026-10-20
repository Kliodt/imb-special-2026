import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const port = Number(process.env.PORT || 4173);
const mime = { '.woff2':'font/woff2','.ttf':'font/ttf','.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.wav':'audio/wav','.m4a':'audio/mp4','.mp3':'audio/mpeg','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8' };
const server = http.createServer((req, res) => {
  if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405,{Allow:'GET, HEAD'}).end(); return; }
  let filename;
  try {
    const requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    filename = path.resolve(root, '.' + requested);
    if (requested.endsWith('/')) filename = path.join(filename, 'index.html');
    if (!filename.startsWith(root + path.sep)) throw new Error('Path');
  } catch { res.writeHead(400).end(); return; }
  fs.stat(filename, (error, stat) => {
    if (error || !stat.isFile()) { res.writeHead(404).end('Not found'); return; }
    const headers = {'Content-Type':mime[path.extname(filename)] || 'application/octet-stream','Accept-Ranges':'bytes','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Permissions-Policy':'camera=(self), microphone=()'};
    let start=0, end=stat.size-1, status=200;
    if (req.headers.range) {
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (!range || (!range[1] && !range[2])) { res.writeHead(416,{'Content-Range':`bytes */${stat.size}`}).end();return; }
      if (!range[1]) start=Math.max(0,stat.size-Number(range[2]));
      else { start=Number(range[1]); if(range[2])end=Math.min(end,Number(range[2])); }
      if (start>end || start>=stat.size) { res.writeHead(416,{'Content-Range':`bytes */${stat.size}`}).end();return; }
      status=206;headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;
    }
    headers['Content-Length']=String(Math.max(0,end-start+1));
    res.writeHead(status,headers);
    if(req.method==='HEAD' || !stat.size){res.end();return;}
    const source=fs.createReadStream(filename,{start,end});
    source.on('error',()=>res.destroy());res.on('close',()=>source.destroy());source.pipe(res);
  });
});
server.listen(port,'0.0.0.0',()=>console.log(`MEGA audio guide: http://localhost:${port}/?start=1`));
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
