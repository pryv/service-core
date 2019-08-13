#!/usr/bin/env node

// Service that receives notifications from api-server and send them to existing Webhooks.

const Application = require('../src/application');

startup()
  .catch(err => console.error(err)); // eslint-disable-line no-console

async function startup() {
  const app = new Application();

  await app.setup();
  await app.run();
}