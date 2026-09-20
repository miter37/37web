#!/usr/bin/env node
import "dotenv/config";
import { getConfig } from "../config";
import { BrowserDaemon } from "../browserd/server";

const config = getConfig();
const daemon = new BrowserDaemon(config);
await daemon.start();
console.log(JSON.stringify({
  browserd: "ready",
  address: `http://${config.host}:${config.port}`,
  requestedChromeProfile: config.chromeProfileName,
  headless: config.headless,
  browserChannel: config.browserChannel || "chrome",
  cdpPort: config.cdpPort,
  forceProfileTakeover: config.forceProfileTakeover,
}, null, 2));

const shutdown = async () => {
  await daemon.stop().catch(() => {});
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
