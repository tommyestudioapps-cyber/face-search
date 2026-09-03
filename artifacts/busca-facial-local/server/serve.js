/**
 * Standalone production server for Expo static builds.
 *
 * Serves the output of build.js (static-build/) with two special routes:
 * - GET / or /manifest with expo-platform header → platform manifest JSON
 * - GET / without expo-platform → landing page HTML
 * Everything else falls through to static file serving from ./static-build/.
 *
 * Zero external dependencies — uses only Node.js built-ins (http, fs, path).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STATIC_ROOT = path.resolve(__dirname, '..', 'static-build');
const TEMPLATE_PATH = path.resolve(__dirname, 'templates', 'landing-page.html');
const basePath = (process.env.BASE_PATH || '/').replace(/\/+$/, '');
const SAFE_PATH_SEGMENT = /^[A-Za-z0-9._@+(),~=-]+$/;
const IOS_MANIFEST_PATH = path.join(STATIC_ROOT, 'ios', 'manifest.json');
const ANDROID_MANIFEST_PATH = path.join(
  STATIC_ROOT,
  'android',
  'manifest.json',
);
const SECURITY_HEADERS = {
  'content-security-policy':
    "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'; script-src 'self' https://unpkg.com; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'",
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.map': 'application/json',
};

function getAppName() {
  try {
    const appJsonPath = path.resolve(__dirname, '..', 'app.json');
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf-8'));
    return typeof appJson.expo?.name === 'string'
      ? appJson.expo.name
      : 'App Landing Page';
  } catch {
    return 'App Landing Page';
  }
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function toScriptString(value) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026');
}

function send(res, statusCode, headers, body) {
  res.writeHead(statusCode, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}

function getRequestOrigin(req) {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol =
    forwardedProto === 'http' || forwardedProto === 'https'
      ? forwardedProto
      : 'https';
  const forwardedHost = req.headers['x-forwarded-host'];
  const requestedHost = forwardedHost || req.headers.host;

  if (typeof requestedHost !== 'string' || requestedHost.length > 255) {
    return { protocol, host: 'localhost' };
  }

  try {
    const parsedHost = new URL(`https://${requestedHost}`);
    if (
      parsedHost.username ||
      parsedHost.password ||
      parsedHost.pathname !== '/' ||
      parsedHost.search ||
      parsedHost.hash
    ) {
      return { protocol, host: 'localhost' };
    }
    return { protocol, host: parsedHost.host };
  } catch {
    return { protocol, host: 'localhost' };
  }
}

function serveManifest(platform, res) {
  const manifestPath =
    platform === 'ios' ? IOS_MANIFEST_PATH : ANDROID_MANIFEST_PATH;

  if (!fs.existsSync(manifestPath)) {
    return send(
      res,
      404,
      { 'content-type': 'application/json' },
      JSON.stringify({ error: `Manifest not found for platform: ${platform}` }),
    );
  }

  const manifest = fs.readFileSync(manifestPath, 'utf-8');
  send(
    res,
    200,
    {
      'content-type': 'application/json',
      'expo-protocol-version': '1',
      'expo-sfv-version': '0',
    },
    manifest,
  );
}

function serveLandingPage(req, res, landingPageTemplate, appName) {
  const { protocol, host } = getRequestOrigin(req);
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `exps://${host}${basePath}`;
  const nonce = crypto.randomBytes(16).toString('base64');

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_ATTRIBUTE_PLACEHOLDER/g, escapeHtml(expsUrl))
    .replace(/EXPS_URL_JSON_PLACEHOLDER/g, toScriptString(expsUrl))
    .replace(/CSP_NONCE/g, escapeHtml(nonce))
    .replace(/APP_NAME_PLACEHOLDER/g, escapeHtml(appName));

  send(
    res,
    200,
    {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': SECURITY_HEADERS[
        'content-security-policy'
      ].replace(
        "script-src 'self' https://unpkg.com",
        `script-src 'self' https://unpkg.com 'nonce-${nonce}'`,
      ).replace("style-src 'self'", `style-src 'self' 'nonce-${nonce}'`),
    },
    html,
  );
}

function serveStaticFile(urlPath, res) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(urlPath);
  } catch {
    send(res, 400, {}, 'Bad Request');
    return;
  }

  if (
    !decodedPath.startsWith('/') ||
    decodedPath.includes('\0') ||
    decodedPath.includes('\\')
  ) {
    send(res, 403, {}, 'Forbidden');
    return;
  }

  const segments = decodedPath.split('/');
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        !SAFE_PATH_SEGMENT.test(segment),
    )
  ) {
    send(res, 403, {}, 'Forbidden');
    return;
  }

  const rootPath = fs.realpathSync(STATIC_ROOT);
  const filePath = path.join(rootPath, ...segments);
  const relativePath = path.relative(rootPath, filePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    send(res, 403, {}, 'Forbidden');
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    send(res, 404, {}, 'Not Found');
    return;
  }

  const realFilePath = fs.realpathSync(filePath);
  const realRelativePath = path.relative(rootPath, realFilePath);
  if (
    realRelativePath.startsWith('..') ||
    path.isAbsolute(realRelativePath)
  ) {
    send(res, 403, {}, 'Forbidden');
    return;
  }

  const ext = path.extname(realFilePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const content = fs.readFileSync(realFilePath);
  send(res, 200, { 'content-type': contentType }, content);
}

const landingPageTemplate = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
const appName = getAppName();

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, { allow: 'GET, HEAD' }, 'Method Not Allowed');
  }

  let url;
  try {
    url = new URL(req.url || '/', 'http://localhost');
  } catch {
    return send(res, 400, {}, 'Bad Request');
  }
  let pathname = url.pathname;

  if (basePath && pathname.startsWith(basePath)) {
    pathname = pathname.slice(basePath.length) || '/';
  }

  if (pathname === '/' || pathname === '/manifest') {
    const platform = req.headers['expo-platform'];
    if (platform === 'ios' || platform === 'android') {
      return serveManifest(platform, res);
    }

    if (pathname === '/') {
      return serveLandingPage(req, res, landingPageTemplate, appName);
    }
  }

  serveStaticFile(pathname, res);
});

const port = parseInt(process.env.PORT || '3000', 10);
server.listen(port, '0.0.0.0', () => {
  console.log(`Serving static Expo build on port ${port}`);
});
