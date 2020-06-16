/**
 * JSON Schema specification of methods data for followed slices.
 */

const _ = require('lodash');
const Action = require('./Action');
const followedSlice = require('./followedSlice');
const itemDeletion = require('./itemDeletion');
const { object } = require('./helpers');
const { array } = require('./helpers');
const { string } = require('./helpers');

module.exports = {

  get: {
    params: object({}, { id: 'followedSlices.get' }),
    result: object({
      followedSlices: array(followedSlice(Action.READ)),
    }, {
      required: ['followedSlices'],
    }),
  },

  create: {
    params: _.extend(followedSlice(Action.CREATE)),
    result: object({
      followedSlice: _.extend(followedSlice(Action.READ)),
    }, {
      required: ['followedSlice'],
    }),
  },

  update: {
    params: object({
      // in path for HTTP requests
      id: string(),
      // = body of HTTP requests
      update: _.extend(followedSlice(Action.UPDATE)),
    }, {
      id: 'followedSlices.update',
      required: ['id', 'update'],
    }),
    result: object({
      followedSlice: _.extend(followedSlice(Action.READ)),
    }, {
      required: ['followedSlice'],
    }),
  },

  del: {
    params: object({
      // in path for HTTP requests
      id: string(),
    }, {
      id: 'followedSlices.delete',
      required: ['id'],
    }),
    result: object({ followedSliceDeletion: itemDeletion }, {
      required: ['followedSliceDeletion'],
      additionalProperties: false,
    }),
  },

};
