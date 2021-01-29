/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const helpers = require('api-server/src/schema/helpers');
const string = helpers.string;
const boolean = helpers.boolean;
const array = helpers.array;

module.exports = {
  id: 'systemStreamsSchema',
  type: 'object',
  additionalProperties: true,
  properties: {
    id: string({ minLength: 2 }),
    name: string({ minLength: 2 }),
    isIndexed: boolean({ nullable: false }),
    isUnique: boolean({ nullable: false }),
    isShown: boolean({ nullable: false }),
    isEditable: boolean({ nullable: false }),
    isRequiredInValidation: boolean({ nullable: false }),
    type: string({ minLength: 2 }),
    parentId: string({ minLength: 2, nullable: true }),
    default: {},
    children: array({'$ref': 'systemStreamsSchema'}, {nullable: true}),
  },
  required: [ 'id', 'type' ]
};