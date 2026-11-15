import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySignedOutReport, classifyForeignOrigin } from '../scripts/public-security-audit.mjs';

test('owner-only reports refuse unsigned requests', () => {
  assert.equal(classifySignedOutReport(401,'application/json').state,'pass');
  assert.equal(classifySignedOutReport(403,'application/json').state,'pass');
});

test('unexpected public JSON owner report is a critical issue', () => {
  const result=classifySignedOutReport(200,'application/json');
  assert.equal(result.state,'needs-attention');
  assert.equal(result.critical,true);
});

test('a generic HTML login page is not evidence of exposure', () => {
  assert.equal(classifySignedOutReport(200,'text/html',true).state,'unverified');
  assert.equal(classifySignedOutReport(502,'text/html').state,'unverified');
});

test('untrusted origin preflight may not grant browser access', () => {
  const origin='https://security-probe.invalid';
  assert.equal(classifyForeignOrigin(403,'',origin).state,'pass');
  assert.equal(classifyForeignOrigin(204,'',origin).state,'pass');
});

test('wildcard or echoed hostile Origin is a critical CORS flag', () => {
  const origin='https://security-probe.invalid';
  assert.equal(classifyForeignOrigin(204,'*',origin).critical,true);
  assert.equal(classifyForeignOrigin(204,origin,origin).critical,true);
});

test('ambiguous response remains unverified', () => {
  assert.equal(classifyForeignOrigin(500,'','https://security-probe.invalid').state,'unverified');
  assert.equal(classifyForeignOrigin(204,'https://other.example','https://security-probe.invalid').state,'unverified');
});
