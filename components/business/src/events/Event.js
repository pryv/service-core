// @flow

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
}

class Attachment {

}