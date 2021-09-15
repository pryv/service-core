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