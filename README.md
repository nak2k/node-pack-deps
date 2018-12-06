# pack-deps

Pack dependencies.

## Installation

```
npm i pack-deps
```

## API

### packDeps(options, callback)

Generate a zip file that contains dependencies from a specified `package.json`.

- `options.pkgJson`
  - `package.json` that dependencies are packed.
- `options.pkgDir`
  - A path that the `package.json` is located.
- `options.production`
  - A boolean value whether to pack dependencies in production mode.
- `options.cacheBaseDir`
  - A path of a base directory that cache a packed package on.
- `options.baseDirInZip`
  - A path of a base directory in a zip file.
- `options.noCache`
  - If this option is `false`, a zip file is not generated.
- `callback(err, { zip, cacheFile, cacheDir })`
  - A function that is callback when packing is completed.
  - `err` - An Error object when an error is occured.
  - `zip` - An instance of the [JSZip](http://stuk.github.io/jszip/documentation/api_jszip/constructor.html).
  - `cacheFile` - A path of the cached zip file.
  - `cacheDir` - A path of a directory that cache the packed package on.

### depsThumbprint(options)

Calculate a thumbprint based on dependeices from a specified `package.json`.

- `options.pkgJson`
- `options.pkgDir`

Return value:

- `resolvedPkgJson`
- `thumbprint`

## License

MIT
