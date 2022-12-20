/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const logger = require('@pryv/boiler').getLogger('PUM');
const Heap = require('heap');

// Code related to bookkeeping for pending updates. Will probably move.

// time from epoch, in seconds

class PendingUpdatesMap {
  // Currently pending updates.
  map;
  heap;

  constructor () {
    this.map = new Map();
    this.heap = new Heap(comparePendingUpdates);
  }

  // Merges the `update` into the map, so that in the end, the data in `update`
  // is represented by our next update. See design document (HF Pryv) on how
  // updates are  merged in detail.
  //
  // The collection takes ownership of the `update` parameter, meaning it may
  // well modify it down the line.
  //
  /**
   * @param {PendingUpdate} update
   * @returns {void}
   */
  merge (update) {
    const map = this.map;
    const heap = this.heap;

    const key = update.key();
    if (map.has(key)) {
      const existing = map.get(key);
      if (existing == null) { throw new Error('AF: existing cannot be null'); }
      existing.merge(update);
      // Now that we've possibly modified the deltaTimes on `existing`, let's
      // rebuild the heap.
      heap.updateItem(existing);
    } else {
      map.set(update.key(), update);
      heap.push(update);
    }
  }

  // Returns a pending update stored under `key` if such an update exists
  // currently. Ownership remains with the map.
  //
  /**
   * @param {PendingUpdateKey} key
   * @returns {PendingUpdate}
   */
  get (key) {
    const map = this.map;
    return map.get(key) || null;
  }

  // Returns the amount of updates the map stores.
  //
  /**
   * @returns {number}
   */
  size () {
    return this.map.size;
  }

  // Using the heap index, return all the updates that are past their deadline.
  // Ownership passes to the caller; the updates are deleted from all internal
  // structures.
  //
  /**
   * @param {EpochTime} now
   * @returns {PendingUpdate[]}
   */
  getElapsed (now) {
    const heap = this.heap;
    const map = this.map;
    const elapsed = [];

    logger.debug(`getElapsed, heap is ${heap.size()} items.`);

    while (heap.size() > 0) {
      const head = heap.peek();
      if (head == null) { throw new Error('AF: Heap is not empty, head must be an element'); }
      logger.debug('Peek head has deadline', head.deadline, `(and it is now ${now} o'clock)`);
      if (head.flushAt() > now) { break; }
      // assert: head has elapsed and the heap is not empty

      // Remove the element from both the map and the heap
      const elapsedUpdate = heap.pop();
      if (elapsedUpdate == null) { throw new Error('AF: Heap is not empty, head must be an element'); }
      map.delete(elapsedUpdate.key());

      // And prepare to return it to the caller.
      elapsed.push(elapsedUpdate);
    }

    return elapsed;
  }
}
const STALE_LIMIT = 5 * 60; // how stale can data ever get?
const COOLDOWN_TIME = 10; // how long do we wait before flushing in general?

class PendingUpdate {
  request;

  // When should we flush this update at the latest?
  deadline;

  // Flush at the earliest; awaiting more updates with the same key

  cooldown;
  /** @static
   * @param {EpochTime} now
   * @param {IUpdateRequest} req
   * @returns {PendingUpdate}
   */
  static fromUpdateRequest (now, req) {
    return new PendingUpdate(now, req);
  }

  /** @static
   * @param {IUpdateId} id
   * @returns {string}
   */
  static key (id) {
    return key(id.userId, id.eventId);
  }

  constructor (now, req) {
    this.request = req;
    this.deadline = now + STALE_LIMIT;
    this.cooldown = now + COOLDOWN_TIME;

    const { from, to } = req.dataExtent;
    if (from > to) { throw new Error('Invalid update, from > to.'); }
  }

  /**
   * @returns {string}
   */
  key () {
    const request = this.request;
    return key(request.userId, request.eventId);
  }

  // Merges two pending updates for a given key. Merges are done according
  // to the meaning of each update field; for example the update that is
  // later will determine the update author. This method modifies this.
  //
  /**
   * @param {PendingUpdate} other
   * @returns {void}
   */
  merge (other) {
    if (this.key() !== other.key()) { throw new Error('Attempting update with data for a different series.'); }
    // The later update wins for timestamp and author
    const ts = (e) => e.request.timestamp;
    const later = [this, other].sort((a, b) => ts(a) - ts(b))[1];
    const request = this.request;
    const latReq = later.request;
    request.author = latReq.author;
    request.timestamp = ts(later);

    // Take the union of the two dataExtents.
    const dataExtent = request.dataExtent;
    const otherExtent = other.request.dataExtent;
    dataExtent.from = Math.min(dataExtent.from, otherExtent.from);
    dataExtent.to = Math.max(dataExtent.to, otherExtent.to);

    // Earliest deadline wins.
    this.deadline = Math.min(this.deadline, other.deadline);

    // Since we just touched this object, start a new cooldown period
    this.cooldown = request.timestamp + COOLDOWN_TIME;
  }

  /**
   * @returns {number}
   */
  flushAt () {
    return Math.min(this.deadline, this.cooldown);
  }
}
/**
 * @param {string} a
 * @param {string} b
 * @returns {string}
 */
function key (a, b) {
  return [a, b].join('/');
}
// Compares two pending updates for the purpose of sorting.
//
/**
 * @param {PendingUpdate} a
 * @param {PendingUpdate} b
 * @returns {number}
 */
function comparePendingUpdates (a, b) {
  // For now, just use the deadline property.
  const ts = (e) => e.flushAt();

  return ts(a) - ts(b);
}
module.exports = {
  PendingUpdatesMap,
  PendingUpdate
};

/** @typedef {number} EpochTime */

/**
 * @typedef {{
 *   userId: string; // user name
 *   eventId: string; // event id
 *   author: string; // token
 *   timestamp: EpochTime; // when was the update made
 *   dataExtent: {
 *     from: EpochTime; // lowest update timestamp
 *     to: EpochTime; // highest update timestamp
 *   };
 * }} UpdateStruct
 */

/** @typedef {string} PendingUpdateKey */
