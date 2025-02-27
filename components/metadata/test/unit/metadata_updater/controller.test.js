/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

// Tests the Metadata Updater Controller.

const chai = require('chai');
const assert = chai.assert;
const sinon = require('sinon');
const { PendingUpdate, PendingUpdatesMap } = require('../../../src/metadata_updater/pending_updates');
const { Controller } = require('../../../src/metadata_updater/controller');
const { Flush } = require('../../../src/metadata_updater/flush');
const { getLogger } = require('@pryv/boiler');

describe('Metadata Updater/Controller', () => {
  const logger = getLogger('metadata');
  let map;
  let controller;
  beforeEach(() => {
    // Replace the database connection here with a dummy. We're testing the
    // controller, not the database access.
    const db = {
      events: {
        getCollectionInfoWithoutUserId: () => { }
      }
    };
    map = new PendingUpdatesMap();
    controller = new Controller(db, map, logger);
  });
  afterEach(() => {
    controller.stop();
  });

  describe('#runEach(ms)', () => {
    it('[9TJ0] starts a timer and runs #act every n ms', (done) => {
      const now = Number(new Date());
      const callTimestamps = [];

      const stub = sinon.stub(controller, 'act');
      stub.callsFake(() => {
        callTimestamps.push(Number(new Date()));

        if (callTimestamps.length >= 2) {
          // First call happens immediately.
          assert.approximately(now, callTimestamps[0], 50);

          // And the second call 10 ms afterwards
          assert.approximately(callTimestamps[0], callTimestamps[1], 20);

          done();
        }
      });

      controller.runEach(10);
    });
  });
  describe('#flushOp(update)', () => {
    const now = new Date() / 1e3;
    const update = makeUpdate(now, {});
    it('[2W9C] constructs an Flush operation for the update and returns it', () => {
      const flush = controller.flushOp(update);

      assert.instanceOf(flush, Flush);
    });
  });
  describe('#act', () => {
    const now = new Date() / 1e3;

    // Stores two 'update's in the `map`.
    beforeEach(() => {
      map.merge(makeUpdate(now - 10 * 60, { eventId: 'event1' }));
      map.merge(makeUpdate(now - 10 * 60, { eventId: 'event2' }));
    });

    it('[CIPH] pulls elapsed updates and flushes them to MongoDB', async () => {
      const flushOps = [];

      // Stub out the flushOp producer
      const flushOp = sinon.stub(controller, 'flushOp');
      flushOp.callsFake(() => {
        const op = sinon.spy();
        flushOps.push(op);

        return { run: op };
      });

      controller.act();

      assert.strictEqual(flushOps.length, 2);
      for (const op of flushOps) {
        await sinon.assert.calledOnce(op);
      }
    });
  });
});
/**
 * @param {number} now
 * @param {UpdateAttrs} attrs
 * @returns {any}
 */
function makeUpdate (now, attrs = {}) {
  const myAttrs = {
    userId: attrs.userId || 'user',
    eventId: attrs.eventId || 'event',
    author: attrs.author || 'token1',
    timestamp: attrs.timestamp || now,
    dataExtent: {
      from: attrs.from || now - 100,
      to: attrs.to || now
    }
  };

  return PendingUpdate.fromUpdateRequest(now, myAttrs);
}

/**
 * @typedef {{
 *   from?: number;
 *   to?: number;
 *   timestamp?: number;
 *   author?: string;
 *   userId?: string;
 *   eventId?: string;
 * }} UpdateAttrs
 */
