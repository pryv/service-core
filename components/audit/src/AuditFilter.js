

const {
  AUDITED_METHODS,
  WITHOUT_USER_METHODS,
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
  contructor(params: { 
    syslogFilter: { methods: { allowed: ['all'], unallowed: [] }},
    storageFilter: { methods: { allowed: ['all'], unallowed: [] }},
  }) {
    console.log('yo')
    const syslogFilter = params.syslogFilter;
    const storageFilter = params.storageFilter;
    
    validation.filter(syslogFilter);
    validation.filter(storageFilter);

    this.syslogFilter = {
      methods: buildAllowedMap(
        AUDITED_METHODS,
        syslogFilter.methods.allowed,
        syslogFilter.methods.unallowed,
      ),
    };
    this.storageFilter = {
      methods: buildAllowedMap(
        WITHOUT_USER_METHODS,
        storageFilter.methods.allowed,
        storageFilter.methods.unallowed,
      ),
    };
    const methodsFullFilter = {};
    for (let i=0; i<ALL_METHODS.length; i++) {
      const m = ALL_METHODS[i];
      let methodFilter = {};
      if (this.syslogFilter.methods[m]) methodFilter.syslog = true;
      if (this.storageFilter.methods[m]) methodFilter.storage = true;
      if (Object.keys(methodFilter).length === 0) methodFilter = false;
      fullFilter[m] = methodFilter;
    }
    
    this.fullFilter = { methods: methodsFullFilter };
    console.log('got fullfilter', this.fullFilter)

    function buildAllowedMap(baseMethods, allowed, unallowed) {
      allowed = expandAggregates(allowed);
      unallowed = expandAggregates(unallowed);
      // only allowed
      if (isOnlyAllowedUsed(allowed, unallowed)) {
        if (hasAll(allowed)) {
          return baseMethods;
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
      const expandedMethods = [];
      methods.forEach(m => {
        if (! isAggregate(m)) return expandedMethods.push(m);
        expandAggregates.concat(expandAggregate(m));
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
        const methods = [];
        ALL_METHODS.forEach(m => {
          if (m.startsWith(resource)) methods.push(m);
        });
        return methods;
      }
    }
  }

  /**
   * Returns { syslog?: true, storage?: true } if at least one of them is audited
   * otherwise, returns false
   * @param {*} method - the method name. Ex.: events.get
   */
  isAudited(method) {
    return this.fullFilter.methods[m];
  }
}
module.exports = AuditFilter;