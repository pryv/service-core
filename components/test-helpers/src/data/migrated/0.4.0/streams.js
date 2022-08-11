/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
module.exports = [
  {
    id: 'c_0_f_0',
    name: 'Root Stream 0',
    parentId: null,
    singleActivity: true, // forbid period events overlapping
    children: [
      {
        id: 'c_0_f_0_0',
        name: 'Child Stream 0.0',
        parentId: 'c_0_f_0',
        children: []
      },
      {
        id: 'c_0_f_0_1',
        name: 'Child Stream 0.1',
        parentId: 'c_0_f_0',
        children: []
      }
    ]
  },
  {
    id: 'c_0_f_1',
    name: 'Root Stream 1',
    parentId: null,
    clientData: {
      stringProp: 'O Brother',
      numberProp: 1
    },
    children: [
      {
        id: 'c_0_f_1_0',
        name: 'Child Stream 1.0',
        parentId: 'c_0_f_1',
        children: []
      }
    ]
  },
  {
    id: 'c_0_f_2',
    name: 'Root Stream 2',
    parentId: null,
    children: [
      {
        id: 'c_0_f_2_0',
        name: 'Child Stream 2.0',
        parentId: 'c_0_f_2',
        children: [
          {
            id: 'c_0_f_2_0_0',
            name: 'Child Stream 2.0.0',
            parentId: 'c_0_f_2_0',
            children: []
          }
        ]
      },
      {
        id: 'c_0_f_2_1',
        name: 'Child Stream 2.1',
        parentId: 'c_0_f_2',
        children: [
          {
            id: 'c_0_f_2_1_0',
            name: 'Child Stream 2.1.0',
            parentId: 'c_0_f_2_1',
            children: []
          }
        ]
      }
    ]
  },
  {
    id: 'c_0_f_3',
    name: 'Root Stream 3 (trashed)',
    parentId: null,
    trashed: true,
    children: [
      {
        id: 'c_0_f_3_0',
        name: 'Child Stream 3.0',
        parentId: 'c_0_f_3',
        children: []
      }
    ]
  }
];
