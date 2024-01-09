/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
module.exports = [
  {
    name: 'Root Stream 0',
    parentId: null,
    singleActivity: true,
    created: 1390319367.968,
    createdBy: 'test',
    modified: 1390319367.968,
    modifiedBy: 'test',
    id: 's_0',
    children: [
      {
        name: 'Child Stream 0.0',
        parentId: 's_0',
        created: 1390319367.968,
        createdBy: 'test',
        modified: 1390319367.968,
        modifiedBy: 'test',
        id: 's_0_0',
        children: []
      },
      {
        name: 'Child Stream 0.1',
        parentId: 's_0',
        created: 1390319367.968,
        createdBy: 'test',
        modified: 1390319367.968,
        modifiedBy: 'test',
        id: 's_0_1',
        children: []
      }
    ]
  },
  {
    name: 'Root Stream 1',
    parentId: null,
    clientData: {
      stringProp: 'O Brother',
      numberProp: 1
    },
    created: 1390319367.968,
    createdBy: 'test',
    modified: 1390319367.968,
    modifiedBy: 'test',
    id: 's_1',
    children: [
      {
        name: 'Child Stream 1.0',
        parentId: 's_1',
        created: 1390319367.968,
        createdBy: 'test',
        modified: 1390319367.968,
        modifiedBy: 'test',
        id: 's_1_0',
        children: []
      }
    ]
  },
  {
    name: 'Root Stream 2',
    parentId: null,
    created: 1390319367.968,
    createdBy: 'test',
    modified: 1390319367.968,
    modifiedBy: 'test',
    id: 's_2',
    children: [
      {
        name: 'Child Stream 2.0',
        parentId: 's_2',
        created: 1390319367.968,
        createdBy: 'test',
        modified: 1390319367.968,
        modifiedBy: 'test',
        id: 's_2_0',
        children: [
          {
            name: 'Child Stream 2.0.0',
            parentId: 's_2_0',
            created: 1390319367.968,
            createdBy: 'test',
            modified: 1390319367.968,
            modifiedBy: 'test',
            id: 's_2_0_0',
            children: []
          }
        ]
      },

      {
        name: 'Child Stream 2.1',
        parentId: 's_2',
        created: 1390319367.968,
        createdBy: 'test',
        modified: 1390319367.968,
        modifiedBy: 'test',
        id: 's_2_1',
        children: [
          {
            name: 'Child Stream 2.1.0',
            parentId: 's_2_1',
            created: 1390319367.968,
            createdBy: 'test',
            modified: 1390319367.968,
            modifiedBy: 'test',
            id: 's_2_1_0',
            children: []
          }
        ]
      }
    ]
  },
  {
    name: 'Root Stream 3 (trashed)',
    parentId: null,
    trashed: true,
    created: 1390319367.968,
    createdBy: 'test',
    modified: 1390319367.968,
    modifiedBy: 'test',
    id: 's_3',
    children: [
      {
        name: 'Child Stream 3.0',
        parentId: 's_3',
        created: 1390319367.968,
        createdBy: 'test',
        modified: 1390319367.968,
        modifiedBy: 'test',
        id: 's_3_0',
        children: []
      }
    ]
  }
];
