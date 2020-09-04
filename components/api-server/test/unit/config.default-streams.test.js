/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow
const chai = require('chai');
const nconf = require('nconf');
const assert = chai.assert;
const systemStreamsConfig = require('components/api-server/config/components/systemStreams');
const SystemStreamsSerializer = require('components/business/src/system-streams/serializer');

describe('SystemStreams config', () => {
  let store;
  describe('When nested custom systemStreams are provided in the config for the account steam', () => {
    before(async () => {
      
      store = new nconf.Provider();
      store.use('memory');
      store.set('custom:systemStreams',
        {
          account: [
            {
              id: 'field1',
              type: 'string/pryv',
            },
            {
              id: 'username',
              isEditable: false,
              isShown: false,
              type: 'string/pryv'
            },
            {
              id: 'field-withchildern',
              name: 'field-withchildern',
              type: 'smth/string',
              children: [
                {
                  id: 'child-one',
                  isShown: true,
                  type: 'string/pryv',
                },
                {
                  id: 'child-two',
                  isShown: true,
                  type: 'string/pryv',
                },
              ]
            }
          ],
          myNewStream: [
            {
              id: 'field1',
              type: 'string/pryv',
            },
            {
              id: 'field2',
              type: 'string/pryv',
              isEditable: false,
              isShown: true
            },
          ]
        });
      systemStreamsConfig.load(store);
    });
    it('[V9QB] New config does not override default one', async () => {
      const newConfig = store.get('systemStreams:account');
      let found = false;
      newConfig.forEach(stream => {
        if (stream.id == SystemStreamsSerializer.options.STREAM_ID_USERNAME) {
          assert.deepEqual(stream, {
            isIndexed: true,
            isUnique: true,
            isShown: true,
            isEditable: false,
            isRequiredInValidation: true,
            type: 'identifier/string',
            name: 'Username',
            id: SystemStreamsSerializer.options.STREAM_ID_USERNAME
          });
          found = true;
        }
      });
      assert.isTrue(found);
    });
    it('[5T5S] Account config is merged correctly and New values are extended with default streams values', async () => {
      const newConfig = store.get('systemStreams:account');
      assert.deepEqual(newConfig, [
        {
          isIndexed: true,
          isUnique: true,
          isShown: true,
          isEditable: false,
          isRequiredInValidation: true,
          type: 'identifier/string',
          name: 'Username',
          id: '.username'
        },
        {
          isIndexed: true,
          isUnique: false,
          isShown: true,
          isEditable: true,
          isRequiredInValidation: false,
          default: 'en',
          type: 'language/iso-639-1',
          name: 'Language',
          id: '.language'
        },
        {
          isIndexed: true,
          isUnique: false,
          isShown: false,
          isEditable: false,
          isRequiredInValidation: true,
          type: 'identifier/string',
          name: 'appId',
          default: '',
          id: '.appId'
        },
        {
          isIndexed: true,
          isUnique: false,
          isShown: false,
          isEditable: false,
          isRequiredInValidation: false,
          default: 'no-token',
          type: 'token/string',
          name: 'Invitation Token',
          id: '.invitationToken'
        },
        {
          isIndexed: false,
          isUnique: false,
          isShown: false,
          isEditable: false,
          isRequiredInValidation: false,
          type: 'password-hash/string',
          name: 'Password Hash',
          id: '.passwordHash'
        },
        {
          isIndexed: true,
          isUnique: false,
          isShown: false,
          isEditable: false,
          isRequiredInValidation: false,
          default: null,
          type: 'identifier/string',
          name: 'Referer',
          id: '.referer'
        },
        {
          id: '.storageUsed',
          isShown: true,
          name: 'Storage used',
          type: 'data-quantity/b',
          children: [
            {
              isIndexed: false,
              isUnique: false,
              isShown: true,
              isEditable: false,
              isRequiredInValidation: false,
              default: 0,
              type: 'data-quantity/b',
              name: 'Db Documents',
              id: '.dbDocuments'
            },
            {
              isIndexed: false,
              isUnique: false,
              isShown: true,
              isEditable: false,
              isRequiredInValidation: false,
              default: 0,
              type: 'data-quantity/b',
              name: 'Attached files',
              id: '.attachedFiles'
            }
          ]
        },
        {
          isIndexed: false,
          isUnique: false,
          isShown: false,
          isEditable: false,
          isRequiredInValidation: false,
          id: '.field1',
          name: 'field1',
          type: 'string/pryv'
        },
        {
          isIndexed: false,
          isUnique: false,
          isShown: false,
          isEditable: false,
          isRequiredInValidation: false,
          id: '.field-withchildern',
          name: 'field-withchildern',
          type: 'smth/string',
          children: [
            {
              isIndexed: false,
              isUnique: false,
              isShown: true,
              isEditable: false,
              isRequiredInValidation: false,
              id: '.child-one',
              name: 'child-one',
              type: 'string/pryv'
            },
            {
              isIndexed: false,
              isUnique: false,
              isShown: true,
              isEditable: false,
              isRequiredInValidation: false,
              id: '.child-two',
              name: 'child-two',
              type: 'string/pryv'
            }
          ]
        } 
      ]);
    });
    it('[ARD9] New systemStreams config is merged correctly', async () => {
      const newConfig = store.get('systemStreams:myNewStream');
      assert.deepEqual(newConfig, [
        {
          isIndexed: false,
          isUnique: false,
          isShown: false,
          isEditable: false,
          isRequiredInValidation: false,
          id: '.field1',
          name: 'field1',
          type: 'string/pryv'
        },
        {
          isIndexed: false,
          isUnique: false,
          isShown: true,
          isEditable: false,
          isRequiredInValidation: false,
          id: '.field2',
          name: 'field2',
          type: 'string/pryv'
        }
      ]);
    });
  });
});
