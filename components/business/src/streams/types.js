// @flow

type Action =
  | 'read'
  | 'create'
  | 'update'
  | 'delete'
  | '!read'
  | '!create'
  | '!update'
  | '!delete';

type ActionSet = {
  events?: Array<Action>,
  streams?: Array<Action>
};

const Actions = {
  READ: 'read',
  NONREAD: '!read',
  CREATE: 'create',
  NONCREATE: '!create',
  UPDATE: 'update',
  NONUPDATE: '!update',
  DELETE: 'delete',
  NONDELETE: '!delete',
};

module.exports.Actions = Actions;

export type { Action, ActionSet };