/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * UserSQLiteDatabase interface — contract for a single per-user SQLite database.
 * Covers event CRUD, history, streaming, and audit queries.
 *
 * Use {@link validateUserSQLiteDatabase} to verify prototype-based instances.
 */

const REQUIRED_METHODS = [
  'init',
  'close',
  'getEvents',
  'getEventsStreamed',
  'getEventDeletionsStreamed',
  'getOneEvent',
  'countEvents',
  'getAllActions',
  'getAllAccesses',
  'createEvent',
  'createEventSync',
  'updateEvent',
  'getEventHistory',
  'minimizeEventHistory',
  'deleteEventHistory',
  'deleteEvents',
  // Migration methods
  'exportAllEvents',
  'importAllEvents'
];

/**
 * Validate that a class instance implements all required UserSQLiteDatabase methods.
 * @param {Object} instance
 * @returns {Object} The instance itself
 */
module.exports.validateUserSQLiteDatabase = function validateUserSQLiteDatabase (instance) {
  for (const method of REQUIRED_METHODS) {
    if (typeof instance[method] !== 'function') {
      throw new Error(`UserSQLiteDatabase implementation missing method: ${method}`);
    }
  }
  return instance;
};

module.exports.REQUIRED_METHODS = REQUIRED_METHODS;
