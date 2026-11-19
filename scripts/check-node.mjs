// Fails fast with a clear message when the Node.js version is too old for the toolchain
// (Vite 8, Vitest 5 and TypeScript 7 need Node 22 or newer).
const REQUIRED_MAJOR = 22;
const [major] = process.versions.node.split(".").map(Number);

if (major < REQUIRED_MAJOR) {
  console.error(`SiteGuard needs Node.js ${REQUIRED_MAJOR} or newer, but this machine has ${process.version}.`);
  console.error("Install a current Node.js release (https://nodejs.org) or configure it on the Jenkins agent.");
  process.exit(1);
}
console.log(`Node.js ${process.version} OK (>= ${REQUIRED_MAJOR}), npm user agent: ${process.env.npm_config_user_agent ?? "n/a"}`);
