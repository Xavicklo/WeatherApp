const major = Number(process.versions.node.split(".")[0]);
if (major < 18) {
  console.error(`Node.js ${process.versions.node} is too old: this app needs Node 18+ (it uses the built-in fetch).`);
  process.exit(1);
}

// Read .env (e.g. MAPBOX_TOKEN) when the Node version supports it (20.12+); no extra package needed
const fs = require("node:fs");
const path = require("node:path");
const envFile = path.join(__dirname, "../.env");
if (fs.existsSync(envFile) && typeof process.loadEnvFile === "function") process.loadEnvFile(envFile);

const { createApp } = require("./app");

const port = process.env.PORT || 3000;

createApp().listen(port, () => {
  console.log(`Weather app running at http://localhost:${port}`);
});
