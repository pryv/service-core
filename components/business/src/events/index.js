/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
//@flow

export type StreamQuery = {
  any: Array<string>,
  all?: Array<string>,
  not?: Array<string>,
};

export type StreamQueryWithStoreId = StreamQuery & {
  storeId: string,
};

module.exports = {
  Attachment: require('./Attachment'),
  Event: require('./Event'),
}