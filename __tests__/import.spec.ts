import { sum } from './test';

describe('jest-electron', () => {
  test('sum', () => {
    expect(sum(1, 5)).toBe(6);
  });
});
