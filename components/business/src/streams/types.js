// @flow

type Action = 'read' | 'create' | 'update' | 'delete';
type ActionSet = {
  events?: Array<Action>,
  streams?: Array<Action>
};


export type { Action, ActionSet };