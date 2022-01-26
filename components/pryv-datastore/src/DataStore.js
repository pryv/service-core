/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow

const UserEvents = require('./UserEvents');
const UserStreams = require('./UserStreams');
const Defaults = require('./Defaults');

/**
 * Notes:
 * - supports
 *    - attachments
 *    - series
 *
 * - series
 */

/**
 * @property {UserStreams} streams
 * @property {UserEvents} events
 */
class DataStore {

  static Defaults = Defaults;
  static UserEvents = UserEvents;
  static UserStreams = UserStreams;

  _id: string;
  _name: string;

  set id(id: string): void { this._id = id; }
  set name(name: string): void { this._name = name; }
  get id(): string { return this._id; }
  get name(): string { return this._name; }

  async init(config: {}): Promise<void> { throw new Error('Not implemented'); }

  /**
   * @returns UserStreams
   */
  get streams(): UserStreams { throw new Error('Not implemented'); }
  /**
   * @returns UserEvents
   */
  get events(): UserEvents { throw new Error('Not implemented'); }

  /**
   * Uncomment and implement the following if this storage supports it
   * @param {identifier} streamId - the streamId to expand (should be returned in Array list)
   * @returns {Streams<Array>|string|null> returns all children recursively for this stream OR a proprietary string to be interpreted by events.get() in the streamQuery OR null if not expandable
   */
  //async expandStreamForStreamQuery(streamId) { throw new Error('Not implemented'); }

}

module.exports = DataStore;
