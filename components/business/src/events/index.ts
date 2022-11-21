/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
export type StreamQuery = {
  any: Array<string>;
  all?: Array<string>;
  not?: Array<string>;
};

export type StreamQueryWithStoreId = StreamQuery & {
  storeId: string;
};

export type Attachment = {
  id: string;
  fileName: string;
  type: string;
  size: number;
  readToken: string;
  integrity: string;
};

export type Event = {
  id: string;
  streamIds: Array<string>;
  streamId: string | undefined | null; // deprecated
  type: string;
  time: number;
  duration: number | undefined | null;
  content: any;
  tags: Array<string> | undefined | null; // deprecated
  description: string | undefined | null;
  attachments: Array<Attachment>;
  clientData: {};
  trashed: boolean | undefined | null;
  created: number;
  createdBy: string;
  modified: number;
  modifiedBy: string;
};
