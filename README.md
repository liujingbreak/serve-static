# serve-static-zip

## Install

This is a [Node.js](https://nodejs.org/en/) module available through the
[npm registry](https://www.npmjs.com/). Installation is done using the
[`npm install` command](https://docs.npmjs.com/getting-started/installing-npm-packages-locally):

Consider comparing to use `serve-static` in express appliaction, this package is for
serving static resource file from a zip file buffer in memory, while `serve-static` 
serves static resource files from a local directory.

> Be aware that, unlike `server-static` this package does not support response with [Content-Range](https://devdocs.io/http/headers/content-range) header yet, I am working on it!

```sh
$ npm install serve-static-zip
```

## API

<!-- eslint-disable no-unused-vars -->
Typescript
```ts
import createServeZip = require('serve-static-zip');
import {Response} from 'express';

const serveZip = createServeZip({
  maxAage: 0,
  setHeaders: (res: Response, path: string, entry: Entry) => {
  }
  // ...
  // same options as serve-static has
});
expressApp.use('/', serveZip.handler);

// later some time, you can update resource with new zip buffer
// The file comes from new zip buffer will overwrite the old one which has same path
serveZip.updateZip(zipFileBuffer);

// To clean up old files in memory
serveZip.cache.clear();
```


## License

[MIT](LICENSE)

[npm-image]: https://img.shields.io/npm/v/serve-static.svg
[npm-url]: https://npmjs.org/package/serve-static
[travis-image]: https://img.shields.io/travis/expressjs/serve-static/master.svg?label=linux
[travis-url]: https://travis-ci.org/expressjs/serve-static
[appveyor-image]: https://img.shields.io/appveyor/ci/dougwilson/serve-static/master.svg?label=windows
[appveyor-url]: https://ci.appveyor.com/project/dougwilson/serve-static
[coveralls-image]: https://img.shields.io/coveralls/expressjs/serve-static/master.svg
[coveralls-url]: https://coveralls.io/r/expressjs/serve-static
[downloads-image]: https://img.shields.io/npm/dm/serve-static.svg
[downloads-url]: https://npmjs.org/package/serve-static
