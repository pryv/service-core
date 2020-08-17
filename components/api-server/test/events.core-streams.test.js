/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// TODO IEVA - maybe all this config should be added to some root test config
// to clean the test itself
const express = require("express");
const bodyParser = require("body-parser");
const storage = require('components/storage');
const assert = require("chai").assert;
const { describe, before, it, after } = require("mocha");
const supertest = require("supertest");
const charlatan = require("charlatan");
const Settings = require("components/api-server/src/settings");
const Application = require("components/api-server/src/application");
const expressAppInit = require("components/api-server/src/expressApp");
const loadCommonMeta = require("components/api-server/src/methods/helpers/setCommonMeta")
  .loadSettings;
const Notifications = require('components/api-server/src/Notifications');
  
const errorsMiddlewareMod = require("components/api-server/src/middleware/errors");
const utils = require("./../../utils");

const { databaseFixture } = require('components/test-helpers');
const { produceMongoConnection, context } = require('./test-helpers');
const helpers = require('./helpers');

let app;
let registerBody;
let request;
let res;

describe("Events of core-streams", function () {
  let mongoFixtures;
  before(async function () {
    mongoFixtures = databaseFixture(await produceMongoConnection());
  });
  let basePath;

  before(async function () {
    let user = await mongoFixtures.user(charlatan.Lorem.characters(7), {});
    basePath = '/' + user.attrs.username + '/events';
    const settings = await Settings.load();

    app = new Application(settings);
    await app.initiate();
    app.lifecycle.appStartupComplete(); 

    app.dependencies.resolve(
      require("./../src/methods/events")
    );

    require("./../src/routes/events")(expressApp, app);

    request = supertest(app.expressApp);
  });
  describe('POST /events', async () => {
    it('[ED75] When creating an even with non editable core stream id', async () => {
      it('[6CE0] Should return a 400 error', async () => {

      });
      it('[90E6] Should return the correct error', async () => {
      });
    });

    it('When creating an even with editable core stream id', async () => {
      it('[7CD9] When saving not indexed and not unique event', async () => {
        it('[F308] Should return 200', async () => {
        });
        it('[9C2D] Should return the created event', async () => {
        });
        it('[A9DC] New event gets streamId ‘active’ and ‘active’ stream property is removed from all other events from the same stream ', async () => {
        });
      });
      it('[4EB9] When event belongs to the unique core stream', async () => {
        it('[2FA2] When creating an event that is valid', async () => {
          it('[7A76] Should return 200', async () => {
          });
          it('[5831] Should return the created event', async () => {
          });
          it('[78FE] Unique streamId and event properties enforcing uniqueness are appended', async () => {
          });
          it('[DA23] New event gets streamId ‘active’ and ‘active’ stream property is removed from all other events from the same stream ', async () => {
          });
          it('[D316] New event data is sent to service-register', async () => {
          });
        });
        it('[7464] When creating an event that is already taken in service-register', async () => {
          it('[89BC] Should return a 400 error', async () => {
          });
          it('[89BC] Should return the correct error', async () => {
          });
        });
        it('[6B8D] WWhen creating an event that is already taken only on core', async () => {
          it('[2021] Should return a 400 error', async () => {
          });
          it('[121E] Should return the correct error', async () => {
          });
        });
        describe('When event belongs to the indexed core stream', async () => {
          it('[6070] When creating an event that is valid', async () => {
            it('[8C80] Should return 200', async () => {
            });
            it('[67F7] Should return the created event', async () => {
            });
            it('[467D] New event gets streamId ‘active’ and ‘active’ stream property is removed from all other events from the same stream', async () => {
            });
            it('[199D] New event data is sent to service-register', async () => {
            });
          });
        });
      });
    });

    describe('When updating editable streams streamId', async () => {
      it('[5E58] When adding the “active” streamId', async () => {
        it('[ADA3] Should return a 200', async () => {
        });
        it('[0027] Should return the updated event', async () => {
        });
        it('[82C3] events of the same streams should be stripped from “active” streamId.', async () => {
        });
      });
    });
  });

  describe('PUT /events/<id>', async () => {
    it('[D1FD] When updating non editable streams', async () => {
      it('[034D] Should return a 400 error', async () => {
      });
      it('[BB5F] Should return the correct error', async () => {
      });
    });

    it('When updating editable streams', async () => {
      it('[2FA2] Should return 200', async () => {
      });
      it('[763A] Should return the updated event', async () => {
      });
    });

    describe('When updating editable streams streamId', async () => {
      it('[BAE1] When adding the “active” streamId', async () => {
        it('[562A] Should return a 200', async () => {
        });
        it('[5622] Should return the updated event', async () => {
        });
        it('[CF70] events of the same streams should be stripped from “active” streamId.', async () => {
        });
      });
      it('[6AAD] When adding the “active” streamId for a unique stream', async () => {
        it('[6AAT] Should send a request to service-register to update its user main information', async () => {
        });
      });
      it('[CE66] When adding the “active” streamId for a unique stream', async () => {
        it('[0D18] Should send a request to service-register to update its user main information', async () => {
        });
      });
      it('[EEE9] When trying to add second core steamId to the event that has a core stream Id', async () => {
        it('[9004] Should return a 400 error', async () => {
        });
        it('[E3AE] Should return the correct error', async () => {
        });
      });
    });
    describe('When updating an unique field that is already taken', async () => {
      it('[1127] When the field is not unique in service register', async () => {
        it('[5A04] Should send a request to service-register to update the unique field', async () => {
        });
        it('[F8A8] Should return a 400 as it is already taken in service-register', async () => {
        });
      });
      it('[0FDB] When the field is not unique in mongodb', async () => {
        it('[5782] Should return a 400 error', async () => {
        });
        it('[B285] Should return the correct error', async () => {
        });
      });
    });
    describe('When updating a unique field that is valid', async () => {
      it('[290B] Should send a request to service-register to update the unique field', async () => {
      });
      it('[4BB1] Should return a 200', async () => {
      });
      it('[C457] Should save an additional field to enforce uniqueness in mongodb', async () => {
      });
    });
    describe('When updating an indexed field that is valid', async () => {
      describe('When service-register working as expected', async () => {
        it('[ED88] Should send a request to service-register to update the indexed field', async () => {
        });
        it('[B23F] Should return a 200', async () => {
        });
      });
      describe('When service-register is out', async () => {
        it('[645C] Should send a request to service-register to update the indexed field', async () => {

        });
        it('[AA92] Should return a 400', async () => {

        });
      });
    });
  });

  describe('DELETE /events/<id>', async () => {
    it('[] When deleting editable core-streams event', async () => {
      it('[] Event has no ‘active’ streamId', async () => {
        it('[] Event belongs to the unique stream', async () => { 
          it('[] Should return a 200', async () => { });
          it('[] Should return a deleted event', async () => { });
          it('[] Should notify service-register and update only unique property', async () => { });
        });
        it('[] Event belongs to the indexed stream', async () => { 
          it('[] Should return a 200', async () => { });
          it('[] Should return a deleted event', async () => { });
        });
      });
      it('[] Event has ‘active’ streamId', async () => {
        it('[] Should return a 400', async () => { });
        it('[] Should return the correct error', async () => { });
      });
    });
    it('[] When deleting not editable core-streams event', async () => {
      it('[] Should return a 400', async () => { });
      it('[] Should return the correct error', async () => { });
    });
  });
});