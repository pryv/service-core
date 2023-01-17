/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const streams = require('./streams.js');

module.exports = [
  // events for the main test stream (no overlap)
  {
    id: 'c_0_e_0',
    streamId: streams[0].children[0].children[0].id,
    time: 1374017471.897,
    duration: 3600,
    type: 'activity/pryv',
    tags: ['super', 'cali', 'fragilistic', 'expiali', 'docious'],
    description: 'First period event, with attachments',
    attachments: {
      document: {
        fileName: 'document.pdf',
        type: 'application/pdf',
        size: 6701
      },
      image: {
        fileName: 'image.png',
        type: 'image/png',
        size: 2765
      }
    },
    modified: 1374114671.898
  },
  {
    id: 'c_0_e_1',
    streamId: streams[0].children[0].children[1].id,
    time: 1374021071.898,
    duration: 7140,
    type: 'activity/pryv',
    tags: [],
    clientData: {
      stringProp: 'O Brother',
      numberProp: 1
    },
    modified: 1374021071.898
  },
  {
    id: 'c_0_e_2',
    streamId: 'c_0',
    time: 1374024671.898,
    type: 'picture/attached',
    tags: ['super'],
    description: '陳容龍',
    attachments: {
      imageBigger: {
        fileName: 'image-bigger.jpg',
        type: 'image/jpeg',
        size: 177476
      }
    },
    modified: 1374024671.898
  },
  {
    id: 'c_0_e_3',
    streamId: streams[0].children[0].children[1].id,
    time: 1374035471.898,
    type: 'activity/pryv',
    duration: 5460,
    tags: ['super', 'cali'],
    modified: 1374035471.898
  },
  {
    id: 'c_0_e_4',
    streamId: streams[0].children[0].children[1].id,
    time: 1374039071.898,
    type: 'activity/pryv',
    tags: [],
    description: 'Mark for specific folder',
    modified: 1374039071.898
  },
  {
    id: 'c_0_e_5',
    streamId: streams[0].children[1].id,
    time: 1374040931.898,
    duration: 3600,
    type: 'activity/pryv',
    tags: [],
    modified: 1374040931.898
  },
  {
    id: 'c_0_e_6',
    streamId: streams[0].children[2].id,
    time: 1374078671.898,
    duration: 7200,
    type: 'activity/pryv',
    tags: [],
    modified: 1374078671.898
  },
  {
    id: 'c_0_e_7',
    streamId: streams[0].children[2].id,
    time: 1374082271.898,
    type: 'activity/pryv',
    tags: [],
    modified: 1374082271.898
  },
  {
    id: 'c_0_e_8',
    streamId: streams[0].children[2].children[0].id,
    time: 1374085871.898,
    duration: 3600,
    type: 'activity/pryv',
    tags: [],
    modified: 1374085871.898
  },
  {
    id: 'c_0_e_9',
    streamId: streams[0].children[0].id,
    time: 1374111071.898,
    duration: null, // running
    type: 'activity/pryv',
    tags: [],
    description: 'One hour ago',
    modified: 1374111071.898
  },
  {
    id: 'c_0_e_10',
    streamId: streams[0].children[0].children[0].id,
    time: 1374112871.898,
    type: 'activity/pryv',
    tags: [],
    description: 'Deleted event',
    trashed: true,
    modified: 1374113771.898
  },
  // also have events for each of the other root test streams
  {
    id: 'c_1_e_11',
    streamId: streams[1].children[0].id,
    time: 1374021071.898,
    duration: 7140,
    type: 'test/test',
    tags: [],
    modified: 1374021071.898
  },
  {
    id: 'c_1_e_12',
    streamId: streams[1].children[0].id,
    time: 1374111071.898,
    duration: null, // running
    type: 'activity/pryv',
    tags: [],
    description: 'One hour ago',
    modified: 1374111071.898
  },
  {
    id: 'c_2_e_13',
    streamId: streams[2].children[0].id,
    time: 1374024671.898,
    type: 'test/test',
    tags: [],
    description: 'Mark for no particular folder',
    modified: 1374024671.898
  },
  {
    id: 'c_3_e_14',
    streamId: streams[3].children[0].id,
    time: 1374035471.898,
    type: 'test/test',
    duration: 5460,
    tags: [],
    modified: 1374035471.898
  }
];
