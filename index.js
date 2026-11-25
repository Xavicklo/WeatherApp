// Entry point for Vercel. Vercel looks for a root file that imports express and
// exports the app (https://vercel.com/docs/frameworks/backend/express);
// the whole app then runs as one Vercel Function, and public/ is served by its CDN.
// Locally, `npm start` still uses src/server.js.
require("express");
const { createApp } = require("./src/app");

module.exports = createApp();
