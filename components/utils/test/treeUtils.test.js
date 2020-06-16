/* global describe, it */

const should = require('should'); // explicit require to benefit from static functions
const treeUtils = require('../src/treeUtils');

describe('tree utils', () => {
  const testArray = [
    {
      id: 'root-1',
      parentId: null,
      someProperty: false,
    },
    {
      id: 'child-1.1',
      parentId: 'root-1',
      someProperty: false,
    },
    {
      id: 'child-1.1.1',
      parentId: 'child-1.1',
      someProperty: false,
    },
    {
      id: 'child-1.2',
      parentId: 'root-1',
      someProperty: true,
    },
    {
      id: 'root-2',
      parentId: null,
      someProperty: true,
    },
    {
      id: 'child-2.1',
      parentId: 'root-2',
      someProperty: false,
    },
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
              children: [],
            },
          ],
        },
        {
          id: 'child-1.2',
          someProperty: true,
          children: [],
        },
      ],
    },
    {
      id: 'root-2',
      someProperty: true,
      children: [
        {
          id: 'child-2.1',
          someProperty: false,
          children: [],
        },
      ],
    },
  ];

  const invalidArray = [
    {
      badId: 'x',
    },
  ];

  describe('buildTree()', () => {
    it('[32CB] must build a correct tree for a given consistent array', () => {
      treeUtils.buildTree(testArray, true /* strip parent ids */).should.eql(testTree);
    });

    it('[VVVS] must throw an error if objects do not contain the necessary properties', () => {
      /* jshint -W068 */
      (function () { treeUtils.buildTree(invalidArray); }).should.throw();
    });

    it('[CEUF] must throw an error if the object in argument is not an array', () => {
      /* jshint -W068 */
      (function () { treeUtils.buildTree(testArray[0]); }).should.throw();
    });
  });

  describe('flattenTree()', () => {
    it('[11JJ] must build a correct array for a given tree', () => {
      treeUtils.flattenTree(testTree).should.eql(testArray);
    });

    it('[OVJM] must throw an error if the object in argument is not an array', () => {
      /* jshint -W068 */
      (function () { treeUtils.flattenTree(testTree[0]); }).should.throw();
    });
  });

  describe('findInTree()', () => {
    it('[S1N0] must return the first item matching the given iterator function', () => {
      const foundItem = treeUtils.findInTree(testTree, (item) => item.someProperty === true);
      foundItem.should.eql(testTree[0].children[1]);
    });

    it('[SI6L] must return null if no item matches the given iterator function', () => {
      const foundItem = treeUtils.findInTree(testTree, (item) => item.someProperty === 'missing value');
      should.not.exist(foundItem);
    });
  });

  describe('filterTree()', () => {
    it('[YIE6] must return only items matching the given iterator function', () => {
      const filteredTree = treeUtils.filterTree(testTree, true /* keep orphans */, (item) => item.someProperty === false);

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
                  children: [],
                },
              ],
            },
          ],
        },
        {
          id: 'child-2.1',
          someProperty: false,
          children: [],
        },
      ]);
    });
  });

  describe('collect()', () => {
    it('[AU44] must return an array with values matching the iterator function for each item in the tree',
      () => {
        const ids = treeUtils.collect(testTree, (item) => item.id);

        const expected = testArray.map((item) => item.id);
        ids.should.eql(expected);
      });
  });

  describe('expandIds()', () => {
    it('[PFJP] must return an array with the ids passed in argument plus those of all their descendants',
      () => {
        treeUtils.expandIds(testTree, ['root-1']).should.eql([
          'root-1', 'child-1.1', 'child-1.1.1', 'child-1.2',
        ]);
      });
  });
});
