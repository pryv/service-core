/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
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

const streams = [
  {
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

module.exports = ds.createUserStreams({

  async get (userId, query) {
    const parentId = query.parentId || '*';
    if (parentId === '*' || parentId == null) return streams;
    const foundStream = await this.getOne(userId, parentId, query);
    if (foundStream == null) return [];
    return foundStream.children;
  },

  async getOne (userId, streamId, query) {
    // list accesses
    if (streamId === 'accesses') {
      const userStorage = await audit.storage.forUser(userId);
      const accesses = userStorage.getAllAccesses();
      if (accesses == null) return null;
      const res = accesses.map((access) => {
        return {
          id: access.term,
          name: access.term,
          children: [],
          parentId: 'accesses'
        };
      });
      return {
        id: 'accesses',
        name: 'Accesses',
        parentId: null,
        children: res
      };
    }

    // list actions
    if (streamId === 'actions') {
      const userStorage = await audit.storage.forUser(userId);
      const actions = userStorage.getAllActions();
      if (actions == null) return null;
      const res = actions.map((action) => {
        return {
          id: action.term,
          name: action.term,
          children: [],
          parentId: 'actions'
        };
      });
      return {
        id: 'actions',
        name: 'Actions',
        parentId: null,
        children: res
      };
    }

    if (streamId) {
      let parentId = null;
      if (streamId.startsWith('access-')) {
        parentId = 'accesses';
      } else if (streamId.startsWith('action-')) {
        parentId = 'actions';
      }
      // here check that this action or streams exists
      return {
        id: streamId,
        name: streamId,
        parentId,
        children: [],
        trashed: false
      };
    }

    return null;
  }
});
