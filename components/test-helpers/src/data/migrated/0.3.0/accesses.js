/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const streams = require('./streams.js');

module.exports = [
  {
    token: 'a_0',
    name: 'pryv-browser',
    type: 'personal'
  },
  {
    token: 'a_1',
    name: 'channel 0: read + folder-specific, channel 1: contribute, channel 2: manage, ' +
        'others: read',
    type: 'shared',
    permissions: [
      {
        streamId: streams[0].id,
        level: 'read'
      },
      {
        streamId: streams[0].children[0].id,
        level: 'read'
      },
      {
        streamId: streams[0].children[1].id,
        level: 'contribute'
      },
      {
        streamId: streams[0].children[2].children[0].id,
        level: 'manage'
      },
      {
        streamId: streams[1].id,
        level: 'contribute'
      },
      {
        streamId: streams[2].id,
        level: 'manage'
      },
      {
        streamId: '*',
        level: 'read'
      }
    ]
  },
  {
    token: 'a_2',
    name: 'channel 0: read all',
    type: 'shared',
    permissions: [
      {
        streamId: streams[0].id,
        level: 'read'
      }
    ]
  },
  {
    token: 'a_3',
    name: 'no permission',
    type: 'shared',
    permissions: []
  },
  {
    token: 'a_4',
    name: 'test-3rd-party-app-id',
    type: 'app',
    deviceName: 'Calvin\'s Amazing Transmogrifier',
    permissions: [
      {
        streamId: streams[0].id,
        level: 'contribute'
      }
    ]
  }
];
