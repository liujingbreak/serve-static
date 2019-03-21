/// <reference path="../lib.d.ts"/>
/**
 * Module dependencies.
 * @private
 */

var encodeUrl = require('encodeurl');
var escapeHtml = require('escape-html');
var parseUrl = require('parseurl');
// var resolve = require('path').resolve;
import url from 'url';
import serveStaticModule from 'serve-static';
import zip from 'zip';
import {Request, Response, NextFunction, Handler} from 'express';
import _ from 'lodash';
import {CacheEntry} from './common';
import Sender, {mime as mime0} from './send-buf';
/**
 * Module exports.
 * @public
 */

export = serveStatic;
// module.exports.mime = send.mime

/**
 * @param {string} root default root path in extracted zip file structure
 * @param {object} [options]
 * @return {function}
 * @public
 */

function serveStatic (root = '', options?: serveStaticModule.ServeStaticOptions): ZipMiddleware {
  root = _.trimStart(root, '/');

  // copy options object
  const opts: serveStaticModule.ServeStaticOptions & {root: string} = Object.create(options || null)

  // fall-though
  var fallthrough = opts.fallthrough !== false

  // default redirect
  var redirect = opts.redirect !== false

  // headers listener
  var setHeaders = opts.setHeaders

  if (setHeaders && typeof setHeaders !== 'function') {
    throw new TypeError('option setHeaders must be function')
  }

  // setup options for send
  if (opts.maxAge == null)
    opts.maxAge = 0;
  // opts.maxage = opts.maxage || opts.maxAge || 0
  opts.root = root;

  // construct directory listener
  var onDirectory = redirect
    ? createRedirectDirectoryListener()
  : createNotFoundDirectoryListener()
  
  const m = new ZipMiddleware();
  m.handler = handler;
  
  function handler (req: Request, res: Response, next: NextFunction) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (fallthrough) {
        return next();
      }

      // method not allowed
      res.statusCode = 405
      res.setHeader('Allow', 'GET, HEAD')
      res.setHeader('Content-Length', '0')
      res.end()
      return
    }

    var forwardError = !fallthrough
    var originalUrl = parseUrl.original(req)
    var path = parseUrl(req).pathname

    // make sure redirect occurs at mount
    if (path === '/' && originalUrl.pathname.substr(-1) !== '/') {
      path = ''
    }
    // const entry = m.cache.get(_.trimStart(path, '/'));
    // if (entry == null) {
    //   return next();
    // }
    // res.setHeader('Content-Length', entry.data.byteLength);
    // res.type(Path.extname(entry.name));
    // res.end(entry.data);
    const stream = new Sender(req, path, m.cache, opts);

    // // create send stream
    // var stream = send(req, path, opts)

    // add directory handler
    stream.on('directory', onDirectory)

    // add headers listener
    if (setHeaders) {
      stream.on('headers', setHeaders)
    }

    // add file listener for fallthrough
    if (fallthrough) {
      stream.on('file', function onFile () {
        // once file is determined, always forward error
        forwardError = true
      })
    }

    // forward errors
    stream.on('error', function error (err: any) {
      if (forwardError || !(err.statusCode < 500)) {
        next(err)
        return
      }

      next()
    })

    // pipe
    stream.pipe(res)
  }
  return m;
}

class ZipMiddleware {
  handler: Handler;

  cache = new Map<string, CacheEntry>();

  updateZip(buf: Buffer, root = '') {
    if (!root.endsWith('/'))
      root = root + '/';
    // this.cache.clear();
    const reader = zip.Reader(buf);
    reader.forEach(entry => {
      const normalEntryPath = entry.getName().replace(/\\/g, '/');
      let entryPath: string;
      // if (entry.isDirectory())
      //   return;
      if (!normalEntryPath.startsWith('/'))
        entryPath = '/' + normalEntryPath;
      if (!root || entryPath.startsWith(root)) {
        this.cache.set(entryPath.substring(root.length), {
          data: entry.getData(),
          lastModified: entry.lastModified(),
          name: normalEntryPath,
          isDirectory: entry.isDirectory()
        });
        console.log('[serve-static-zip] zip entry name: ', entry.getName());
      }
    });
  }
}

namespace serveStatic {
  export const mime = mime0;
  export type Entry = CacheEntry;
  export type ZipResourceMiddleware = ZipMiddleware;
}



/**
 * Collapse all leading slashes into a single slash
 * @private
 */
function collapseLeadingSlashes (str: string) {
  for (var i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) !== 0x2f /* / */) {
      break
    }
  }

  return i > 1
    ? '/' + str.substr(i)
    : str
}

 /**
 * Create a minimal HTML document.
 *
 * @param {string} title
 * @param {string} body
 * @private
 */

function createHtmlDocument (title: string, body: string) {
  return '<!DOCTYPE html>\n' +
    '<html lang="en">\n' +
    '<head>\n' +
    '<meta charset="utf-8">\n' +
    '<title>' + title + '</title>\n' +
    '</head>\n' +
    '<body>\n' +
    '<pre>' + body + '</pre>\n' +
    '</body>\n' +
    '</html>\n'
}

/**
 * Create a directory listener that just 404s.
 * @private
 */

function createNotFoundDirectoryListener () {
  return function notFound () {
    this.error(404)
  }
}

/**
 * Create a directory listener that performs a redirect.
 * @private
 */

function createRedirectDirectoryListener () {
  return function redirect (res: Response) {
    if (this.hasTrailingSlash()) {
      this.error(404)
      return
    }

    // get original URL
    var originalUrl = parseUrl.original(this.req)

    // append trailing slash
    originalUrl.path = null
    originalUrl.pathname = collapseLeadingSlashes(originalUrl.pathname + '/')

    // reformat the URL
    var loc = encodeUrl(url.format(originalUrl))
    var doc = createHtmlDocument('Redirecting', 'Redirecting to <a href="' + escapeHtml(loc) + '">' +
      escapeHtml(loc) + '</a>')

    // send redirect response
    res.statusCode = 301
    res.setHeader('Content-Type', 'text/html; charset=UTF-8')
    res.setHeader('Content-Length', Buffer.byteLength(doc))
    res.setHeader('Content-Security-Policy', "default-src 'self'")
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Location', loc)
    res.end(doc)
  }
}
