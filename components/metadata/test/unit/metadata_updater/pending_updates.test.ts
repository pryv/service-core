/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// Tests for the PendingUpdatesMap and its helper classes.

/* global describe, it, beforeEach */

const chai = require('chai');
const assert = chai.assert;
const sinon = require('sinon');

const {
  PendingUpdatesMap,
  PendingUpdate,
} = require('../../../src/metadata_updater/pending_updates');

type UpdateAttrs = {
  from?: number;
  to?: number;
  timestamp?: number;
  author?: string;
  userId?: string;
  eventId?: string;
};

describe('PendingUpdatesMap', () => {
  describe('#merge and #get', () => {
    let map: PendingUpdatesMap;
    beforeEach(() => {
      map = new PendingUpdatesMap();
    });

    const now = new Date() / 1e3;
    const update1: PendingUpdate = makeUpdate(now);
    const update2: PendingUpdate = makeUpdate(now, {
      author: 'token2',
      timestamp: now + 10,
      from: now - 200,
      to: now - 20,
    });

    it('[RE2D] stores updates', () => {
      map.merge(update1);
      const value = map.get(update1.key());

      if (value == null) throw new Error('Should not be null.');

      assert.deepEqual(value, update1);
    });
    it('[JJ2Y] merges updates with preexisting updates via #merge', () => {
      sinon.stub(update1, 'merge');

      map.merge(update1);
      map.merge(update2);

      sinon.assert.calledOnce(update1.merge);
      sinon.assert.calledWith(update1.merge, update2);
    });
  });
  describe('#elapsed', () => {
    let map: PendingUpdatesMap;
    beforeEach(() => {
      map = new PendingUpdatesMap();
    });

    const now = new Date() / 1e3;

    // Populate the map with 10 updates, starting 10 minutes ago and entering an
    // update every minute.
    let updates: Array<PendingUpdate>;
    beforeEach(() => {
      updates = [];

      let time = now - 10 * 60;
      for (let min = 0; min < 10; min++) {
        updates.push(
          makeUpdate(time + min * 60, {
            eventId: `event@${min}`,
          })
        );
      }
    });

    it('[O55W] returns all updates that should be flushed', () => {
      // Store updates in the map, adjusting cooldown to be later than deadline
      for (const update of updates) {
        update.cooldown = update.deadline;
        map.merge(update);
      }

      // 5 of the updates will have elapsed already, since they've been created
      // > 5min ago.
      const elapsed = map.getElapsed(now - 1);

      assert.strictEqual(elapsed.length, 5);
      assert.strictEqual(map.size(), 5);
    });
    it('[HWPP] uses #flushAt to determine deadlines', () => {
      // Store updates in the map, leaving cooldown as is (will be past due).
      for (const update of updates) map.merge(update);

      // Cooldown will have elapsed for all of these updates.
      const elapsed = map.getElapsed(now);

      assert.strictEqual(elapsed.length, 10);
      assert.strictEqual(map.size(), 0);
    });
  });
});

describe('PendingUpdate', () => {
  describe('#merge', () => {
    const now = new Date() / 1e3;

    let update1: PendingUpdate;
    beforeEach(() => {
      update1 = PendingUpdate.fromUpdateRequest(now, {
        userId: 'user',
        eventId: 'event',

        author: 'token1',
        timestamp: now,
        dataExtent: {
          from: now - 100,
          to: now - 20,
        },
      });
    });
    let update2: PendingUpdate;
    beforeEach(() => {
      update2 = PendingUpdate.fromUpdateRequest(now, {
        userId: 'user',
        eventId: 'event',

        author: 'token2',
        timestamp: now + 10,
        dataExtent: {
          from: now - 200,
          to: now,
        },
      });
    });

    it('[412V] constructively merges two updates', () => {
      update1.deadline = now + 30;
      update2.deadline = now + 20;

      update1.cooldown = now - 100;

      update1.merge(update2);

      const req1 = update1.request;
      assert.strictEqual(req1.userId, 'user');
      assert.strictEqual(req1.eventId, 'event');

      // update2 is later (timestamp), and thus this is the last author
      assert.strictEqual(req1.author, 'token2');
      assert.approximately(req1.timestamp, now + 10, 1);

      // dataExtent is merged by widening the range covered as far as possible.
      assert.approximately(
        req1.dataExtent.from,
        now - 200,
        1,
        'update2 covers more of the past, and thus wins for from'
      );
      assert.approximately(
        req1.dataExtent.to,
        now,
        1,
        'update1 covers more in the present and wins'
      );

      assert.approximately(
        update1.deadline,
        now + 20,
        1,
        'earlier deadline wins'
      );

      // Latter timestamp wins, so this is now + 10 + 10...
      assert.approximately(
        update1.cooldown,
        now + 10 + 10,
        1,
        'cooldown is reset to now+COOLDOWN_TIME on every merge'
      );
    });
    it('[HS79] fails when key is not equal', () => {
      const failing = makeUpdate(now, {
        userId: 'user - no match',
      });

      assert.throws(() => update1.merge(failing));
    });
  });

  describe('#flushAt()', () => {
    const now = new Date() / 1e3;

    let update: PendingUpdate;
    beforeEach(() => {
      update = PendingUpdate.fromUpdateRequest(now, {
        userId: 'user',
        eventId: 'event',

        author: 'token1',
        timestamp: now,
        dataExtent: {
          from: now - 100,
          to: now - 20,
        },
      });
    });

    it('[79JJ] returns `cooldown` when deadline is far away', () => {
      const flushAt = update.flushAt();

      assert.approximately(flushAt, update.cooldown, 1);
    });
    it('[OQLP] returns `deadline` when deadline is < `cooldown`', () => {
      update.cooldown = update.deadline - 1;

      const flushAt = update.flushAt();

      assert.approximately(flushAt, update.cooldown, 1);
    });
  });
});

function makeUpdate(now: number, attrs: UpdateAttrs = {}): PendingUpdate {
  const myAttrs = {
    userId: attrs.userId || 'user',
    eventId: attrs.eventId || 'event',

    author: attrs.author || 'token1',
    timestamp: attrs.timestamp || now,
    dataExtent: {
      from: attrs.from || now - 100,
      to: attrs.to || now,
    },
  };

  return PendingUpdate.fromUpdateRequest(now, myAttrs);
}
