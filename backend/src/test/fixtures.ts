import http from "node:http";
import type { AddressInfo } from "node:net";

export interface Fixture {
  url: string;
  close: () => Promise<void>;
}

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

/** Starts an HTTP server on a random local port. */
export async function serve(handler: Handler): Promise<Fixture> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

const notFound = (res: http.ServerResponse) => {
  res.statusCode = 404;
  res.setHeader("content-type", "text/html");
  res.end("<!doctype html><title>Not found</title>");
};

/** A deliberately insecure site: exposed .env and .git, old jQuery, permissive CORS, weak cookie, HTTP form. */
export const weakSite = (token = "token"): Handler => (req, res) => {
  if (req.headers.origin) {
    res.setHeader("access-control-allow-origin", req.headers.origin);
    res.setHeader("access-control-allow-credentials", "true");
  }
  res.setHeader("x-powered-by", "Express 4.16.0");
  switch (req.url) {
    case "/.well-known/security-app-verification.txt":
      return res.end(token);
    case "/.env":
      res.setHeader("content-type", "text/plain");
      return res.end("DB_PASSWORD=hunter2\nAPI_KEY=abc\n");
    case "/.git/HEAD":
      return res.end("ref: refs/heads/main\n");
    case "/":
      res.setHeader("content-type", "text/html");
      res.setHeader("set-cookie", "session=abc123; Path=/");
      return res.end(`<!doctype html><html><head><title>Shop</title>
<meta name="generator" content="WordPress 5.2.1">
<script src="https://code.jquery.com/jquery-1.12.4.min.js"></script></head>
<body><form action="http://example.com/login" method="post"><input type="password"></form></body></html>`);
    default:
      return notFound(res);
  }
};

/** A well-configured site. Unknown paths return an HTML 404 page (a "soft" miss the scanner must not flag). */
export const hardenedSite: Handler = (req, res) => {
  res.setHeader("content-security-policy", "default-src 'self'; frame-ancestors 'self'; object-src 'none'");
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
  res.setHeader("permissions-policy", "camera=()");
  res.setHeader("cache-control", "no-cache");
  if (req.url === "/.well-known/security.txt") return res.end("Contact: mailto:security@example.test\n");
  if (req.url === "/") {
    res.setHeader("content-type", "text/html");
    res.setHeader("set-cookie", "sid=1; Path=/; HttpOnly; SameSite=Lax");
    return res.end("<!doctype html><html><head><title>Docs</title><script src='/app.js' defer></script></head><body>ok</body></html>");
  }
  return notFound(res);
};
