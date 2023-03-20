/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const ds = require('@pryv/datastore');
const audit = require('audit');

/**
 * Children id: `access-{accessId}`
 */
const accessesStream = {
  id: 'accesses',
  name: 'Accesses',
  parentId: null,
  children: [],
  childrenHidden: true
};
/**
 * Children id: `action-{actionId}`
 */
const actionsStream = {
  id: 'actions',
  name: 'Actions',
  parentId: null,
  children: [],
  childrenHidden: true
};

const auditStreams = [accessesStream, actionsStream];

module.exports = ds.createUserStreams({
  async get (userId, query) {
    if (query.parentId === '*' || query.parentId == null) {
      return auditStreams;
    }
    const parent = await this.getOne(userId, query.parentId, query);
    if (parent == null) return [];
    return parent.children;
  },

  async getOne (userId, streamId, query) {
    // list accesses
    if (streamId === accessesStream.id) {
      const userStorage = await audit.storage.forUser(userId);
      const accesses = userStorage.getAllAccesses();
      if (accesses == null) return null;
      const res = accesses.map((access) => {
        return {
          id: access.term,
          name: access.term,
          children: [],
          parentId: accessesStream.id
        };
      });
      return Object.assign({}, accessesStream, {
        children: res,
        childrenHidden: false
      });
    }

    // list actions
    if (streamId === actionsStream.id) {
      const userStorage = await audit.storage.forUser(userId);
      const actions = userStorage.getAllActions();
      if (actions == null) return null;
      const res = actions.map((action) => {
        return {
          id: action.term,
          name: action.term,
          children: [],
          parentId: actionsStream.id
        };
      });
      return Object.assign({}, actionsStream, {
        children: res,
        childrenHidden: false
      });
    }

    if (streamId) {
      let parentId = null;
      if (streamId.startsWith('access-')) {
        parentId = accessesStream.id;
      } else if (streamId.startsWith('action-')) {
        parentId = actionsStream.id;
      }
      // here check that this access or action stream exists
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
