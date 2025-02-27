/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
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
