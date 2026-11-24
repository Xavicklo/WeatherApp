const major = Number(process.versions.node.split(".")[0]);
if (major < 18) {
  console.error(`Node.js ${process.versions.node} is too old: this app needs Node 18+ (it uses the built-in fetch).`);
  process.exit(1);
}

const { createApp } = require("./app");

const port = process.env.PORT || 3000;

createApp().listen(port, () => {
  console.log(`Weather app running at http://localhost:${port}`);
});
