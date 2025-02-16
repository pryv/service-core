/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */
module.exports = {
  indexes: {
    events: [
      {
        index: { time: 1 },
        options: {}
      },
      {
        index: { streamIds: 1 },
        options: {}
      },
      {
        index: { tags: 1 },
        options: {}
      },
      {
        index: { trashed: 1 },
        options: {}
      },
      {
        index: { modified: 1 },
        options: {}
      },
      {
        index: { endTime: 1 },
        options: { partialFilterExpression: { endTime: { $exists: true } } }
      }
    ],
    accesses: [
      {
        index: { token: 1 },
        options: {
          unique: true,
          partialFilterExpression: { deleted: { $type: 'null' } }
        }
      },
      {
        index: { name: 1, type: 1, deviceName: 1 },
        options: {
          unique: true,
          partialFilterExpression: { deleted: { $type: 'null' } }
        }
      }
    ],
    streams: [
      {
        index: { name: 1 },
        options: {}
      },
      {
        index: { name: 1, parentId: 1 },
        options: { unique: true, sparse: true }
      },
      {
        index: { trashed: 1 },
        options: {}
      }
    ],
    followedSlices: [
      {
        index: { name: 1 },
        options: { unique: true }
      },
      {
        index: { username: 1, accessToken: 1 },
        options: { unique: true }
      }
    ],
    profile: []
  }
};
