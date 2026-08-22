/**
 * Local mock OAuth2 provider for testing Google/GitHub/Microsoft sign-in
 * without registering a real app with any of them.
 *
 * Implements just enough of each provider's authorize/token/profile contract
 * to satisfy passport-google-oauth20, passport-github2, and passport-microsoft
 * (all three fetch a REST profile endpoint after the token exchange, in three
 * different vendor-specific shapes - this mirrors each one).
 *
 * Run with: npm run mock:oauth
 * Then set OAUTH_MOCK_BASE_URL=http://localhost:<port> in .env before starting the app.
 *
 * This is dev/test tooling only - never imported by application code.
 */
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { URL } from 'node:url';

const PORT = Number(process.env.MOCK_OAUTH_PORT ?? 4500);

interface IssuedCode {
  provider: string;
  email: string;
}

const codes = new Map<string, IssuedCode>();
const tokens = new Map<string, IssuedCode>();

function defaultEmailFor(provider: string): string {
  return `mock-${provider}-user@example.com`;
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function extractAccessToken(req: IncomingMessage, url: URL): string | null {
  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring('Bearer '.length);
  }
  return url.searchParams.get('access_token');
}

function handleAuthorize(url: URL, provider: string, res: ServerResponse) {
  const redirectUri = url.searchParams.get('redirect_uri');
  const state = url.searchParams.get('state') ?? '';
  const email = url.searchParams.get('email') ?? defaultEmailFor(provider);

  if (!redirectUri) {
    return sendJson(res, 400, { error: 'invalid_request', error_description: 'redirect_uri is required' });
  }

  const code = randomBytes(16).toString('hex');
  codes.set(code, { provider, email });

  const location = new URL(redirectUri);
  location.searchParams.set('code', code);
  location.searchParams.set('state', state);

  res.writeHead(302, { Location: location.toString() });
  res.end();
}

async function handleToken(req: IncomingMessage, provider: string, res: ServerResponse) {
  const contentType = req.headers['content-type'] ?? '';
  const rawBody = await readBody(req);
  const params = contentType.includes('application/json')
    ? JSON.parse(rawBody || '{}')
    : Object.fromEntries(new URLSearchParams(rawBody));

  const code = params.code as string | undefined;
  const issued = code ? codes.get(code) : undefined;

  if (!issued || issued.provider !== provider) {
    return sendJson(res, 400, { error: 'invalid_grant' });
  }
  codes.delete(code!); // authorization codes are single-use

  const accessToken = randomBytes(16).toString('hex');
  tokens.set(accessToken, issued);

  sendJson(res, 200, {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: 3600,
  });
}

function requireToken(
  req: IncomingMessage,
  url: URL,
  provider: string,
  res: ServerResponse,
): IssuedCode | null {
  const accessToken = extractAccessToken(req, url);
  const issued = accessToken ? tokens.get(accessToken) : undefined;

  if (!issued || issued.provider !== provider) {
    sendJson(res, 401, { error: 'invalid_token' });
    return null;
  }
  return issued;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const path = url.pathname;

  try {
    // Google
    if (path === '/google/authorize') return handleAuthorize(url, 'google', res);
    if (path === '/google/token' && req.method === 'POST') return await handleToken(req, 'google', res);
    if (path === '/google/userinfo') {
      const issued = requireToken(req, url, 'google', res);
      if (!issued) return;
      return sendJson(res, 200, {
        sub: `mock-google-${issued.email}`,
        name: 'Mock Google User',
        email: issued.email,
        email_verified: true,
      });
    }

    // GitHub
    if (path === '/github/authorize') return handleAuthorize(url, 'github', res);
    if (path === '/github/token' && req.method === 'POST') return await handleToken(req, 'github', res);
    if (path === '/github/user') {
      const issued = requireToken(req, url, 'github', res);
      if (!issued) return;
      return sendJson(res, 200, {
        id: 1001,
        login: 'mockgithubuser',
        name: 'Mock GitHub User',
        html_url: 'https://github.com/mockgithubuser',
        // deliberately no top-level `email` - real GitHub often omits it too,
        // forcing the strategy to hit /github/user/emails instead
      });
    }
    if (path === '/github/user/emails') {
      const issued = requireToken(req, url, 'github', res);
      if (!issued) return;
      return sendJson(res, 200, [{ email: issued.email, primary: true, verified: true }]);
    }

    // Microsoft
    if (path === '/microsoft/authorize') return handleAuthorize(url, 'microsoft', res);
    if (path === '/microsoft/token' && req.method === 'POST') return await handleToken(req, 'microsoft', res);
    if (path === '/v1.0/me' || path === '/v1.0/me/') {
      const issued = requireToken(req, url, 'microsoft', res);
      if (!issued) return;
      return sendJson(res, 200, {
        id: `mock-ms-${issued.email}`,
        displayName: 'Mock Microsoft User',
        mail: issued.email,
        userPrincipalName: issued.email,
      });
    }

    sendJson(res, 404, { error: 'not_found', path });
  } catch (error) {
    sendJson(res, 500, { error: 'mock_server_error', message: (error as Error).message });
  }
});

server.listen(PORT, () => {
  console.log(`Mock OAuth server listening on http://localhost:${PORT}`);
  console.log(`Set OAUTH_MOCK_BASE_URL=http://localhost:${PORT} in .env, then restart the app.`);
  console.log('Endpoints: /google/*, /github/*, /v1.0/me (Microsoft profile)');
});
