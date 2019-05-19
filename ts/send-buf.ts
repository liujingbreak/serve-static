import { EventEmitter } from 'events';
import {ServeStaticOptions} from 'serve-static';
import {Request, Response} from 'express';
import {CacheEntry} from './common';
var debug = require('debug')('serve-static-zip');
const createError = require('http-errors');
const statuses = require('statuses');
const deprecate = require('depd')('send');
const encodeUrl = require('encodeurl');
const escapeHtml = require('escape-html');
const etag = require('etag');
const fresh = require('fresh');
const mime = require('mime');
const ms = require('ms');
const parseRange = require('range-parser');
import path from 'path';
// var Stream = require('stream')
var util = require('util');

var extname = path.extname
var join = path.join
var normalize = path.normalize
var resolve = path.resolve
var sep = path.sep
/**
 * Regular expression for identifying a bytes Range header.
 * @private
 */

var BYTES_RANGE_REGEXP = /^ *bytes=/

/**
 * Maximum value allowed for the max age.
 * @private
 */

var MAX_MAXAGE = 60 * 60 * 24 * 365 * 1000 // 1 year
/**
 * Regular expression to match a path with a directory up component.
 * @private
 */

var UP_PATH_REGEXP = /(?:^|[\\/])\.\.(?:[\\/]|$)/

export {mime};
export default class Sender extends EventEmitter {
  private res: Response;
  _root: string;
  _acceptRanges: boolean;
  _cacheControl: boolean;
  _etag: boolean;
  _dotfiles: string;
  _hidden: boolean;
  _extensions: string[];
  _immutable: boolean;
  _index: string[];
  _lastModified: boolean;
  _maxage: number;

  constructor(public req: Request, public path: string, public extractedZip: Map<string,CacheEntry>,
    public opts: ServeStaticOptions & {root?: string, acceptRanges?: boolean, hidden?: boolean, start?: number, end?: number} = {}) {
    super();
    debugger;
    this._root = opts.root;
    this._acceptRanges = opts.acceptRanges !== undefined
        ? Boolean(opts.acceptRanges)
        : true

    this._cacheControl = opts.cacheControl !== undefined
        ? Boolean(opts.cacheControl)
        : true

    this._etag = opts.etag !== undefined
        ? Boolean(opts.etag)
        : true

    this._dotfiles = opts.dotfiles !== undefined
        ? opts.dotfiles
        : 'ignore'

    if (this._dotfiles !== 'ignore' && this._dotfiles !== 'allow' && this._dotfiles !== 'deny') {
        throw new TypeError('dotfiles option must be "allow", "deny", or "ignore"')
    }

    this._hidden = Boolean(opts.hidden)

    if (opts.hidden !== undefined) {
        deprecate('hidden: use dotfiles: \'' + (this._hidden ? 'allow' : 'ignore') + '\' instead')
    }

    // legacy support
    if (opts.dotfiles === undefined) {
        this._dotfiles = undefined
    }

    this._extensions = opts.extensions !== undefined
        ? normalizeList(opts.extensions, 'extensions option')
        : []

    this._immutable = opts.immutable !== undefined
        ? Boolean(opts.immutable)
        : false

    this._index = opts.index !== undefined
        ? normalizeList(opts.index, 'index option')
        : ['index.html']

    this._lastModified = opts.lastModified !== undefined
        ? Boolean(opts.lastModified)
        : true

    this._maxage = opts.maxAge || (opts as any).maxage
    this._maxage = typeof this._maxage === 'string'
        ? ms(this._maxage)
        : Number(this._maxage)
    this._maxage = !isNaN(this._maxage)
        ? Math.min(Math.max(0, this._maxage), MAX_MAXAGE)
        : 0
  }
  pipe(res: Response): Response {
    this.res = res;
    // root path
    var root = this._root;
    
    // decode the path
    debugger;
    var path = decode(this.path)
    if (path === -1) {
      this.error(400)
      return res
    }
    path = path as string;
    // null byte(s)
    if (~path.indexOf('\0')) {
      this.error(400)
      return res
    }
    
    var parts
    if (root !== null) {
      // normalize
      if (path) {
        path = normalize('.' + sep + path)
      }
    
      // malicious path
      if (UP_PATH_REGEXP.test(path)) {
        debug('malicious path "%s"', path)
        this.error(403)
        return res
      }
    
      // explode path parts
      parts = path.split(sep)
    
      // join / normalize from optional root dir
      path = normalize(join(root, path))
    } else {
      // ".." is malicious without "root"
      if (UP_PATH_REGEXP.test(path)) {
        debug('malicious path "%s"', path)
        this.error(403)
        return res
      }
    
      // explode path parts
      parts = normalize(path).split(sep)
    
      // resolve the path
      path = resolve(path)
    }
    
    // dotfile handling
    if (containsDotFile(parts)) {
      var access = this._dotfiles
    
      // legacy support
      if (access === undefined) {
        access = parts[parts.length - 1][0] === '.'
          ? (this._hidden ? 'allow' : 'ignore')
          : 'allow'
      }
    
      debug('%s dotfile "%s"', access, path)
      switch (access) {
        case 'allow':
          break
        case 'deny':
          this.error(403)
          return res
        case 'ignore':
        default:
          this.error(404)
          return res
      }
    }
    
    // index file support
    if (this._index.length && this.hasTrailingSlash()) {
        this.sendIndex(path)
        return res
    }
    
    this.sendFile(path);
    return res;
  }
  error (status: number, err?: Error | {headers?: any}) {
    // emit if listeners instead of responding
    if (hasListeners(this, 'error')) {
      return this.emit('error', createError(status, err, {
        expose: false
      }))
    }
    
    var res = this.res
    var msg = statuses[status] || String(status)
    var doc = createHtmlDocument('Error', escapeHtml(msg))
    
    // clear existing headers
    clearHeaders(res)
    
    // add error headers
    if (err && (err as {headers?: any}).headers) {
      setHeaders(res, (err as {headers?: any}).headers)
    }
    
    // send basic response
    res.statusCode = status
    res.setHeader('Content-Type', 'text/html; charset=UTF-8')
    res.setHeader('Content-Length', Buffer.byteLength(doc))
    res.setHeader('Content-Security-Policy', "default-src 'self'")
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.end(doc)
  }
  hasTrailingSlash () {
    return this.path[this.path.length - 1] === '/';
  }
  sendIndex (path: string) {
    var i = -1
    var self = this

    function next(err?: Error) {
      if (++i >= self._index.length) {
        if (err) return self.onStatError(err)
        return self.error(404)
      }
    
      var p = join(path, self._index[i])
    
      debug('stat "%s"', p)
      const entry = self.extractedZip.get(p.replace(/\\/g, '/'));
      if (entry == null) {
          next();
          return;
      }
      self.emit('file', p, entry);
      self.send(entry);
    //   fs.stat(p, function (err, stat) {
    // 	if (err) return next(err)
    // 	if (stat.isDirectory()) return next()
    // 	self.emit('file', p, stat)
    // 	self.send(p, stat)
    //   })
    }

    next();
  }
  onStatError (error: any) {
    switch (error.code) {
      case 'ENAMETOOLONG':
      case 'ENOENT':
      case 'ENOTDIR':
        this.error(404, error)
        break
      default:
        this.error(500, error)
        break
    }
  }
  send (entry: CacheEntry) {
    const path = entry.name;
    var len = entry.data.byteLength;
    var options = this.opts;
    var opts: Sender['opts'] = {}
    var res = this.res
    var req = this.req
    var ranges = req.headers.range
    var offset = options.start || 0
    
    if (headersSent(res)) {
      // impossible to send now
      this.headersAlreadySent()
      return
    }
    
    debug('pipe "%s"', path)
    
    // set header fields
    this.setHeader(entry)
    
    // set content-type
    this.type(path)
    
    // conditional GET support
    if (this.isConditionalGET()) {
      if (this.isPreconditionFailure()) {
        this.error(412)
        return
      }
    
      if (this.isCachable() && this.isFresh()) {
        this.notModified()
        return
      }
    }
    
    // adjust len to start/end options
    len = Math.max(0, len - offset)
    if (options.end !== undefined) {
      var bytes = options.end - offset + 1
      if (len > bytes) len = bytes
    }
    
    // Range support
    if (this._acceptRanges && BYTES_RANGE_REGEXP.test(ranges)) {
      // parse
      let _ranges = parseRange(len, ranges, {
        combine: true
      })
      // If-Range support
      if (!this.isRangeFresh()) {
        debug('range stale')
        _ranges = -2
      }
    
      // unsatisfiable
      if (_ranges === -1) {
        debug('range unsatisfiable')
    
        // Content-Range
        res.setHeader('Content-Range', contentRange('bytes', len))
    
        // 416 Requested Range Not Satisfiable
        return this.error(416, {
          headers: { 'Content-Range': res.getHeader('Content-Range') }
        })
      }
    
      // valid (syntactically invalid/multiple ranges are treated as a regular response)
      if (_ranges !== -2 && ranges.length === 1) {
        debug('range %j', ranges)
    
        // Content-Range
        res.statusCode = 206
        res.setHeader('Content-Range', contentRange('bytes', len, _ranges[0]))
    
        // adjust for requested range
        offset += _ranges[0].start
        len = _ranges[0].end - _ranges[0].start + 1
      }
    }
    
    // clone options
    for (var prop in options) {
      opts[prop] = options[prop]
    }
    
    // set read options
    opts.start = offset
    opts.end = Math.max(offset, offset + len - 1)
    
    // content-length
    res.setHeader('Content-Length', len)
    
    // HEAD support
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    
    this.stream(entry, opts);
  }

  type (path: string) {
    var res = this.res
    
    if (res.getHeader('Content-Type')) return
    
    var type = mime.lookup(path)
    
    if (!type) {
      debug('no content-type')
      return
    }
    
    var charset = mime.charsets.lookup(type)
    
    debug('content-type %s', type)
    res.setHeader('Content-Type', type + (charset ? '; charset=' + charset : ''))
  }

  headersAlreadySent () {
    var err = new Error('Can\'t set headers after they are sent.')
    debug('headers already sent')
    this.error(500, err)
  }
  isCachable () {
    var statusCode = this.res.statusCode
    return (statusCode >= 200 && statusCode < 300) ||
      statusCode === 304
  }
  isConditionalGET () {
    return this.req.headers['if-match'] ||
      this.req.headers['if-unmodified-since'] ||
      this.req.headers['if-none-match'] ||
      this.req.headers['if-modified-since']
  }
  isPreconditionFailure () {
    var req = this.req
    var res = this.res
    
    // if-match
    var match = req.headers['if-match']
    if (match) {
      var etag = res.getHeader('ETag')
      return !etag || (match !== '*' && parseTokenList(match).every(function (match) {
        return match !== etag && match !== 'W/' + etag && 'W/' + match !== etag
      }))
    }
    
    // if-unmodified-since
    var unmodifiedSince = parseHttpDate(req.headers['if-unmodified-since'])
    if (!isNaN(unmodifiedSince)) {
      var lastModified = parseHttpDate(res.getHeader('Last-Modified') as string)
      return isNaN(lastModified) || lastModified > unmodifiedSince
    }
    
    return false
  }
  removeContentHeaderFields () {
    var res = this.res
    var headers = getHeaderNames(res)
    
    for (var i = 0; i < headers.length; i++) {
      var header = headers[i]
      if (header.substr(0, 8) === 'content-' && header !== 'content-location') {
        res.removeHeader(header)
      }
    }
    }
  notModified () {
    var res = this.res
    debug('not modified')
    this.removeContentHeaderFields()
    res.statusCode = 304
    res.end()
  }
  isFresh () {
    return fresh(this.req.headers, {
      'etag': this.res.getHeader('ETag'),
      'last-modified': this.res.getHeader('Last-Modified')
    })
  }
  isRangeFresh () {
    var ifRange: string = this.req.headers['if-range'] as string;
    
    if (!ifRange) {
        return true
    }
    
    // if-range as etag
    if (ifRange.indexOf('"') !== -1) {
        var etag = this.res.getHeader('ETag') as string
        return Boolean(etag && ifRange.indexOf(etag) !== -1)
    }
    
    // if-range as modified date
    var lastModified = this.res.getHeader('Last-Modified') as string;
    return parseHttpDate(lastModified) <= parseHttpDate(ifRange)
  }
  redirect (path: string) {
    var res = this.res
    
    if (hasListeners(this, 'directory')) {
      this.emit('directory', res, path)
      return
    }
    
    if (this.hasTrailingSlash()) {
      this.error(403)
      return
    }
    
    var loc = encodeUrl(collapseLeadingSlashes(this.path + '/'))
    var doc = createHtmlDocument('Redirecting', 'Redirecting to <a href="' + escapeHtml(loc) + '">' +
      escapeHtml(loc) + '</a>')
    
    // redirect
    res.statusCode = 301
    res.setHeader('Content-Type', 'text/html; charset=UTF-8')
    res.setHeader('Content-Length', Buffer.byteLength(doc))
    res.setHeader('Content-Security-Policy', "default-src 'self'")
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Location', loc)
    res.end(doc)
  }

  setHeader (entry: CacheEntry) {
    var res = this.res
    
    this.emit('headers', res, entry.name, entry)
    
    if (this._acceptRanges && !res.getHeader('Accept-Ranges')) {
      debug('accept ranges')
      res.setHeader('Accept-Ranges', 'bytes')
    }
    
    if (this._cacheControl && !res.getHeader('Cache-Control')) {
      var cacheControl = 'public, max-age=' + Math.floor(this._maxage / 1000)
    
      if (this._immutable) {
        cacheControl += ', immutable'
      }
    
      debug('cache-control %s', cacheControl)
      res.setHeader('Cache-Control', cacheControl)
    }
    
    if (this._lastModified && !res.getHeader('Last-Modified')) {
      var modified = entry.lastModified.toUTCString()
      debug('modified %s', modified)
      res.setHeader('Last-Modified', modified)
    }
    
    if (this._etag && !res.getHeader('ETag')) {
        let val: any;
        if ((entry as any).etag) {
        	val = (entry as any).etag;
        } else {
        	val = etag(entry.data);
        	(entry as any).etag = val;
        }
      debug('etag %s', val)
      res.setHeader('ETag', val)
    }
  }

  sendFile (path: string) {
    var i = 0
    var self = this
    
    debug('stat "%s"', path)
    const entry = this.extractedZip.get(path.replace(/\\/g, '/'));
    if (entry == null) {
        return next();
    }
    if (entry.isDirectory)
        return self.redirect(path);
    self.emit('file', path, entry);
    self.send(entry);
    // fs.stat(path, function onstat (err, stat) {
    //   if (err && err.code === 'ENOENT' && !extname(path) && path[path.length - 1] !== sep) {
    // 	// not found, check extensions
    // 	return next(err)
    //   }
    //   if (err) return self.onStatError(err)
    //   if (stat.isDirectory()) return self.redirect(path)
    //   self.emit('file', path, stat)
    //   self.send(path, stat)
    // })
    
    function next (err?: Error): any {
        if (self._extensions.length <= i) {
        	return err
        	? self.onStatError(err)
        	: self.error(404)
        }
    
        var p = path + '.' + self._extensions[i++]
    
        debug('stat "%s"', p)
        const entry = self.extractedZip.get(p.replace(/\\/g, '/'));
        if (entry == null) {
        	return next();
        }
        if (entry.isDirectory)
        	return self.redirect(path);
        self.emit('file', p, entry);
        self.send(entry);
        //   fs.stat(p, function (err, stat) {
        // 	if (err) return next(err)
        // 	if (stat.isDirectory()) return next()
        // 	self.emit('file', p, stat)
        // 	self.send(p, stat)
        //   })
    }
  }
  stream(entry: CacheEntry, options: {
		start?: number; end?: number;
	}) {
    // TODO: this is all lame, refactor meeee
    var finished = false;
    var self = this;
    var res = this.res;
    
    res.end(entry.data);
    res.on('finish', () => self.emit('end'));

		// TODO: support range read from buffer
	
    // pipe
    // var stream = fs.createReadStream(path, options)
    // this.emit('stream', stream)
    // stream.pipe(res)
    
    // // response finished, done with the fd
    // onFinished(res, function onfinished () {
    //   finished = true
    //   destroy(stream)
    // })
    
    // // error handling code-smell
    // stream.on('error', function onerror (err) {
    //   // request already finished
    //   if (finished) return
    
    //   // clean up stream
    //   finished = true
    //   destroy(stream)
    
    //   // error
    //   self.onStatError(err)
    // })
    
    // // end
    // stream.on('end', function onend () {
    //   self.emit('end')
    // })
  }
}
/**
 * Clear all headers from a response.
 *
 * @param {object} res
 * @private
 */

function clearHeaders (res: Response) {
  var headers = getHeaderNames(res)
  
  for (var i = 0; i < headers.length; i++) {
    res.removeHeader(headers[i])
  }
  }
  
  /**
   * Collapse all leading slashes into a single slash
   *
   * @param {string} str
   * @private
   */
  function collapseLeadingSlashes (str: string) {
  for (var i = 0; i < str.length; i++) {
    if (str[i] !== '/') {
    break
    }
  }
  
  return i > 1
    ? '/' + str.substr(i)
    : str
  }
  
  /**
   * Determine if path parts contain a dotfile.
   *
   * @api private
   */
  
  function containsDotFile (parts: string[]) {
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i]
    if (part.length > 1 && part[0] === '.') {
    return true
    }
  }
  
  return false
  }
  
  /**
   * Create a Content-Range header.
   *
   * @param {string} type
   * @param {number} size
   * @param {array} [range]
   */
  
  function contentRange (type: string, size: number, range?: {start: number, end: number}) {
  return type + ' ' + (range ? range.start + '-' + range.end : '*') + '/' + size
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
   * decodeURIComponent.
   *
   * Allows V8 to only deoptimize this fn instead of all
   * of send().
   *
   * @param {String} path
   * @api private
   */
  
  function decode (path: string) {
  try {
    return decodeURIComponent(path)
  } catch (err) {
    return -1
  }
  }
  
  /**
   * Get the header names on a respnse.
   *
   * @param {object} res
   * @returns {array[string]}
   * @private
   */
  
  function getHeaderNames (res: Response) {
  return typeof res.getHeaderNames !== 'function'
    ? Object.keys((res as any)._headers || {})
    : res.getHeaderNames()
  }
  
  /**
   * Determine if emitter has listeners of a given type.
   *
   * The way to do this check is done three different ways in Node.js >= 0.8
   * so this consolidates them into a minimal set using instance methods.
   *
   * @param {EventEmitter} emitter
   * @param {string} type
   * @returns {boolean}
   * @private
   */
  
  function hasListeners (emitter: EventEmitter, type: string) {
  var count = typeof emitter.listenerCount !== 'function'
    ? emitter.listeners(type).length
    : emitter.listenerCount(type)
  
  return count > 0
  }
  
  /**
   * Determine if the response headers have been sent.
   *
   * @param {object} res
   * @returns {boolean}
   * @private
   */
  
  function headersSent (res: Response) {
  return typeof res.headersSent !== 'boolean'
    ? Boolean((res as any)._header)
    : res.headersSent
  }
  
  /**
   * Normalize the index option into an array.
   *
   * @param {boolean|string|array} val
   * @param {string} name
   * @private
   */
  
  function normalizeList (val: boolean | string|string[], name: string) {
  var list = [].concat(val || [])
  
  for (var i = 0; i < list.length; i++) {
    if (typeof list[i] !== 'string') {
    throw new TypeError(name + ' must be array of strings or false')
    }
  }
  
  return list
  }
  
  /**
   * Parse an HTTP Date into a number.
   *
   * @param {string} date
   * @private
   */
  
  function parseHttpDate (date: string) {
  var timestamp = date && Date.parse(date)
  
  return typeof timestamp === 'number'
    ? timestamp
    : NaN
  }
  
  /**
   * Parse a HTTP token list.
   *
   * @param {string} str
   * @private
   */
  
  function parseTokenList (str: string) {
  var end = 0
  var list = []
  var start = 0
  
  // gather tokens
  for (var i = 0, len = str.length; i < len; i++) {
    switch (str.charCodeAt(i)) {
    case 0x20: /*   */
      if (start === end) {
        start = end = i + 1
      }
      break
    case 0x2c: /* , */
      list.push(str.substring(start, end))
      start = end = i + 1
      break
    default:
      end = i + 1
      break
    }
  }
  
  // final token
  list.push(str.substring(start, end))
  
  return list
  }
  
  /**
   * Set an object of headers on a response.
   *
   * @param {object} res
   * @param {object} headers
   * @private
   */
  
  function setHeaders (res: Response, headers: {[k: string]: string}) {
  var keys = Object.keys(headers)
  
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i]
    res.setHeader(key, headers[key])
  }
  }
