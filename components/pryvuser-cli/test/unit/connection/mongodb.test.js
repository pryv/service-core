// @flow

/* global describe, it */

describe('Connection/MongoDB', () => {
  describe('when given a user fixture', () => {
    describe('#preflight(username)', () => {
      it("checks the connection and doesn't throw");
    });
    describe('#deleteUser(username)', () => {
      it('deletes the user from MongoDB');
    });
  })
});