/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const Attachment = require('./Attachment');

class Event {

  id: string;
  streamIds: Array<string>;
  streamId: ?string; // deprecated
  type: string;
  time: number;
  duration: ?number;
  content: any;
  tags: ?Array<string>; // deprecated
  description: ?string;
  attachments: Array<Attachment>;
  clientData: {};
  trashed: ?boolean;
  created: number;
  createdBy: string;
  modified: number;
  modifiedBy: string;

  constructor(params: {}) {
    for (const [key, value] of Object.entries(params)) {
      this[key] = value;
    }
  }
}



module.exports = Event;