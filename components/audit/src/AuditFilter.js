/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const validation = require('./validation');

const {
  ALL_METHODS,
  AUDITED_METHODS,
  WITH_USER_METHODS,
} = require('./ApiMethods');

class AuditFilter {
  config;
  storageFilter;
  syslogFilter;
  fullFilter;

  /**
   * Builds the syslogFilter & storageFilter maps used by the filter.
   * Throws an error if the config audit:syslog:filter & audit:storage:filter parameters are invalid
   */
  constructor(
    params = {
      syslogFilter: { methods: { allowed: ['all'], unallowed: [] } },
      storageFilter: { methods: { allowed: ['all'], unallowed: [] } }
    }
  ) {
    const syslogFilter = params.syslogFilter;
    const storageFilter = params.storageFilter;

    validation.filter(syslogFilter);
    validation.filter(storageFilter);

    this.syslogFilter = {
      methods: buildAllowedMap(
        AUDITED_METHODS,
        syslogFilter.methods.allowed,
        syslogFilter.methods.unallowed
      )
    };
    this.storageFilter = {
      methods: buildAllowedMap(
        WITH_USER_METHODS,
        storageFilter.methods.allowed,
        storageFilter.methods.unallowed
      )
    };
    const methodsFullFilter = {};
    for (let i = 0; i < ALL_METHODS.length; i++) {
      const m = ALL_METHODS[i];
      let methodFilter = {};
      if (this.syslogFilter.methods[m]) methodFilter.syslog = true;
      if (this.storageFilter.methods[m]) methodFilter.storage = true;
      if (Object.keys(methodFilter).length === 0) methodFilter = false;
      methodsFullFilter[m] = methodFilter;
    }

    this.fullFilter = { methods: methodsFullFilter };

    function buildAllowedMap(baseMethods, allowed, unallowed) {
      allowed = expandAggregates(allowed);
      unallowed = expandAggregates(unallowed);
      // only allowed
      if (isOnlyAllowedUsed(allowed, unallowed)) {
        if (hasAll(allowed)) {
          return buildMap(baseMethods);
        } else {
          return buildMap(baseMethods.filter(m => allowed.includes(m)));
        }
        // only unallowed
      } else if (isOnlyUnallowedUsed(allowed, unallowed)) {
        if (hasAll(unallowed)) {
          return {};
        } else {
          return buildMap(baseMethods.filter(m => !unallowed.includes(m)));
        }
      }
    }

    function isOnlyAllowedUsed(allowed, unallowed) {
      return allowed.length > 0 && unallowed.length === 0;
    }
    function isOnlyUnallowedUsed(allowed, unallowed) {
      return unallowed.length > 0 && allowed.length === 0;
    }
    function hasAll(methods) {
      return methods.includes('all');
    }
    function expandAggregates(methods) {
      let expandedMethods = [];
      methods.forEach(m => {
        if (!isAggregate(m)) {
          expandedMethods.push(m);
        } else {
          expandedMethods = expandedMethods.concat(expandAggregate(m));
        }
        
      });
      return expandedMethods;

      function isAggregate(m) {
        const parts = m.split('.');
        if (parts.length !== 2) return false;
        if (parts[1] !== 'all') return false;
        return true;
      }
      function expandAggregate(aggregateMethod) {
        const resource = aggregateMethod.split('.')[0];
        const expandedMethod = [];
        ALL_METHODS.forEach(m => {
          if (m.startsWith(resource + '.')) expandedMethod.push(m);
        });
        return expandedMethod;
      }
    }
    /**
     * Builds a map with an { i => true } entry for each array element
     * @param {Array<*>} array
     */
    function buildMap(array) {
      const map = {};
      array.forEach(i => {
        map[i] = true;
      });
      return map;
    }
  }

  /**
   * Returns { syslog?: true, storage?: true } if at least one of them is audited
   * otherwise, returns false
   * @param {*} method - the method name. Ex.: events.get
   */
  isAudited(method) {
    return this.fullFilter.methods[method];
  }
}
module.exports = AuditFilter;
