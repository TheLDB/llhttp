'use strict';
/* globals describe it before */

const path = require('path');
const llparse = require('llparse');
const fixtures = require('./fixtures');

const http = require('../');

describe('http_parser/http', function() {
  this.timeout(fixtures.TIMEOUT);

  const test = (mode) => {
    let url;
    before(() => {
      const p = llparse.create();

      const instance = new http.HTTP(p, mode === 'strict');

      const result = instance.build();

      // Loop
      result.exit.restart.otherwise(result.entry.req);

      url = fixtures.build(p, result.entry.req, 'http-req-' + mode, {
        extra: [
          '-DHTTP_PARSER__TEST_HTTP',
          path.join(__dirname, '..', 'src', 'http.c')
        ]
      });
    });

    it('should parse simple request', (callback) => {
      const req =
        'OPTIONS /url HTTP/1.1\r\n' +
        'Header1: Value1\r\n' +
        'Header2:\t Value2\r\n' +
        '\r\n';

      const expected = [
        'off=8 len=4 span[url]="/url"',
        'off=23 len=7 span[header_field]="Header1"',
        'off=32 len=6 span[header_value]="Value1"',
        'off=40 len=7 span[header_field]="Header2"',
        'off=50 len=6 span[header_value]="Value2"',
        `off=${req.length} headers complete method=6 v=1/1 ` +
          'flags=0 content_length=0',
        `off=${req.length} message complete`
      ];

      url(req, expected, callback);
    });

    describe('content-length', () => {
      it('should parse content-length', (callback) => {
        const req =
          'PUT /url HTTP/1.1\r\n' +
          'Content-Length: 003\r\n' +
          '\r\n' +
          'abc';

        const expected = [
          'off=4 len=4 span[url]="/url"',
          'off=19 len=14 span[header_field]="Content-Length"',
          'off=35 len=3 span[header_value]="003"',
          'off=42 headers complete method=4 v=1/1 flags=20 content_length=3',
          'off=42 len=3 span[body]="abc"',
          `off=${req.length} message complete`
        ];

        url(req, expected, callback);
      });

      it('should handle content-length overflow', (callback) => {
        const req =
          'PUT /url HTTP/1.1\r\n' +
          'Content-Length: 1000000000000000000000\r\n' +
          '\r\n';

        const expected = [
          'off=4 len=4 span[url]="/url"',
          'off=19 len=14 span[header_field]="Content-Length"',
          'off=35 len=21 span[header_value]="100000000000000000000"',
          'off=56 error code=9 reason="Content-Length overflow"'
        ];

        url(req, expected, callback);
      });

      it('should handle duplicate content-length', (callback) => {
        const req =
          'PUT /url HTTP/1.1\r\n' +
          'Content-Length: 1\r\n' +
          'Content-Length: 2\r\n' +
          '\r\n';

        const expected = [
          'off=4 len=4 span[url]="/url"',
          'off=19 len=14 span[header_field]="Content-Length"',
          'off=35 len=1 span[header_value]="1"',
          'off=38 len=14 span[header_field]="Content-Length"',
          'off=54 error code=10 reason="Duplicate Content-Length"'
        ];

        url(req, expected, callback);
      });
    });

    describe('transfer-encoding', () => {
      it('should parse `transfer-encoding: chunked`', (callback) => {
        const req =
          'PUT /url HTTP/1.1\r\n' +
          'Transfer-Encoding: chunked\r\n' +
          '\r\n';

        const expected = [
          'off=4 len=4 span[url]="/url"',
          'off=19 len=17 span[header_field]="Transfer-Encoding"',
          'off=38 len=7 span[header_value]="chunked"',
          `off=${req.length} headers complete method=4 v=1/1 ` +
            'flags=8 content_length=0'
        ];

        url(req, expected, callback);
      });

      it('should ignore `transfer-encoding: pigeons`', (callback) => {
        const req =
          'PUT /url HTTP/1.1\r\n' +
          'Transfer-Encoding: pigeons\r\n' +
          '\r\n';

        const expected = [
          'off=4 len=4 span[url]="/url"',
          'off=19 len=17 span[header_field]="Transfer-Encoding"',
          'off=38 len=7 span[header_value]="pigeons"',
          `off=${req.length} headers complete method=4 v=1/1 ` +
            'flags=0 content_length=0',
          `off=${req.length} message complete`
        ];

        url(req, expected, callback);
      });
    });

    describe('connection', () => {
      it('should parse `connection: keep-alive`', (callback) => {
        const req =
          'PUT /url HTTP/1.1\r\n' +
          'Connection: keep-alive\r\n' +
          '\r\n';

        const expected = [
          'off=4 len=4 span[url]="/url"',
          'off=19 len=10 span[header_field]="Connection"',
          'off=31 len=10 span[header_value]="keep-alive"',
          `off=${req.length} headers complete method=4 v=1/1 ` +
            'flags=1 content_length=0',
          `off=${req.length} message complete`
        ];

        url(req, expected, callback);
      });

      it('should parse `connection: close`', (callback) => {
        const req =
          'PUT /url HTTP/1.1\r\n' +
          'Connection: close\r\n' +
          '\r\n';

        const expected = [
          'off=4 len=4 span[url]="/url"',
          'off=19 len=10 span[header_field]="Connection"',
          'off=31 len=5 span[header_value]="close"',
          `off=${req.length} headers complete method=4 v=1/1 ` +
            'flags=2 content_length=0',
          `off=${req.length} message complete`
        ];

        url(req, expected, callback);
      });

      it('should parse `connection: upgrade`', (callback) => {
        const req =
          'PUT /url HTTP/1.1\r\n' +
          'Connection: upgrade\r\n' +
          'Upgrade: ws\r\n' +
          '\r\n';

        const expected = [
          'off=4 len=4 span[url]="/url"',
          'off=19 len=10 span[header_field]="Connection"',
          'off=31 len=7 span[header_value]="upgrade"',
          'off=40 len=7 span[header_field]="Upgrade"',
          'off=49 len=2 span[header_value]="ws"',
          `off=${req.length} headers complete method=4 v=1/1 ` +
            'flags=14 content_length=0',
          `off=${req.length} message complete`,
          `off=${req.length} pause`
        ];

        url(req, expected, callback);
      });

      it('should parse `connection: tokens`', (callback) => {
        const req =
          'PUT /url HTTP/1.1\r\n' +
          'Connection: close, token, upgrade, token, keep-alive\r\n' +
          '\r\n';

        const expected = [
          'off=4 len=4 span[url]="/url"',
          'off=19 len=10 span[header_field]="Connection"',
          'off=31 len=40 span[header_value]="close, token, upgrade, token, ' +
            'keep-alive"',
          `off=${req.length} headers complete method=4 v=1/1 ` +
            'flags=7 content_length=0',
          `off=${req.length} message complete`,
        ];

        url(req, expected, callback);
      });
    });

    it('should not allow content-length with chunked', (callback) => {
      const req =
        'PUT /url HTTP/1.1\r\n' +
        'Content-Length: 1\r\n' +
        'Transfer-Encoding: chunked\r\n' +
        '\r\n';

      const expected = [
        'off=4 len=4 span[url]="/url"',
        'off=19 len=14 span[header_field]="Content-Length"',
        'off=35 len=1 span[header_value]="1"',
        'off=38 len=17 span[header_field]="Transfer-Encoding"',
        'off=57 len=7 span[header_value]="chunked"',
        `off=${req.length} error code=10 reason="Content-Length can't ` +
          'be present with chunked encoding"'
      ];

      url(req, expected, callback);
    });
  };

  [
    'loose',
    'strict'
  ].forEach((mode) => {
    describe(mode, () => test(mode));
  });
});
