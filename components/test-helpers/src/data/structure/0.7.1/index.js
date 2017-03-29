module.exports = {
  indexes: {
    events: [
      {
        index: {time: 1},
        options: {}
      },
      {
        index: {streamId: 1},
        options: {}
      },
      {
        index: {tags: 1},
        options: {}
      },
      // no index by content until we have more actual usage feedback
      {
        index: {trashed: 1},
        options: {}
      },
      {
        index: {modified: 1},
        options: {}
      },
      {
        index: {deleted: 1},
        options: {
          // cleanup deletions after a year
          expireAfterSeconds: 3600 * 24 * 365
        }
      }
    ],
    streams: [
      {
        index: {name: 1},
        options: {}
      },
      {
        index: { name: 1, parentId: 1 },
        options: { unique: true, sparse: true }
      },
      {
        index: {trashed: 1},
        options: {}
      },
      {
        index: {deleted: 1},
        options: {
          // cleanup deletions after a year
          expireAfterSeconds: 3600 * 24 * 365
        }
      }
    ],
    accesses: [
      {
        index: {token: 1},
        options: { unique: true, sparse: true }
      },
      {
        index: { name: 1, type: 1, deviceName: 1 },
        options: { unique: true, sparse: true }
      },
      {
        index: {deleted: 1},
        options: {
          // cleanup deletions after 3 years (cf. HIPAA rules)
          expireAfterSeconds: 3600 * 24 * 365 * 3
        }
      }
    ]
  }
};