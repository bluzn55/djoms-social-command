// Read-only public security evidence for the Doc Jaks morning scanner.
// Never interpret a CORS or login-gate check as proof of overall protection.
export function classifySignedOutReport(status, contentType = '', redirected = false) {
  if (status === 401 || status === 403) {
    return {
      state: 'pass',
      detail: 'Signed-out request rejected (HTTP ' + status +
        '). Access control was observed on this route, not a full penetration test.'
    };
  }
  if (status === 200 && !redirected && /application\/json/i.test(contentType)) {
    return {
      state: 'needs-attention',
      critical: true,
      detail: 'Owner-only report returned HTTP 200 JSON to a signed-out request. Review access control immediately.'
    };
  }
  return {
    state: 'unverified',
    detail: 'Unexpected signed-out response HTTP ' + status +
      (redirected ? ' after redirect' : '') +
      '. Login-page redirects, HTML and gateway errors cannot establish whether owner-only data is protected.'
  };
}

export function classifyForeignOrigin(status, allowOrigin = '', attemptedOrigin = '') {
  const allowed = String(allowOrigin || '').trim();
  if (allowed === '*' || allowed === attemptedOrigin) {
    return {
      state: 'needs-attention',
      critical: true,
      detail: 'Foreign Origin was allowed by Access-Control-Allow-Origin. Investigate CORS configuration.'
    };
  }
  if (!allowed && (status === 400 || status === 401 || status === 403 || status === 204)) {
    return {
      state: 'pass',
      detail: 'Foreign Origin was not granted browser cross-origin access (HTTP ' + status +
        '). This does not stop scripted HTTP requests outside browsers.'
    };
  }
  return {
    state: 'unverified',
    detail: 'Foreign-origin preflight returned HTTP ' + status +
      ', with Access-Control-Allow-Origin=' + (allowed || '(not present)') +
      '. Cross-origin access could not be classified safely.'
  };
}
