/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const streams = require('./streams');

module.exports = [
  {
    id: 'a_0',
    token: 'a_0',
    name: 'pryv-browser',
    type: 'personal'
  },
  {
    id: 'a_1',
    token: 'a_1',
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
    ]
  },
  {
    id: 'a_2',
    token: 'a_2',
    name: 'read all',
    type: 'shared',
    permissions: [
      {
        streamId: '*',
        level: 'read'
      }
    ]
  },
  {
    id: 'a_3',
    token: 'a_3',
    name: 'no permission',
    type: 'shared',
    permissions: []
  },
  {
    id: 'a_4',
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
