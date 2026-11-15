'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { createDatabase } = require('./src/db/database');
const { seedDatabaseIfNeeded } = require('./src/db/seed');
const { wafAndMl } = require('./src/security/wafAndMlEngine');
const { ApiRouter } = require('./src/routes/apiRouter');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

function createAppServer(customDb = null) {
  const db = customDb || createDatabase();
  seedDatabaseIfNeeded(db);
  const apiRouter = new ApiRouter(db);
  const publicDir = path.join(__dirname, 'public');

  const server = http.createServer((req, res) => {
    wafAndMl.applySecurityHeaders(res);

    const clientIp =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      '127.0.0.1';

    let parsedUrl;
    try {
      parsedUrl = new URL(req.url || '/', 'http://campeonei.com.br');
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'MALFORMED_URL' }));
      return;
    }

    // Coleta body para POST/PUT
    const chunks = [];
    let bodyBytes = 0;
    req.on('data', (chunk) => {
      bodyBytes += chunk.length;
      if (bodyBytes > 1024 * 1024) {
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', async () => {
      const bodyRaw = chunks.length > 0 ? Buffer.concat(chunks).toString('utf8') : '';

      // 1. Inspeção WAF / IDS / Rate Limit
      const wafResult = wafAndMl.inspectRequest({
        ip: clientIp,
        method: req.method,
        url: req.url || '/',
        bodyRaw,
        headers: req.headers
      });

      if (!wafResult.allowed) {
        res.writeHead(wafResult.statusCode || 403, {
          'Content-Type': 'application/json; charset=utf-8'
        });
        res.end(
          JSON.stringify({
            error: 'WAF_SECURITY_BLOCK',
            ruleId: wafResult.ruleId,
            category: wafResult.category,
            severity: wafResult.severity,
            message: wafResult.reason
          })
        );
        return;
      }

      // 2. Rotas de API
      if (parsedUrl.pathname.startsWith('/api/')) {
        let bodyData = {};
        if (bodyRaw) {
          try {
            bodyData = JSON.parse(bodyRaw);
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'INVALID_JSON_PAYLOAD' }));
            return;
          }
        }
        try {
          await apiRouter.handleRequest(req, res, parsedUrl, bodyData);
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(
            JSON.stringify({
              error: 'INTERNAL_SERVER_ERROR',
              message: err.message
            })
          );
        }
        return;
      }

      // 3. Suporte direto ao desafio SSL Let's Encrypt do aaPanel (/.well-known/acme-challenge/)
      if (parsedUrl.pathname.startsWith('/.well-known/')) {
        const safeWellKnown = path.normalize(parsedUrl.pathname).replace(/^(\.\.(\/|\\|$))+/, '');
        const candidatePaths = [
          path.join(__dirname, safeWellKnown),
          path.join(publicDir, safeWellKnown)
        ];
        for (const candidate of candidatePaths) {
          if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(fs.readFileSync(candidate));
            return;
          }
        }
      }

      // 4. Arquivos Estáticos da Aplicação Web (Material Design 3 SPA)
      let safeRelPath = parsedUrl.pathname === '/' ? '/index.html' : parsedUrl.pathname;
      safeRelPath = path.normalize(safeRelPath).replace(/^(\.\.(\/|\\|$))+/, '');
      let filePath = path.join(publicDir, safeRelPath);

      if (!filePath.startsWith(publicDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(publicDir, 'index.html');
      }

      try {
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        const rawBuf = fs.readFileSync(filePath);
        const acceptEncoding = req.headers['accept-encoding'] || '';

        if (acceptEncoding.includes('gzip') && rawBuf.length > 512) {
          const compressed = zlib.gzipSync(rawBuf);
          res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Encoding': 'gzip',
            'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
          });
          res.end(compressed);
        } else {
          res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
          });
          res.end(rawBuf);
        }
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Recurso não encontrado.');
      }
    });
  });

  return { server, db, apiRouter };
}

if (require.main === module) {
  const argPort = process.argv
    .find((a) => a.startsWith('--port='))
    ?.split('=')[1];
  const preferredPort = Number(argPort || process.env.PORT || 3000);
  const fallbackPort = 3080;
  const { server } = createAppServer();

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && preferredPort === 3000) {
      console.log(`[CAMPEONEI.COM.BR] Porta 3000 em uso por outro app; iniciando automaticamente na porta ${fallbackPort}...`);
      server.listen(fallbackPort, '0.0.0.0', () => {
        console.log(`[CAMPEONEI.COM.BR] Plataforma Web segura iniciada em http://localhost:${fallbackPort}`);
      });
    } else {
      console.error(err);
      process.exit(1);
    }
  });

  server.listen(preferredPort, '0.0.0.0', () => {
    console.log(`[CAMPEONEI.COM.BR] Plataforma Web segura iniciada em http://localhost:${preferredPort}`);
  });
}

module.exports = { createAppServer };
