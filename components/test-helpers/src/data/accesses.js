const streams = require('./streams');
const timestamp = require('unix-timestamp');

module.exports = [
  {
    id: 'a_0',
    token: 'a_0_token',
    name: 'pryv-test',
    type: 'personal',
    created: timestamp.now(),
    createdBy: 'test',
    modified: timestamp.now(),
    modifiedBy: 'test',
    lastUsed: 0,
    calls: {}
  },
  {
    id: 'a_1',
    token: 'a_1_token',
    name: 'stream 0: read, stream 1: contribute, stream 2.0: manage',
    type: 'shared',
    permissions: [
      {
        streamId: streams[0].id,
        level: 'read'
      },
      {
        streamId: streams[1].id,
        level: 'contribute'
      },
      {
        streamId: streams[2].children[0].id,
        level: 'manage'
      }
    ],
    created: timestamp.now(),
    createdBy: 'test',
    modified: timestamp.now(),
    modifiedBy: 'test',
    lastUsed: 0,
    calls: {}
  },
  {
    id: 'a_2',
    token: 'a_2_token',
    name: 'read all',
    type: 'shared',
    permissions: [
      {
        streamId: '*',
        level: 'read'
      }
    ],
    created: timestamp.now(),
    createdBy: 'test',
    modified: timestamp.now(),
    modifiedBy: 'test',
    lastUsed: 0,
    calls: {}
  },
  {
    id: 'a_3',
    token: 'a_3_token',
    name: 'no permission',
    type: 'shared',
    permissions: [],
    created: timestamp.now(),
    createdBy: 'test',
    modified: timestamp.now(),
    modifiedBy: 'test',
    lastUsed: 0,
    calls: {}
  },
  {
    id: 'a_4',
    token: 'a_4_token',
    name: 'test-3rd-party-app-id',
    type: 'app',
    deviceName: 'Calvin\'s Amazing Transmogrifier',
    permissions: [
      {
        streamId: streams[0].id,
        level: 'contribute'
      }
    ],
    created: timestamp.now(),
    createdBy: 'test',
    modified: timestamp.now(),
    modifiedBy: 'test',
    lastUsed: 0,
    calls: {}
  },
  {
    id: 'a_5',
    token: 'a_5_token',
    name: 'app-with-just-tag-permissions',
    type: 'app',
    permissions: [
      {
        tag: 'super',
        level: 'contribute'
      },
      {
        tag: 'fragilistic',
        level: 'read'
      }
    ],
    created: timestamp.now(),
    createdBy: 'test',
    modified: timestamp.now(),
    modifiedBy: 'test',
    lastUsed: 0,
    calls: {}
  },
  {
    id: 'a_6',
    token: 'a_6_token',
    name: 'app-with-both-stream-and-tag-permissions',
    type: 'app',
    permissions: [
      {
        streamId: streams[0].id,
        level: 'contribute'
      },
      {
        tag: 'fragilistic',
        level: 'read'
      }
    ],
    created: timestamp.now(),
    createdBy: 'test',
    modified: timestamp.now(),
    modifiedBy: 'test',
    lastUsed: 0,
    calls: {}
  },
  {
    id: 'a_7',
    token: 'a_7_token',
    name: 'deleted shared (should expire)',
    type: 'shared',
    permissions: [
      {
        streamId: streams[0].id,
        level: 'read'
      }
    ],
    created: timestamp.now('-4y'),
    createdBy: 'test',
    modified: timestamp.now('-4y'),
    modifiedBy: 'test',
    lastUsed: timestamp.now('-3y1d'),
    calls: {},
    deleted: timestamp.now('-3y1d')
  }
];
