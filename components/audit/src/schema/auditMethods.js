/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
 'use strict';
 // @flow
 
 /**
  * JSON Schema specification of methods data for events.
  */
 
 const Action = require('api-server/src/schema/Action');
 const event = require('api-server/src/schema/event');
 const helpers = require('api-server/src/schema/helpers');
 const object = helpers.object;
 const array = helpers.array;
 const string = helpers.string;
 const number = helpers.number;
 const boolean = helpers.boolean;
 
 module.exports = {
   get: {
     params: object({
       'streams': {},
       'types': array(string()),
       'fromTime': number(),
       'toTime': number(),
       'sortAscending': boolean(),
       'skip': number(),
       'limit': number(),
       'modifiedSince': number(),
     }, { id: 'auditLogs.get' }),
     result: object({
       'auditLogs': array(event(Action.READ))
     }, {
       required: [ 'auditLogs' ]
     })
   },
 };
 