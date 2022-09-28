/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
module.exports = {
  indexes: {
    events: [
      {
        index: { time: 1 },
        options: {},
      },
      {
        index: { streamIds: 1 },
        options: {},
      },
      {
        index: { tags: 1 },
        options: {},
      },
      {
        index: { trashed: 1 },
        options: {},
      },
      {
        index: { modified: 1 },
        options: {},
      },
      {
        index: { endTime: 1 },
        options: { partialFilterExpression: { endTime: { $exists: true } } },
      },
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
