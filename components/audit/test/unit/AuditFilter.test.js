/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */


describe('AuditFilter', () => {

  function buildFilter(include = ['all'], exclude = []) {
    return {
      methods: {
        include,
        exclude,
      },
    };
  }
  describe('validation', () => {
    it('[3QJJ] must accept an existing method', () => {
      const method = 'events.get';
      assert.isTrue(apiMethods.AUDITED_METHODS_MAP[method]);
      try {
        validation.filter(buildFilter([method]));  
      } catch (e) {assert.isNull(e);}
    });
    it('[YIDZ] must accept a valid method aggregator', () => {
      const method = 'events.all';
      const parts = method.split('.');
      let found = false;
      assert.isAbove(apiMethods.AUDITED_METHODS.filter(m => m.startsWith(parts[0])).length, 0);
      try {
        validation.filter(buildFilter([method]));  
      } catch (e) {assert.isNull(e);}
    });
    it('[74RS] must accept "all"', () => {
      const method = 'all';
      try {
        validation.filter(buildFilter([method]));  
      } catch (e) {assert.isNull(e);}
    });
    it('[P6WW] must throw an error when providing a malformed filter', () => {
      try { validation.filter({notMethods: { include: [], exclude: [] }}); assert.fail('must throw') } catch(e) {};
      try { validation.filter({methods: { somethign: [], exclude: [] }}); assert.fail('must throw') } catch(e) {};
      try { validation.filter({methods: { include: [12], exclude: [] }}); assert.fail('must throw') } catch(e) {};
    });
    it('[GFCE] must throw an error when providing an unexisting method', () => {
      try {
        validation.filter(buildFilter(['doesntexist']));
        assert.fail('must refuse an unexisting method');
      } catch(e) {assert.exists(e);}
    });
    it('[GY6E] must throw an error when providing an invalid aggregate method', () => {
      try {
        validation.filter(buildFilter(['something.all']));
        assert.fail('must throw an error')
      } catch(e) {assert.exists(e);}
    });
  });

  describe('initialization', () => {
    it('[H8RB] must expand aggregate methods', () => {
      const filter = new AuditFilter({ syslogFilter: buildFilter(), storageFilter: buildFilter(['events.all']) });
      apiMethods.AUDITED_METHODS.forEach(m => {
        const auditChannels = filter.isAudited(m);
        assert.isTrue(auditChannels.syslog);
        if (m.startsWith('events.')) assert.isTrue(auditChannels.storage);
      });
    })
  });

});