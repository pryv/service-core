/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// File built manually by copying indexes (that will change during migration)
// from different collections specifications in storage/src/user
module.exports = {
  indexes: {
    events: [
      {
        index: { time: 1 },
        options: {}
      },
      {
        index: { streamId: 1 },
        options: {}
      },
      {
        index: { tags: 1 },
        options: {}
      },
      // no index by content until we have more actual usage feedback
      {
        index: { trashed: 1 },
        options: {}
      },
      {
        index: { modified: 1 },
        options: {}
      },
      {
        index: { deleted: 1 },
        options: {
          // cleanup deletions after a year
          expireAfterSeconds: 3600 * 24 * 365
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
      },
      {
        index: { deleted: 1 },
        options: {
          // cleanup deletions after a year
          expireAfterSeconds: 3600 * 24 * 365
        }
      }
    ],
    accesses: [
      {
        index: { token: 1 },
        options: { unique: true, sparse: true }
      },
      {
        index: { name: 1, type: 1, deviceName: 1 },
        options: { unique: true, sparse: true }
      },
      {
        index: { deleted: 1 },
        options: {
          // cleanup deletions after 3 years (cf. HIPAA rules)
          expireAfterSeconds: 3600 * 24 * 365 * 3
        }
      }
    ]
  }
};
