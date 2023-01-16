/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const treeUtils = require('../src/treeUtils');
const should = require('should'); // explicit require to benefit from static functions

describe('tree utils', function () {
  const testArray = [
    {
      id: 'root-1',
      parentId: null,
      someProperty: false
    },
    {
      id: 'child-1.1',
      parentId: 'root-1',
      someProperty: false
    },
    {
      id: 'child-1.1.1',
      parentId: 'child-1.1',
      someProperty: false
    },
    {
      id: 'child-1.2',
      parentId: 'root-1',
      someProperty: true
    },
    {
      id: 'root-2',
      parentId: null,
      someProperty: true
    },
    {
      id: 'child-2.1',
      parentId: 'root-2',
      someProperty: false
    }
  ];

  const testTree = [
    {
      id: 'root-1',
      someProperty: false,
      children: [
        {
          id: 'child-1.1',
          someProperty: false,
          children: [
            {
              id: 'child-1.1.1',
              someProperty: false,
              children: []
            }
          ]
        },
        {
          id: 'child-1.2',
          someProperty: true,
          children: []
        }
      ]
    },
    {
      id: 'root-2',
      someProperty: true,
      children: [
        {
          id: 'child-2.1',
          someProperty: false,
          children: []
        }
      ]
    }
  ];

  const invalidArray = [
    {
      badId: 'x'
    }
  ];

  describe('buildTree()', function () {
    it('[32CB] must build a correct tree for a given consistent array', function () {
      treeUtils.buildTree(testArray, true /* strip parent ids */).should.eql(testTree);
    });

    it('[VVVS] must throw an error if objects do not contain the necessary properties', function () {
      (function () { treeUtils.buildTree(invalidArray); }).should.throw();
    });

    it('[CEUF] must throw an error if the object in argument is not an array', function () {
      (function () { treeUtils.buildTree(testArray[0]); }).should.throw();
    });
  });

  describe('flattenTree()', function () {
    it('[11JJ] must build a correct array for a given tree', function () {
      treeUtils.flattenTree(testTree).should.eql(testArray);
    });

    it('[OVJM] must throw an error if the object in argument is not an array', function () {
      (function () { treeUtils.flattenTree(testTree[0]); }).should.throw();
    });
  });

  describe('findInTree()', function () {
    it('[S1N0] must return the first item matching the given iterator function', function () {
      const foundItem = treeUtils.findInTree(testTree, function (item) {
        return item.someProperty === true;
      });
      foundItem.should.eql(testTree[0].children[1]);
    });

    it('[SI6L] must return null if no item matches the given iterator function', function () {
      const foundItem = treeUtils.findInTree(testTree, function (item) {
        return item.someProperty === 'missing value';
      });
      should.not.exist(foundItem);
    });
  });

  describe('filterTree()', function () {
    it('[YIE6] must return only items matching the given iterator function', function () {
      const filteredTree = treeUtils.filterTree(testTree, true /* keep orphans */, function (item) {
        return item.someProperty === false;
      });

      filteredTree.should.eql([
        {
          id: 'root-1',
          someProperty: false,
          children: [
            {
              id: 'child-1.1',
              someProperty: false,
              children: [
                {
                  id: 'child-1.1.1',
                  someProperty: false,
                  children: []
                }
              ]
            }
          ]
        },
        {
          id: 'child-2.1',
          someProperty: false,
          children: []
        }
      ]);
    });
  });

  describe('collect()', function () {
    it('[AU44] must return an array with values matching the iterator function for each item in the tree',
      function () {
        const ids = treeUtils.collect(testTree, function (item) {
          return item.id;
        });

        const expected = testArray.map(function (item) {
          return item.id;
        });
        ids.should.eql(expected);
      });
  });

  describe('expandIds()', function () {
    it('[PFJP] must return an array with the ids passed in argument plus those of all their descendants',
      function () {
        treeUtils.expandIds(testTree, ['root-1']).should.eql([
          'root-1', 'child-1.1', 'child-1.1.1', 'child-1.2'
        ]);
      });
  });
});
