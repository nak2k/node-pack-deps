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
- `options.pkgDir`
- `options.production`
- `options.cacheBaseDir`
- `callback(err, { zip, cacheFile, cacheDir })`

### depsThumbprint(options)

Calculate a thumbprint based on dependeices from a specified `package.json`.

- `options.pkgJson`
- `options.pkgDir`

## License

MIT
