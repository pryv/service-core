/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const ds = require('@pryv/datastore');
const audit = require('audit');

/**
 *
 * Stream structure
 * accesses:
 *    access-{accessid}
 *
 * actions:
 *    action-{actionId}
 *
 */

module.exports = ds.createUserStreams({
  async get (userId, params) {
    // -- List root streams (accesses & actions)
    if (params.id === '*') {
      return [{
        id: 'accesses',
        name: 'Accesses',
        parentId: null,
        children: [],
        childrenHidden: true
      }, {
        id: 'actions',
        name: 'Actions',
        parentId: null,
        children: [],
        childrenHidden: true
      }];
    }

    // list accesses
    if (params.id === 'accesses') {
      const userStorage = await audit.storage.forUser(userId);
      const accesses = userStorage.getAllAccesses();
      if (accesses == null) return [];
      const res = accesses.map((access) => {
        return {
          id: access.term,
          name: access.term,
          children: [],
          parentId: 'accesses'
        };
      });
      return [{
        id: 'accesses',
        name: 'Accesses',
        parentId: null,
        children: res
      }];
    }

    // list actions
    if (params.id === 'actions') {
      const userStorage = await audit.storage.forUser(userId);
      const actions = userStorage.getAllActions();
      if (actions == null) return [];
      const res = actions.map((action) => {
        return {
          id: action.term,
          name: action.term,
          children: [],
          parentId: 'actions'
        };
      });
      return [{
        id: 'actions',
        name: 'Actions',
        parentId: null,
        children: res
      }];
    }

    if (params.id) {
      let parentId = null;
      if (params.id.startsWith('access-')) {
        parentId = 'accesses';
      } else if (params.id.startsWith('action-')) {
        parentId = 'actions';
      }
      // here check that this action or streams exists
      return [{
        id: params.id,
        name: params.id,
        parentId,
        children: [],
        trashed: false
      }];
    }

    return [];
  }
});
