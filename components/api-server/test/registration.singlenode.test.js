/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const express = require("express");
const bodyParser = require("body-parser");
const storage = require('components/storage');
const assert = require("chai").assert;
const { describe, before, it, after } = require("mocha");
const supertest = require("supertest");
const charlatan = require("charlatan");
const Settings = require("./../src/settings");
const Application = require("./../src/application");
const expressAppInit = require("./../src/expressApp");
const loadCommonMeta = require("./../src/methods/helpers/setCommonMeta")
  .loadSettings;
const errorsMiddlewareMod = require("./../src/middleware/errors");
const utils = require("./../../utils");

let database;
let storageLayer;
let registerBody;
let request;
let res;

describe("Singlenode registration", function () {
  before(async function () {
    const expressApp = express();
    expressApp.use(
      bodyParser.json({
        limit: "10mb",
      })
    );
    expressApp.use(
      bodyParser.urlencoded({
        extended: false,
      })
    );

    const settings = await Settings.load();

    const app = new Application(settings);

    database = new storage.Database(
      settings.get('database').obj(), 
      app.logFactory('database'));

    storageLayer = new storage.StorageLayer(database, 
      app.logFactory('model'),
      settings.get('eventFiles.attachmentsDirPath').str(), 
      settings.get('eventFiles.previewsDirPath').str(), 
      settings.get('auth.passwordResetRequestMaxAge').num(), 
      settings.get('auth.sessionMaxAge').num(), 
      settings.get('systemStreams.account').obj(), 
    );

    app.dependencies.register({ expressApp: expressApp });
    app.dependencies.resolve(
      require("./../src/methods/auth/register-singlenode")
    );

    require("./../src/routes/auth/register")(expressApp, app);

    expressApp.use(
      errorsMiddlewareMod(utils.logging(settings.get("logs").obj()))
    );

    request = supertest(expressApp);

    registerBody = {
      username: charlatan.Lorem.characters(7),
      password: charlatan.Lorem.characters(7),
      email: charlatan.Internet.email(),
      appId: charlatan.Lorem.characters(7),
    };
  });
  describe("when given valid input", function () {
    before(async function () {
      res = await request.post("/user").send(registerBody);
    });
    it("should respond with 201", function () {
      assert.equal(res.status, 201);
    });
    it("should respond with username in body", function () {
      assert.equal(res.body.username, registerBody.username);
    });
  });
  describe("Schema validation", function () {
    describe(
      "username parameter",
      testInvalidParameterValidation("username", {
        minLength: 5,
        maxLength: 23,
        lettersAndDashesOnly: true,
        type: "string",
      })
    );
    describe(
      "password parameter",
      testInvalidParameterValidation("password", {
        minLength: 4,
        maxLength: 100,
        type: "string",
      })
    );
    describe(
      "email parameter",
      testInvalidParameterValidation("email", {
        maxLength: 300,
        type: "string",
      })
    );
    describe(
      "appId parameter",
      testInvalidParameterValidation("appId", {
        minLength: 6,
        maxLength: 99,
        type: "string",
      })
    );
    describe(
      "invitationtoken parameter",
      testInvalidParameterValidation("invitationtoken", {
        type: "string",
      })
    );
    describe(
      "referer parameter",
      testInvalidParameterValidation("referer", {
        minLength: 1,
        maxLength: 99,
        type: "string",
      })
    );
    describe(
      "languageCode parameter",
      testInvalidParameterValidation("languageCode", {
        minLength: 1,
        maxLength: 5,
        type: "string",
      })
    );
  });
  describe(
    "Property values uniqueness",
    function() {
      describe('username property', function() {
        before(async function () {
          await database.deleteMany({name: 'events'});

          res = await request.post("/user").send(registerBody);
          assert.equal(res.status, 201);
          res = await request.post("/user").send(registerBody);
        });
        it('should respond with 400', function() {
          assert.equal(res.status, 400);
        });
        it('should respond with error message', function() {
          assert.exists(res.error);
          assert.exists(res.error.text);
          const error = JSON.parse(res.error.text);
          assert.include(error.error.data[0].param, '');
        });
        it('should not store 2nd user in database', async function() {
          const users = await storageLayer.events.findAllUsers();
          assert.equal(users.length, 1);
          assert.equal(users[0].username, registerBody.username);
        });
      })
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
      res = await request.post("/user").send(invalidRegisterBody);
    });
    it("should respond with 400", function () {
      assert.equal(res.status, 400);
    });
    it("should respond with error message", function () {
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
        "when given too short value",
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
        "when given too long value",
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
        "when given value with invalid signs",
        verifyInvalidInputResponse(
          {
            [parameterName]: "/#+]\\'",
          },
          parameterName
        )
      );
    }
    if (constraints.type) {
      let val;
      if (constraints.type === "string") {
        val = true;
      }
      if (val) {
        describe(
          "when given value of invalid type",
          verifyInvalidInputResponse(
            {
              [parameterName]: val,
            },
            parameterName
          )
        );
      }
    }
  };
}
