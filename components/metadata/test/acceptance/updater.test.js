/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

// A test for the updater service.

const chai = require('chai');
const assert = chai.assert;
const helpers = require('./test-helpers');
const rpc = require('tprpc');
const metadata = require('metadata');

describe('Metadata Updater', () => {
  // Set up the server end
  let server;
  before(async () => {
    server = await helpers.spawnContext.spawn();
  });
  after(() => {
    server.stop();
  });
  // Set up the client end of the service.
  let service;
  before(async () => {
    const definition = await metadata.updater.definition;
    const client = new rpc.Client(definition);
    service = client.proxy('MetadataUpdaterService', `127.0.0.1:${server.port}`);
  });
  it('[POMC] allows scheduling an update', async () => {
    const now = new Date() / 1e3; // now in seconds
    await service.scheduleUpdate({
      entries: [
        {
          userId: 'userName',
          eventId: 'eventId',
          author: 'accessToken',
          timestamp: now,
          dataExtent: {
            from: now,
            to: now
          }
        }
      ]
    });
    const update = await service.getPendingUpdate({
      userId: 'userName',
      eventId: 'eventId'
    });
    assert.isTrue(update.found);
    const deadline = update.deadline;
    const min5 = 5 * 60; // STALE_LIMIT
    assert.approximately(deadline, now + min5, 2);
  });
});
