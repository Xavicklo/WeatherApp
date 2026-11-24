const { createApp } = require("./app");

const port = process.env.PORT || 3000;

createApp().listen(port, () => {
  console.log(`Weather app running at http://localhost:${port}`);
});
