const test = require('tape');
const { depsThumbprint } = require('../lib/depsThumbprint');
const { dirname } = require('path');

test('test depsThumbprint', t => {
  t.plan(2);

  const {
    thumbprint,
    resolvedPkgJson,
  } = depsThumbprint({
    pkgJson: {
      dependencies: {
        foo: 'foo',
        local1: 'file:/a/b/c',
        local2: 'file:../lib',
      },
    },
    pkgDir: __dirname}
  );

  t.equal(thumbprint.length, 40);

  t.deepEqual(resolvedPkgJson, {
    bundledDependencies: undefined,
    dependencies: {
      foo: 'foo',
      local1: 'file:/a/b/c',
      local2: `file:${dirname(__dirname)}/lib`,
    },
    devDependencies: undefined,
    optionalDependencies: undefined,
    peerDependencies: undefined,
  });
});
