/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow
const chai = require('chai');
const nconf = require('nconf');
const assert = chai.assert;
const systemStreamsConfig = require('api-server/config/components/systemStreams');
const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const { getConfig } = require('@pryv/boiler');

describe('SystemStreams config', () => {
  let store;
  let customRootStreamId = 'myNewStream';

  after(async () => {
    const config = await getConfig();
    SystemStreamsSerializer.reloadSerializer(config);
  });

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
              id: 'field-withchildren',
              name: 'field-withchildren',
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
          [customRootStreamId]: [
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
      SystemStreamsSerializer.reloadSerializer(store);
    });
    
    it('[V9QB] New config does not override default one', async () => {
      const newConfig = store.get('systemStreams');
      let found = false;
      const account = newConfig.filter(s => s.id === ':_system:account')[0];
      const usernameStream = account.children.filter(s => s.id == SystemStreamsSerializer.options.STREAM_ID_USERNAME)[0];
      assert.deepEqual(usernameStream, {
        isIndexed: true,
        isUnique: true,
        isShown: true,
        isEditable: false,
        isRequiredInValidation: true,
        type: 'identifier/string',
        name: 'Username',
        id: SystemStreamsSerializer.options.STREAM_ID_USERNAME,
        parentId: SystemStreamsSerializer.addPrivatePrefixToStreamId('account'),
        children: [],
      });
    });
    it('[5T5S] Account config is merged correctly and New values are extended with default streams values', async () => {
      const config = store.get('systemStreams');
      const account = config.filter(s => s.id === ':_system:account')[0];
      assert.deepEqual(account,
        {
          id: SystemStreamsSerializer.addPrivatePrefixToStreamId('account'),
          name: SystemStreamsSerializer.addPrivatePrefixToStreamId('account'),
          isIndexed: false,
          isUnique: false,
          isShown: true,
          isEditable: false,
          isRequiredInValidation: false,
          parentId: null,
          children: [
            {
              isIndexed: true,
              isUnique: true,
              isShown: true,
              isEditable: false,
              isRequiredInValidation: true,
              type: 'identifier/string',
              name: 'Username',
              id: SystemStreamsSerializer.addPrivatePrefixToStreamId('username'),
              parentId: SystemStreamsSerializer.addPrivatePrefixToStreamId('account'),
              children: [],
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
              id: SystemStreamsSerializer.addPrivatePrefixToStreamId('language'),
              parentId: SystemStreamsSerializer.addPrivatePrefixToStreamId('account'),
              children: [],
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
              id: SystemStreamsSerializer.addPrivatePrefixToStreamId('appId'),
              parentId: SystemStreamsSerializer.addPrivatePrefixToStreamId('account'),
              children: [],
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
              id: SystemStreamsSerializer.addPrivatePrefixToStreamId('invitationToken'),
              parentId: SystemStreamsSerializer.addPrivatePrefixToStreamId('account'),
              children: [],
            },
            {
              isIndexed: false,
              isUnique: false,
              isShown: false,
              isEditable: false,
              isRequiredInValidation: false,
              type: 'password-hash/string',
              name: 'Password Hash',
              id: SystemStreamsSerializer.addPrivatePrefixToStreamId('passwordHash'),
              parentId: SystemStreamsSerializer.addPrivatePrefixToStreamId('account'),
              children: [],
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
              id: SystemStreamsSerializer.addPrivatePrefixToStreamId('referer'),
              parentId: SystemStreamsSerializer.addPrivatePrefixToStreamId('account'),
              children: [],
            },
            {
              id: SystemStreamsSerializer.addPrivatePrefixToStreamId('storageUsed'),
              parentId: SystemStreamsSerializer.addPrivatePrefixToStreamId('account'),
              name: 'Storage used',
              type: 'data-quantity/b',
              isRequiredInValidation: false,
              isIndexed: false,
              isUnique: false,
              isShown: true,
              isEditable: false,
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
                  id: SystemStreamsSerializer.addPrivatePrefixToStreamId('dbDocuments'),
                  parentId: SystemStreamsSerializer.addPrivatePrefixToStreamId('storageUsed'),
                  children: [],
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
                  id: SystemStreamsSerializer.addPrivatePrefixToStreamId('attachedFiles'),
                  parentId: SystemStreamsSerializer.addPrivatePrefixToStreamId('storageUsed'),
                  children: [],
                }
              ]
            },
            {
              isIndexed: false,
              isUnique: false,
              isShown: true,
              isEditable: false,
              isRequiredInValidation: false,
              id: SystemStreamsSerializer.addPrivatePrefixToStreamId('field1'),
              name: 'field1',
              type: 'string/pryv',
              parentId: SystemStreamsSerializer.addPrivatePrefixToStreamId('account'),
              children: [],
            },
            {
              isIndexed: false,
              isUnique: false,
              isShown: true,
              isEditable: false,
              isRequiredInValidation: false,
              id: SystemStreamsSerializer.addPrivatePrefixToStreamId('field-withchildren'),
              name: 'field-withchildren',
              type: 'smth/string',
              parentId: SystemStreamsSerializer.addPrivatePrefixToStreamId('account'),
              children: [],
              children: [
                {
                  isIndexed: false,
                  isUnique: false,
                  isShown: true,
                  isEditable: false,
                  isRequiredInValidation: false,
                  id: SystemStreamsSerializer.addPrivatePrefixToStreamId('child-one'),
                  name: 'child-one',
                  type: 'string/pryv',
                  parentId: SystemStreamsSerializer.addPrivatePrefixToStreamId('field-withchildren'),
                  children: [],
                },
                {
                  isIndexed: false,
                  isUnique: false,
                  isShown: true,
                  isEditable: false,
                  isRequiredInValidation: false,
                  id: SystemStreamsSerializer.addPrivatePrefixToStreamId('child-two'),
                  name: 'child-two',
                  type: 'string/pryv',
                  parentId: SystemStreamsSerializer.addPrivatePrefixToStreamId('field-withchildren'),
                  children: [],
                }
              ]
            }
          ]
        });
    });
    it('[ARD9] New systemStreams config is merged correctly', async () => {
      const config = store.get('systemStreams');

      const myNewStream = config.filter(s => s.id === ':_system:myNewStream');
      const idWithPrefix = SystemStreamsSerializer.addPrivatePrefixToStreamId(customRootStreamId); 
      assert.deepEqual(myNewStream, [
        {
          id: idWithPrefix,
          name: idWithPrefix,
          isIndexed: false,
          isUnique: false,
          isShown: true,
          isEditable: false,
          isRequiredInValidation: false,
          parentId: null,
          children: [
            {
              isIndexed: false,
              isUnique: false,
              isShown: true,
              isEditable: false,
              isRequiredInValidation: false,
              id: SystemStreamsSerializer.addPrivatePrefixToStreamId('field1'),
              name: 'field1',
              type: 'string/pryv',
              children: [],
              parentId: idWithPrefix,
            },
            {
              isIndexed: false,
              isUnique: false,
              isShown: true,
              isEditable: false,
              isRequiredInValidation: false,
              id: SystemStreamsSerializer.addPrivatePrefixToStreamId('field2'),
              name: 'field2',
              type: 'string/pryv',
              children: [],
              parentId: idWithPrefix,
            }
          ]
        }
        
      ]);
    });
  });

  describe('when providing a custom system stream that is unique but not indexed', () => {
    before(async () => {
      
      store = new nconf.Provider();
      store.use('memory');
      store.set('custom:systemStreams',
        {
          account: [
            {
              id: 'faulty-params',
              type: 'string/pryv',
              isIndexed: false,
              isUnique: true,
            },
          ],
        });
    });

    it('[42A1] must throw an error if a custom system stream is unique but not indexed', async () => {
      try {
        systemStreamsConfig.load(store);
        assert.fail('supposed to throw.');
      } catch (err) {
        assert.exists(err);
        assert.include(err.message, 'Config error: custom system stream cannot be unique and not indexed. Stream: ');
      }
      
    });
  });
});
