// ╔══════════════════════════════════════════════════════╗
// ║   PROXY SUREBET CO  — node proxy-surebet.js         ║
// ║   Sin dependencias npm · Local + Cloud ready        ║
// ╚══════════════════════════════════════════════════════╝
//
// LOCAL:   node proxy-surebet.js  → http://localhost:3001
// RAILWAY: conecta el repo y Railway usa PORT automáticamente
// RENDER:  Start Command: node proxy-surebet.js
// ─────────────────────────────────────────────────────

const http  = require('http');
const https = require('https');
const url   = require('url');
const fs    = require('fs');
const path  = require('path');

const HTML_FILE = path.join(__dirname, 'surebets-colombia.html');
const PORT = process.env.PORT || 3001;

// ── Health state ──────────────────────────────────────
const bkHealth = {
  betplay:{ok:null,last:0,ms:0}, rushbet:{ok:null,last:0,ms:0},
  codere:{ok:null,last:0,ms:0},  yajuego:{ok:null,last:0,ms:0},
  luckia:{ok:null,last:0,ms:0},  betsson:{ok:null,last:0,ms:0},
  stake:{ok:null,last:0,ms:0},   wplay:{ok:null,last:0,ms:0},
  betano:{ok:null,last:0,ms:0},  pinnacle:{ok:null,last:0,ms:0},
  '1win':{ok:null,last:0,ms:0},
};

const BK_PROBE = {
  betplay: 'https://eu.offering-api.kambicdn.com/offering/v2018/betplay/event/live/open.json?lang=es_CO&market=CO&useCombined=true&includeParticipants=false',
  rushbet: 'https://eu.offering-api.kambicdn.com/offering/v2018/rsico/event/live/open.json?lang=es_CO&market=CO&useCombined=true&includeParticipants=false',
  codere:  'https://m.codere.com.co/NavigationService/Home/GetHomeInfo?countHomeLiveEvents=0&sportHandle=soccer&countHighlightsEvents=5&gameTypesHighlightsEvents=1',
  yajuego: 'https://sports.yajuego.co/desktop/feapi/PalimpsestAjax/GetEventsInDailyBundleV3?DISP=10&DISPH=0&SPORTID=1&LIMIT=5',
  luckia:  'https://eu.offering-api.kambicdn.com/offering/v2018/luckia/event/live/open.json?lang=es_CO&market=CO&useCombined=true&includeParticipants=false',
  betsson: 'https://eu.offering-api.kambicdn.com/offering/v2018/betsson/event/live/open.json?lang=es_CO&market=CO&useCombined=true&includeParticipants=false',
  stake:   'https://stake.com/_api/graphql',
  wplay:   'https://apuestas.wplay.co/apuestas/api/sports',
  betano:  'https://co.betano.com/api/sports/',
  pinnacle:'https://guest.api.arcadia.pinnacle.com/0.1/sports',
  '1win':  'https://1win.xyz/api/sports/top-events?sport_id=1&count=5',
};

// ── Headers por dominio ───────────────────────────────
function getHeadersFor(targetUrl) {
  const base = {
    'Accept':'application/json, text/plain, */*',
    'Accept-Language':'es-CO,es;q=0.9,en;q=0.5',
    'Accept-Encoding':'gzip, deflate, br',
    'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Cache-Control':'no-cache',
  };
  if (targetUrl.includes('pinnacle.com') || targetUrl.includes('arcadia.pinnacle')) {
    Object.assign(base,{'X-Device-UUID':'cl-anonymous','Origin':'https://www.pinnacle.com','Referer':'https://www.pinnacle.com/'});
  } else if (targetUrl.includes('betano.com') || targetUrl.includes('co.betano.com')) {
    Object.assign(base,{'Origin':'https://co.betano.com','Referer':'https://co.betano.com/sport/futbol/','X-Requested-With':'XMLHttpRequest'});
  } else if (targetUrl.includes('wplay.co')) {
    Object.assign(base,{'Origin':'https://apuestas.wplay.co','Referer':'https://apuestas.wplay.co/es','X-Requested-With':'XMLHttpRequest'});
  } else if (targetUrl.includes('yajuego.co') || targetUrl.includes('yajuego.com') || targetUrl.includes('altenar')) {
    Object.assign(base,{'Origin':'https://sports.yajuego.co','Referer':'https://sports.yajuego.co/'});
  } else if (targetUrl.includes('top-parser.com')) {
    Object.assign(base,{'Origin':'https://1win.com','Referer':'https://1win.com/'});
  } else if (targetUrl.includes('1win.')) {
    const domain = targetUrl.match(/https?:\/\/([^/]+)/)?.[1] || '1win.xyz';
    Object.assign(base,{'Origin':`https://${domain}`,'Referer':`https://${domain}/`});
  } else if (targetUrl.includes('stake.com')) {
    Object.assign(base,{'Origin':'https://stake.com','Referer':'https://stake.com/sports','x-language':'en','x-stake-country':'CO'});
  } else if (targetUrl.includes('luckia.co')) {
    Object.assign(base,{'Origin':'https://www.luckia.co','Referer':'https://www.luckia.co/'});
  } else if (targetUrl.includes('betsson.com.co')) {
    Object.assign(base,{'Origin':'https://www.betsson.com.co','Referer':'https://www.betsson.com.co/'});
  }
  return base;
}

// ── Descomprimir respuesta ────────────────────────────
function decompressResponse(res, callback) {
  const zlib = require('zlib');
  const enc = (res.headers['content-encoding'] || '').toLowerCase();
  let stream = res;
  if (enc === 'gzip')    stream = res.pipe(zlib.createGunzip());
  else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());
  else if (enc === 'br') stream = res.pipe(zlib.createBrotliDecompress());
  const chunks = [];
  stream.on('data', c => chunks.push(c));
  stream.on('end', () => callback(null, Buffer.concat(chunks)));
  stream.on('error', e => callback(e));
}

// ── Probe una casa ────────────────────────────────────
function probeBk(bkKey) {
  return new Promise(resolve => {
    const probeUrl = BK_PROBE[bkKey];
    if (!probeUrl) return resolve({ok:false,ms:0,reason:'no-probe'});
    const start = Date.now();
    let target;
    try { target = new URL(probeUrl); } catch { return resolve({ok:false,ms:0,reason:'bad-url'}); }
    const isHttps = target.protocol === 'https:';
    const headers = getHeadersFor(probeUrl);
    const isPost  = bkKey === 'stake';
    const postBody = isPost ? JSON.stringify({operationName:'HC',query:'query HC{__typename}',variables:{}}) : null;
    if (isPost) { headers['Content-Type']='application/json'; headers['Content-Length']=Buffer.byteLength(postBody); }
    const options = {
      hostname:target.hostname, port:target.port?parseInt(target.port):(isHttps?443:80),
      path:target.pathname+target.search, method:isPost?'POST':'GET',
      headers, timeout:8000, rejectUnauthorized:false,
    };
    const proto = isHttps ? https : http;
    const req = proto.request(options, res => {
      res.on('data',()=>{}); res.on('end',()=>{
        const ms=Date.now()-start, ok=res.statusCode<500&&res.statusCode!==429;
        Object.assign(bkHealth[bkKey],{ok,last:Date.now(),ms});
        resolve({ok,ms,status:res.statusCode});
      });
    });
    req.on('error',e=>{Object.assign(bkHealth[bkKey],{ok:false,last:Date.now(),ms:Date.now()-start}); resolve({ok:false,ms:Date.now()-start,reason:e.message});});
    req.on('timeout',()=>{req.destroy(); Object.assign(bkHealth[bkKey],{ok:false,last:Date.now(),ms:8000}); resolve({ok:false,ms:8000,reason'timeout'});});
    if (isPost && postBody) req.write(postBody);
    req.end();
  });
}

// ── Health check completo ───────────────────────────────
let lastFullCheck = 0;
async function runHealthCheck() {
  lastFullCheck = Date.now();
  const results = await Promise.all(Object.keys(BK_PROBE).map(k => probeBk(k).then(r=>[k,r])));
  return Object.fromEntries(results);
}

// Health check periódico cada 5 min
setInterval(()=>runHealthCheck().catch(()=>{}), 5*60*1000);
setTimeout(()=>runHealthCheck().catch(()=>{}), 3000);

// ── Servidor HTTP ───────────────────────────────────
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Accept, Authorization, x-language, x-stake-country');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // /ping
  if (pathname === '/ping') {
    res.writeHead(200,{'Content-Type':'text/plain'}); res.end('ok'); return;
  }

  // /health — JSON con estado de cada casa
  if (pathname === '/health') {
    if ((Date.now()-lastFullCheck) > 4*60*1000) { try{await runHealthCheck();}catch {} }
    const payload = {
      ts: new Date().toISOString(), proxy:'ok',
      bookmakers: Object.fromEntries(Object.keys(bkHealth).map(k=>{
        const h=bkHealth[k];
        return [k,{ok:h.ok, ms:h.ms, lastCheck:h.last?new Date(h.last).toISOString():null}];
      })),
    };
    res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
    res.end(JSON.stringify(payload,null,2)); return;
  }

  // /health/live — dashboard HTML
  if (pathname === '/health/live') {
    const rows = Object.entries(bkHealth).map(([k,v])=>{
      const dot=v.ok===null?'&#x23F3;':v.ok?'&#x1F7E2;':'&#x1F534;';
      const ms=v.ms?`${v.ms}ms`:'—';
      const status=v.ok===null?'pendiente':v.ok?'OK':'FALLO';
      return `<tr><td>${dot}</td><td><b>${k}</b></td><td>${ms}</td><td class="${v.ok?'ok':v.ok===null?'pend':'fail'}">${status}</td></tr>`;
    }).join('');
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
    res.end(`<!DOCTYPE html><html><head><title>SureBet Health</title>
<meta http-equiv="refresh" content="60">
<style>body{font-family:monospace;background:#0d1117;color:#e6edf3;padding:30px;max-width:520px;margin:0 auto}
h1{color:#00c896}small{color:#8b949e}table{width:100%;border-collapse:collapse;margin-top:18px}
td{padding:7px 10px;border-bottom:1px solid #21262d}td:first-child{width:28px;font-size:1.1rem}
.ok{color:#00c896}.fail{color:#f87171}.pend{color:#8b949e}a{color:#00c896}</style></head>
<body><h1>SureBet CO — Estado Casas</h1>
<small>Auto-refresh 60s · <a href="/">Ir a la app</a> · Last check: ${lastFullCheck?new Date(lastFullCheck).toLocaleTimeString('es-CO'):'pendiente'}</small>
<table>${rows}</table></body></html>`); return;
  }

  // /proxy?url={{...}}
  if (pathname === '/proxy') {
    const targetUrl = parsed.query.url;
    if (!targetUrl) { res.writeHead(400,{'_Content-Type':'text/plain'}); res.end('Missing ?url='); return; }
    let target;
    try { target = new URL(decodeURIComponent(targetUrl)); }
    catch(e) { res.writeHead(400,{'Content-Type':'text/plain'}); res.end('Invalid URL: '+e.message); return; }

    const isHttps = target.protocol === 'https:';
    const port    = target.port?parseInt(target.port):(isHttps?443:80);
    const headers = getHeadersFor(target.href);

    let bodyData = Buffer.alloc(0);
    req.on('data', chunk=>{bodyData=Buffer.concat([bodyData,chunk]);});
    req.on('end', ()=>{
      if (req.method==='POST' && bodyData.length>0) {
        headers['Content-Type']  = req.headers['content-type']||'application/json';
        headers['Content-Length']= bodyData.length;
      }
      const options = {
        hostname:target.hostname, port,
        path:target.pathname+target.search,
        method:req.method||'GET', headers,
        timeout:12000, rejectUnauthorized:false,
      };
      const proto = isHttps?https:http;
      const proxyReq = proto.request(options, proxyRes=>{
        decompressResponse(proxyRes,(err,body)=>{
          if(err){if(!res.headersSent){res.writeHead(502);res.end('Decompress error');}return;}
          const ct=proxyRes.headers['content-type']||'application/json';
          res.writeHead(proxyRes.statusCode,{'Content-Type':ct,'Access-Control-Allow-Origin':'*','X-Proxy-Status':proxyRes.statusCode});
          res.end(body);
          console.log(`[${new Date().toISOString().slice(11,19)}] ${req.method} ${target.hostname}${target.pathname} -> ${proxyRes.statusCode} (${body.length}b)`);
        });
      });
      proxyReq.on('error',e=>{
        console.error(`[ERR] ${target.href} -> ${e.message}`);
        if(!res.headersSent){res.writeHead(502,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify({error:e.message,url:target.href}));}
      });
      proxyReq.on('timeout',()=>{
        proxyReq.destroy();
        if(!res.headersSent){res.writeHead(504,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify({error:'timeout',url:target.href}));}
      });
      if(req.method==='POST'&&bodyData.length>0)proxyReq.write(bodyData);
      proxyReq.end();
    });
    return;
  }

  // / — sirve la app
  if (pathname==='/'||pathname==='/app') {
    fs.readFile(HTML_FILE,(err,data)=>{
      if(err){res.writeHead(404,{'Content-Type':'text/plain'});res.end('surebets-colombia.html not found');return;}
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});
      res.end(data);
    });
    return;
  }

  res.writeHead(404,{'Content-Type':'text/plain'}); res.end('Not found');
});

server.on('error',e=>{
  if(e.code==='EADDRINUSE')console.error(`\nERROR: Puerto ${PORT} ya está en uso.\n`);
  else console.error('\nERROR:',e.message);
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', ()=>{
  const cloud = !!process.env.PORT;
  console.log('\n+----------------------------------------------+');
  console.log('|  SureBet CO — Proxy + App                     |');
  console.log('+----------------------------------------------+');
  if(cloud){
    console.log('|  Modo CLOUD — espera URL de Railway/Render    |');
    console.log(`|  PORT: ${PORT}${' '.repeat(38-String(PORT).length)}|`);
  }else{
    console.log(`|  App:     http://localhost:${PORT}             |`);
    console.log(`|  Health:  http://localhost:${PORT}/health/live |`);
  }
  console.log('+----------------------------------------------+\n');
});
