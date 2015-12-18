var streams = require('./streams'),
    timestamp = require('unix-timestamp');

module.exports = [
  {
    id: 'e_0',
    streamId: streams[0].children[0].id,
    time: timestamp.now('-27h'),
    duration: timestamp.duration('1h'),
    type: 'activity/pryv',
    tags: ['super', 'cali', 'fragilistic', 'expiali', 'docious'],
    description: 'First period event, with attachments',
    attachments: [
      {
        id: 'document',
        fileName: 'document.pdf',
        type: 'application/pdf',
        size: 6701
      },
      {
        id: 'image',
        fileName: 'image (space and special chars).png',
        type: 'image/png',
        size: 2765
      }
    ],
    created: timestamp.now(),
    createdBy: 'test',
    modified: timestamp.now(),
    modifiedBy: 'test'
  },
  {
    id: 'e_1',
    streamId: streams[0].children[1].id,
    time: timestamp.now('-26h'),
    duration: timestamp.duration('0h59m'),
    type: 'activity/pryv',
    tags: [],
    clientData: {
      stringProp: 'O Brother',
      numberProp: 1
    },
    created: timestamp.now('-26h'),
    createdBy: 'test',
    modified: timestamp.now('-26h'),
    modifiedBy: 'test'
  },
  {
    id: 'e_2',
    streamId: streams[0].id,
    time: timestamp.now('-25h'),
    type: 'picture/attached',
    duration: 0, // must be treated just like no duration
    tags: ['super'],
    description: '陳容龍',
    attachments: [
      {
        id: 'imageBigger',
        fileName: 'image-bigger.jpg',
        type: 'image/jpeg',
        size: 177476
      }
    ],
    created: timestamp.now('-25h'),
    createdBy: 'test',
    modified: timestamp.now('-25h'),
    modifiedBy: 'test'
  },
  {
    id: 'e_3',
    streamId: streams[0].children[1].id,
    time: timestamp.now('-22h'),
    type: 'activity/pryv',
    duration: timestamp.duration('1h31m'),
    tags: ['super', 'cali'],
    created: timestamp.now('-22h'),
    createdBy: 'test',
    modified: timestamp.now('-22h'),
    modifiedBy: 'test'
  },
  {
    id: 'e_4',
    streamId: streams[0].children[1].id,
    time: timestamp.now('-21h'),
    type: 'note/webclip',
    content: { url: 'http://yay.boo', body: 'Happy-happy-dance-dance' },
    tags: [],
    description: 'Mark for specific stream',
    created: timestamp.now('-21h'),
    createdBy: 'test',
    modified: timestamp.now('-21h'),
    modifiedBy: 'test'
  },
  {
    id: 'e_5',
    streamId: streams[1].id,
    time: timestamp.now('-20h29m'),
    duration: timestamp.duration('1h'),
    type: 'activity/pryv',
    tags: [],
    created: timestamp.now('-20h29m'),
    createdBy: 'test',
    modified: timestamp.now('-20h29m'),
    modifiedBy: 'test'
  },
  {
    id: 'e_6',
    streamId: streams[2].id,
    time: timestamp.now('-10h'),
    duration: timestamp.duration('2h'),
    type: 'activity/pryv',
    tags: [],
    created: timestamp.now('-10h'),
    createdBy: 'test',
    modified: timestamp.now('-10h'),
    modifiedBy: 'test'
  },
  {
    id: 'e_7',
    streamId: streams[2].id,
    time: timestamp.now('-9h'),
    type: 'activity/pryv',
    tags: [],
    created: timestamp.now('-9h'),
    createdBy: 'test',
    modified: timestamp.now('-9h'),
    modifiedBy: 'test'
  },
  {
    id: 'e_8',
    streamId: streams[2].children[0].id,
    time: timestamp.now('-8h'),
    duration: timestamp.duration('1h'),
    type: 'activity/test',
    content: 'test',
    tags: [],
    created: timestamp.now('-8h'),
    createdBy: 'test',
    modified: timestamp.now('-8h'),
    modifiedBy: 'test'
  },
  {
    id: 'e_9',
    streamId: streams[0].children[0].id,
    time: timestamp.now('-1h'),
    duration: null, // running
    type: 'activity/pryv',
    tags: [],
    description: 'One hour ago',
    created: timestamp.now('-1h'),
    createdBy: 'test',
    modified: timestamp.now('-1h'),
    modifiedBy: 'test'
  },
  {
    id: 'e_10',
    streamId: streams[0].children[0].id,
    time: timestamp.now('-30m'),
    type: 'temperature/c',
    content: 37.2,
    tags: [],
    description: 'Deleted event',
    trashed: true,
    created: timestamp.now('-15m'),
    createdBy: 'test',
    modified: timestamp.now('-15m'),
    modifiedBy: 'test'
  },
  {
    id: 'e_11',
    streamId: streams[1].children[0].id,
    time: timestamp.now('-15m'),
    duration: null, // running
    type: 'activity/pryv',
    tags: ['fragilistic'],
    description: '15 mins ago',
    created: timestamp.now('-15m'),
    createdBy: 'test',
    modified: timestamp.now('-15m'),
    modifiedBy: 'test'
  },
  {
    id: 'e_12',
    streamId: streams[3].id,
    time: timestamp.now(),
    type: 'picture/attached',
    tags: [],
    attachments: [
      {
        id: 'animatedGif',
        fileName: 'animated.gif',
        type: 'image/gif',
        size: 88134
      }
    ],
    created: timestamp.now(),
    createdBy: 'test',
    modified: timestamp.now(),
    modifiedBy: 'test'
  },

  // deletions
  {
    id: 'e_13',
    deleted: timestamp.now('-5m')
  },
  {
    id: 'e_14',
    deleted: timestamp.now('-1d')
  },
  {
    id: 'e_15',
    deleted: timestamp.now('-2y') // to be cleaned up by Mongo TTL
  },

  // auditing
  {
    id: 'e_16',
    streamId: streams[7].id,
    time: timestamp.now('+32h'),
    duration: timestamp.duration('1m'),
    type: 'activity/pryv',
    tags: ['super', 'cali', 'fragilistic', 'expiali', 'docious'],
    description: 'top of the history array, most recent modified event',
    created: timestamp.now('-9h'),
    createdBy: 'test',
    modified: timestamp.now('-3h'),
    modifiedBy: 'test'
  },
  {
    id: 'e_17',
    headId: 'e_16',
    streamId: streams[7].id,
    time: timestamp.now('+32h'),
    duration: timestamp.duration('1m'),
    type: 'activity/pryv',
    tags: ['super', 'cali', 'fragilistic', 'expiali', 'docious'],
    description: 'bottom of the history, event upon creation.',
    created: timestamp.now('-9h'),
    createdBy: 'test',
    modified: timestamp.now('-9h'),
    modifiedBy: 'test'
  },
  {
    id: 'e_18',
    headId: 'e_16',
    streamId: streams[7].id,
    time: timestamp.now('+32h'),
    duration: timestamp.duration('1m'),
    type: 'activity/pryv',
    tags: ['super', 'cali', 'fragilistic', 'expiali', 'docious'],
    description: 'middle of the history, first modification',
    created: timestamp.now('-9h'),
    createdBy: 'test',
    modified: timestamp.now('-6h'),
    modifiedBy: 'test'
  },
  {
    id: 'e_19',
    streamId: streams[7].id,
    time: timestamp.now('3h'),
    type: 'activity/pryv',
    description: 'trashed event used to simplify deletion tests.',
    trashed: true,
    created: timestamp.now('-2h'),
    createdBy: 'test',
    modified: timestamp.now(),
    modifiedBy: 'test'
  },
  {
    id: 'e_20',
    headId: 'e_19',
    streamId: streams[7].id,
    time: timestamp.now('2h'),
    type: 'activity/pryv',
    description: 'trashed event used to simplify deletion tests.',
    trashed: true,
    created: timestamp.now('-2h'),
    createdBy: 'test',
    modified: timestamp.now('-1h'),
    modifiedBy: 'test'
  },
  {
    id: 'e_21',
    headId: 'e_19',
    streamId: streams[7].id,
    time: timestamp.now('1h'),
    type: 'activity/pryv',
    description: 'trashed event used to simplify deletion tests.',
    trashed: true,
    created: timestamp.now('-2h'),
    createdBy: 'test',
    modified: timestamp.now('-2h'),
    modifiedBy: 'test'
  },
  {
    id: 'e_22',
    streamId: streams[7].id,
    time: timestamp.now('+32h'),
    type: 'activity/pryv',
    description: 'simple event with nothing special',
    created: timestamp.now('-1h'),
    createdBy: 'test',
    modified: timestamp.now('-1h'),
    modifiedBy: 'test'
  },
  {
    id: 'e_23',
    streamId: streams[7].id,
    time: timestamp.now('-1h'),
    duration: null, // running
    type: 'activity/pryv',
    tags: [],
    description: 'event started one hour ago on a normal stream',
    created: timestamp.now('-1h'),
    createdBy: 'test',
    modified: timestamp.now('-1h'),
    modifiedBy: 'test'
  },
  {
    id: 'e_24',
    streamId: streams[8].id,
    time: timestamp.now('-1h'),
    duration: null, // running
    type: 'activity/pryv',
    tags: [],
    description: 'event started one hour ago on a singleActivity stream',
    created: timestamp.now('-1h'),
    createdBy: 'test',
    modified: timestamp.now('-1h'),
    modifiedBy: 'test'
  },
  {
    id: 'e_25',
    streamId: streams[7].children[0].id,
    time: timestamp.now('+32h'),
    type: 'activity/pryv',
    description: 'simple event with nothing special',
    created: timestamp.now('-1h'),
    createdBy: 'test',
    modified: timestamp.now('-30m'),
    modifiedBy: 'test'
  },
  {
    id: 'e_26',
    headId: 'e_25',
    streamId: streams[7].children[0].id,
    time: timestamp.now('+32h'),
    type: 'activity/pryv',
    description: 'simple event with nothing special - original version',
    created: timestamp.now('-1h'),
    createdBy: 'test',
    modified: timestamp.now('-1h'),
    modifiedBy: 'test'
  }
];
