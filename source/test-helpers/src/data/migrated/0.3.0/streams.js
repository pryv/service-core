module.exports = [
  {
    id: 'c_0',
    name: 'Channel Zero (no overlap)',
    parentId: null,
    singleActivity: true,
    children: [
      {
        id: 'c_0_f_0',
        name: 'Root Folder 0',
        parentId: 'c_0',
        children: [
          {
            id: 'c_0_f_0_0',
            name: 'Child Folder 0.0',
            parentId: 'c_0_f_0',
            children: []
          },
          {
            id: 'c_0_f_0_1',
            name: 'Child Folder 0.1',
            parentId: 'c_0_f_0',
            children: []
          }
        ]
      },
      {
        id: 'c_0_f_1',
        name: 'Root Folder 1',
        parentId: 'c_0',
        clientData: {
          stringProp: 'O Brother',
          numberProp: 1
        },
        children: []
      },
      {
        id: 'c_0_f_2',
        name: 'Root Folder 2',
        parentId: 'c_0',
        children: [
          {
            id: 'c_0_f_2_0',
            name: 'Child Folder 2.0',
            parentId: 'c_0_f_2',
            children: []
          },
          {
            id: 'c_0_f_2_1',
            name: 'Child Folder 2.1',
            parentId: 'c_0_f_2',
            children: [
              {
                id: 'c_0_f_2_1_0',
                name: 'Child Folder 2.1.0',
                parentId: 'c_0_f_2_1',
                children: []
              }
            ]
          }
        ]
      },
      {
        id: 'c_0_f_3',
        name: 'Root Folder 3 (trashed)',
        parentId: 'c_0',
        trashed: true,
        children: [
          {
            id: 'c_0_f_3_0',
            name: 'Child Folder 3.0',
            parentId: 'c_0_f_3',
            children: []
          }
        ]
      }
    ]
  },
  {
    id: 'c_1',
    name: 'Channel One',
    parentId: null,
    clientData: {
      stringProp: 'O Brother',
      numberProp: 1
    },
    children: [
      {
        id: 'c_1_f_4',
        name: 'Test Folder (channel 1)',
        parentId: 'c_1',
        children: []
      }
    ]
  },
  {
    id: 'c_2',
    name: 'Channel Two (trashed)',
    parentId: null,
    trashed: true,
    children: [
      {
        id: 'c_2_f_5',
        name: 'Test Folder (channel 2)',
        parentId: 'c_2',
        children: []
      }
    ]
  },
  {
    id: 'c_3',
    name: 'Channel Three',
    parentId: null,
    children: [
      {
        id: 'c_3_f_6',
        name: 'Test Folder (channel 3)',
        parentId: 'c_3',
        children: []
      }
    ]
  }
];
