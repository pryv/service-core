/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const assert = require('chai').assert;
const { describe, before, it, after } = require('mocha');
const supertest = require('supertest');
const charlatan = require('charlatan');
const Settings = require('../src/settings');
const Application = require('../src/application');

let app;
let registerBody;
let request;
let res;

describe('registration: single-node', function () {
  before(async function () {
    const settings = await Settings.load();
    
    app = new Application(settings);
    await app.initiate();
    
    require('../src/methods/auth/register-singlenode')(
      app.api, 
      app.logging, 
      app.storageLayer, 
      app.settings.get('services').obj(), 
      app.settings.get('server').obj(), 
    );

    request = supertest(app.expressApp);

    registerBody = {
      username: charlatan.Lorem.characters(7),
      password: charlatan.Lorem.characters(7),
      email: charlatan.Internet.email(),
      appId: charlatan.Lorem.characters(7),
    };
  });
  describe('when given valid input', function () {
    before(async function () {
      res = await request.post('/users').send(registerBody);
        });
    it('should respond with status 201', function () {
      assert.equal(res.status, 201);
    });
    it('should respond with a username and apiEndpoint (TODO) in the request body', function () {
      assert.equal(res.body.username, registerBody.username);
      //assert.equal(res.body.apiEndpoint, registerBody);
    });
    it('should store all the fields', function () {
      
    });
  });
  describe('Schema validation', function () {
    describe(
      'when given an invalid username parameter',
      testInvalidParameterValidation('username', {
        minLength: 5,
        maxLength: 23,
        lettersAndDashesOnly: true,
        type: 'string',
      })
    );
    describe(
      'when given an invalid password parameter',
      testInvalidParameterValidation('password', {
        minLength: 4,
        maxLength: 100,
        type: 'string',
      })
    );
    describe(
      'when given an invalid email parameter',
      testInvalidParameterValidation('email', {
        maxLength: 300,
        type: 'string',
      })
    );
    describe(
      'when given an invalid appId parameter',
      testInvalidParameterValidation('appId', {
        minLength: 6,
        maxLength: 99,
        type: 'string',
      })
    );
    describe(
      'when given an invalid invitationToken parameter',
      testInvalidParameterValidation('invitationToken', {
        type: 'string',
      })
    );
    describe(
      'when given an invalid referer parameter',
      testInvalidParameterValidation('referer', {
        minLength: 1,
        maxLength: 99,
        type: 'string',
      })
    );
    describe(
      'when given an invalid languageCode parameter',
      testInvalidParameterValidation('languageCode', {
        minLength: 1,
        maxLength: 5,
        type: 'string',
      })
    );
  });
  describe('Property values uniqueness',function() {
    describe('username property', function() {
      before(async function () {
        await app.database.deleteMany({name: 'events'});

        res = await request.post('/users').send(registerBody);
        assert.equal(res.status, 201);
        res = await request.post('/users').send(registerBody);
      });
      it('should respond with status 400', function() {
        assert.equal(res.status, 400);
      });
      it('should respond with the correct error message', function() {
        assert.exists(res.error);
        assert.exists(res.error.text);
        const error = JSON.parse(res.error.text);
        assert.include(error.error.data[0].param, '');
      });
      it('should not store the user in the database twice', async function() {
        const users = await app.storageLayer.events.findAllUsers();
        assert.equal(users.length, 1);
        assert.equal(users[0].username, registerBody.username);
      });
    });
    }
  );
});

function verifyInvalidInputResponse(
  registerBodyModification,
  expectedErrorParam
) {
  return () => {
    before(async function () {
      const invalidRegisterBody = Object.assign(
        {},
        registerBody,
        registerBodyModification
      );
      res = await request.post('/users').send(invalidRegisterBody);
    });
    it('should respond with status 400', function () {
      assert.equal(res.status, 400);
    });
    it('should respond with the correct error message', function () {
      assert.exists(res.error);
      assert.exists(res.error.text);
      const error = JSON.parse(res.error.text);
      assert.include(error.error.data[0].param, expectedErrorParam);
    });
  };
}

function testInvalidParameterValidation(parameterName, constraints) {
  return () => {
    if (constraints.minLength) {
      describe(
        'that is too short',
        verifyInvalidInputResponse(
          {
            [parameterName]: charlatan.Lorem.characters(
              constraints.minLength - 1
            ),
          },
          parameterName
        )
      );
    }
    if (constraints.maxLength) {
      describe(
        'that is too long',
        verifyInvalidInputResponse(
          {
            [parameterName]: charlatan.Lorem.characters(
              constraints.maxLength + 1
            ),
          },
          parameterName
        )
      );
    }
    if (constraints.lettersAndDashesOnly) {
      describe(
        'that has invalid characters',
        verifyInvalidInputResponse(
          {
            [parameterName]: '/#+]\\\'',
          },
          parameterName
        )
      );
    }
    if (constraints.type) {
      let val;
      if (constraints.type === 'string') {
        val = true;
      }
      if (val) {
        describe(
          'that has an invalid type',
          verifyInvalidInputResponse(
            {
              [parameterName]: val,
            },
            parameterName
          )
        );
      }
    }
    describe(
      'that is null',
      verifyInvalidInputResponse(
        {
          [parameterName]: null,
        },
        parameterName,
      )
    );
  };
}
