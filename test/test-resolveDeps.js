const test = require('tape');
const { resolveDeps } = require('../lib/resolveDeps');
const { dirname } = require('path');

test('test resolveDeps', t => {
  t.plan(1);

  const result = resolveDeps({
    foo: 'foo',
    local1: 'file:/a/b/c',
    local2: 'file:../lib',
  }, __dirname);

  t.deepEqual(result, {
    foo: 'foo',
    local1: 'file:/a/b/c',
    local2: `file:${dirname(__dirname)}/lib`,
  });
});
