'use strict';
(() => {
  const VIEW = 'Reports & Filing';
  const ZONE = 'America/Chicago';
  const jurisdictions = { city: 'City', parish: 'Parish', state: 'State', federal: 'Federal' };
  const jurisdictionOf = report => Object.hasOwn(jurisdictions, report?.jurisdiction) ? report.jurisdiction : 'unassigned';
  const jurisdictionLabel = report => jurisdictions[jurisdictionOf(report)] || 'To classify';
  const frequencies = { monthly: 'Monthly', every_two_months: 'Every two months', twice_monthly: 'Twice a month', yearly: 'Yearly', one_time: 'One time' };
  const statusNames = { draft: 'Draft', ready: 'Awaiting approval', approved: 'Approved', sending: 'Sending', sent: 'Email sent', filed: 'Filing recorded', failed: 'Needs attention', uncertain: 'Check submission' };
  const methods = { unconfigured: 'Choose delivery method', email: 'Email after approval', portal: 'Filing website', manual: 'File manually' };
  const completed = r => ['sent', 'filed'].includes(r.status);
  const locked = r => ['sending', 'sent', 'filed', 'uncertain'].includes(r.status);
  const state = { reports: [], delivery: { emailConfigured: false }, loaded: false, loading: false, saving: false, error: '', mode: 'list', current: null, section: 'all', filter: 'all', search: '', changed: false, nextDates: {}, receiptDraft: {}, receiptOpen: false };
  let generation = 0;
  const e = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const visible = () => typeof activeView !== 'undefined' && activeView === VIEW;
  const host = () => document.getElementById('content');
  const copy = value => JSON.parse(JSON.stringify(value));
  function today() { const parts = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); return ['year', 'month', 'day'].map(key => parts.find(p => p.type === key).value).join('-'); }
  function displayDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? new Date(value + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : 'Not entered'; }
  function displayTime(value) { if (/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return displayDate(value); const dt = new Date(value); return Number.isFinite(dt.getTime()) ? dt.toLocaleString('en-US', { timeZone: ZONE, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' CT' : 'Not recorded'; }
  function dueDays(r) { return /^\d{4}-\d{2}-\d{2}$/.test(r.dueDate || '') ? Math.round((Date.parse(r.dueDate + 'T12:00:00Z') - Date.parse(today() + 'T12:00:00Z')) / 86400000) : null; }
  function dueText(r) { const n = dueDays(r); return n === null ? 'Set a due date' : n < 0 ? Math.abs(n) + ' day' + (n === -1 ? '' : 's') + ' overdue' : n === 0 ? 'Due today' : n === 1 ? 'Due tomorrow' : 'Due in ' + n + ' days'; }
  function setDirty(value) { state.changed = value; if (typeof dirty !== 'undefined') dirty = value; }
  function blank(section = state.section) { return { name: '', jurisdiction: Object.hasOwn(jurisdictions, section) ? section : 'unassigned', amountDue: '', frequency: 'monthly', periodStart: '', periodEnd: '', dueDate: '', recipientName: '', deliveryMethod: 'unconfigured', recipientEmail: '', portalUrl: '', subject: '', notes: '', fields: [{ label: '', value: '', required: false }] }; }
  function badge(r) { return '<span class="rf-status rf-status-' + e(r.status || 'draft') + '">' + e(statusNames[r.status] || 'Draft') + '</span>'; }
  function optionList(values, selected) { return Object.entries(values).map(([value, label]) => '<option value="' + e(value) + '"' + (value === selected ? ' selected' : '') + '>' + e(label) + '</option>').join(''); }
  function button(action, label, className = '', extra = '') { return '<button type="button" data-report-action="' + e(action) + '" class="rf-button ' + className + '" ' + extra + '>' + label + '</button>'; }
  function heading() { const backLabel = state.section === 'all' ? 'All reports' : jurisdictions[state.section] ? 'Back to ' + jurisdictions[state.section].toLowerCase() + ' reports' : 'Reports to classify'; return '<div class="rf-heading"><div class="rf-station-title"><span class="rf-eyebrow">DOC JAKS · REPORTING STATION</span><h2>Reports &amp; Filing</h2><p>Monthly · Every two months · Twice a month · Yearly</p></div><div class="rf-heading-actions">' + (state.mode === 'list' ? button('new', '+ Add report', 'rf-primary') : button('back', backLabel)) + '</div></div>'; }
  function setupNote() { return '<div class="rf-setup"><span class="rf-shield" aria-hidden="true">✓</span><div><strong>Your approval controls sending.</strong><p>Each report keeps its own dates, information, and history. Email reports send when you choose <b>Approve &amp; send</b>. Filing websites use their own submission process.</p></div></div>'; }
  function scopedReports() { return state.section === 'all' ? state.reports : state.reports.filter(r => jurisdictionOf(r) === state.section); }
  function reportCounts(list) {
    const outstanding = list.filter(r => !completed(r));
    return {
      total: list.length,
      overdue: outstanding.filter(r => dueDays(r) !== null && dueDays(r) < 0).length,
      soon: outstanding.filter(r => dueDays(r) !== null && dueDays(r) >= 0 && dueDays(r) <= 30).length,
      review: list.filter(r => r.status === 'ready').length,
      finished: list.filter(completed).length
    };
  }
  function amountText(report) {
    const value = String(report.amountDue ?? '').trim();
    if (!value || !/^\d+(?:\.\d{1,2})?$/.test(value)) return 'Not entered';
    const number = Number(value);
    return Number.isFinite(number) ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(number) : 'Not entered';
  }
  function sentState(report) {
    return ({ sent: 'Email sent', filed: 'Filing recorded', sending: 'Sending', uncertain: 'Check submission' })[report.status] || 'Not sent';
  }
  function gaugeButton(key) {
    const label = jurisdictions[key];
    const counts = reportCounts(state.reports.filter(r => jurisdictionOf(r) === key));
    return '<button type="button" class="rf-section-card" data-report-action="section" data-report-section="' + key + '" aria-label="' + label + ': view full history of ' + counts.total + ' reports"><span class="rf-gauge" aria-hidden="true"><img class="rf-gauge-art" src="/assets/reports-brass-gauge.png" alt="" width="1254" height="1254" decoding="async"><svg class="rf-gauge-label" viewBox="0 0 400 400" focusable="false"><defs><path id="rfGaugeArc-' + key + '" d="M 88,130 Q 200,56 312,130"></path></defs><text><textPath href="#rfGaugeArc-' + key + '" startOffset="50%" text-anchor="middle">' + label.toUpperCase() + '</textPath></text></svg><span class="rf-gauge-value"><strong>' + counts.total + '</strong><small>REPORT' + (counts.total === 1 ? '' : 'S') + '</small></span></span></button>';
  }
  function frontReports(key) {
    return state.reports.filter(r => jurisdictionOf(r) === key).slice().sort((a, b) => {
      const finishedOrder = Number(completed(a)) - Number(completed(b));
      if (finishedOrder) return finishedOrder;
      if (completed(a)) return String(b.periodEnd || b.updatedAt || '').localeCompare(String(a.periodEnd || a.updatedAt || '')) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
      return String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    }).slice(0, 5);
  }
  function summaryRow(report) {
    return '<article class="rf-summary-row">' + button('open', e(report.name || 'Untitled report'), 'rf-summary-report', 'data-report-id="' + e(report.id) + '"') + '<dl class="rf-summary-details"><div><dt>Due date</dt><dd' + (!completed(report) && dueDays(report) !== null && dueDays(report) < 0 ? ' class="rf-overdue-text"' : '') + '>' + e(displayDate(report.dueDate)) + '</dd></div><div><dt>Sent status</dt><dd><span class="rf-summary-status rf-summary-status-' + e(report.status) + '">' + e(sentState(report)) + '</span></dd></div><div class="rf-summary-amount"><dt>Amount due</dt><dd>' + e(amountText(report)) + '</dd></div></dl></article>';
  }
  function landingMarkup() {
    const unassigned = state.reports.filter(r => jurisdictionOf(r) === 'unassigned').length;
    return '<section class="rf-sections rf-landing" aria-label="Government report sections"><div class="rf-section-toolbar"><div><span class="rf-eyebrow">FOUR REPORT SECTIONS</span><p>Click a gauge to open that section’s full reporting history.</p></div><div>' + button('refresh', 'Refresh', '', state.loading ? 'disabled' : '') + '</div></div><div class="rf-section-cards">' + Object.entries(jurisdictions).map(([key, label]) => {
      const list = frontReports(key);
      const total = state.reports.filter(r => jurisdictionOf(r) === key).length;
      return '<section class="rf-landing-column" data-report-group="' + key + '" aria-label="' + label + ' reports">' + gaugeButton(key) + '<div class="rf-section-ledger"><div class="rf-ledger-heading"><h3 class="rf-section-name">' + label + ' reports</h3>' + button('new', '+ Add', 'rf-ledger-add', 'data-report-section="' + key + '" aria-label="Add ' + label.toLowerCase() + ' report"') + '</div>' + (list.length ? list.map(summaryRow).join('') : '<p class="rf-ledger-empty">No reports added yet.</p>') + '<div class="rf-ledger-footer">' + (total > list.length ? '<span>Showing ' + list.length + ' of ' + total + '</span>' : '') + button('section', 'View full history (' + total + ')', '', 'data-report-section="' + key + '"') + '</div></div></section>';
    }).join('') + '</div>' + (unassigned ? '<div class="rf-classify-note"><span>' + unassigned + ' report' + (unassigned === 1 ? ' needs' : 's need') + ' a government level.</span>' + button('section', 'To classify (' + unassigned + ')', 'rf-classify-button', 'data-report-section="unassigned"') + '</div>' : '') + '</section>' + setupNote() + '<p class="rf-footnote">Each section shows up to five reports, with unfinished reports first. Open its full history for every saved period.</p>';
  }
  function reportTable(list, label) {
    return '<div class="rf-table-wrap"><table class="rf-table" aria-label="' + e(label) + ' reports"><thead><tr><th scope="col">Report</th><th scope="col">Reporting period</th><th scope="col">Due date</th><th scope="col">Status</th><th scope="col">Amount due</th><th scope="col"><span class="rf-sr">Open report</span></th></tr></thead><tbody>' + list.map(r => '<tr><td><strong>' + e(r.name || 'Untitled report') + '</strong><span class="rf-subline">' + e(frequencies[r.frequency] || 'Schedule not set') + (r.recipientName ? ' · ' + e(r.recipientName) : '') + '</span></td><td>' + e(displayDate(r.periodStart)) + '<span class="rf-subline">through ' + e(displayDate(r.periodEnd)) + '</span></td><td><strong>' + e(displayDate(r.dueDate)) + '</strong><span class="rf-subline ' + (!completed(r) && dueDays(r) < 0 && dueDays(r) !== null ? 'rf-overdue-text' : '') + '">' + (!completed(r) ? e(dueText(r)) : 'Completed period') + '</span></td><td>' + badge(r) + '</td><td class="rf-amount-cell">' + e(amountText(r)) + '</td><td>' + button('open', 'Open', '', 'data-report-id="' + e(r.id) + '"') + '</td></tr>').join('') + '</tbody></table></div>';
  }
  function reportGroup(key, list) {
    const label = jurisdictions[key] || 'To classify';
    const total = state.reports.filter(r => jurisdictionOf(r) === key).length;
    const selected = list.filter(r => jurisdictionOf(r) === key);
    const isClassify = key === 'unassigned';
    return '<section class="rf-panel rf-report-group" data-report-group="' + key + '" aria-labelledby="rfGroup-' + key + '"><div class="rf-group-heading"><div><h3 id="rfGroup-' + key + '">' + e(label) + (isClassify ? '' : ' reports') + '</h3><p>' + (isClassify ? 'Open each report and choose its government level.' : selected.length + ' of ' + total + ' report' + (total === 1 ? '' : 's') + ' shown') + '</p></div>' + (!isClassify ? button('new', '+ Add ' + label.toLowerCase() + ' report', '', 'data-report-section="' + key + '"') : '') + '</div>' +
      (selected.length ? reportTable(selected, label) : '<div class="rf-group-empty"><p>' + (total ? 'No reports match the current filters in this section.' : isClassify ? 'All reports have a government level.' : 'No ' + label.toLowerCase() + ' reports added yet.') + '</p></div>') + '</section>';
  }
  function listMarkup() {
    if (state.section === 'all') return landingMarkup();
    const scoped = scopedReports();
    let list = scoped.filter(r => state.filter === 'all' || (state.filter === 'attention' ? ['failed', 'uncertain'].includes(r.status) || (!completed(r) && dueDays(r) < 0 && dueDays(r) !== null) : state.filter === 'ready' ? r.status === 'ready' : r.frequency === state.filter));
    const search = state.search.trim().toLowerCase();
    if (search) list = list.filter(r => [r.name, r.recipientName, r.recipientEmail].join(' ').toLowerCase().includes(search));
    list.sort((a, b) => Number(completed(a)) - Number(completed(b)) || String(b.periodEnd || '').localeCompare(String(a.periodEnd || '')) || String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    const sectionTitle = state.section === 'unassigned' ? 'Reports to classify' : jurisdictions[state.section] + ' · Full report history';
    return '<div class="rf-history-navigation">' + button('section', 'All sections', 'rf-section-all', 'data-report-section="all"') + '<p>Every saved reporting period stays in this section.</p></div><div class="rf-scope-heading"><h3 id="rfHistoryTitle" tabindex="-1">' + e(sectionTitle) + '</h3><span>' + scoped.length + ' saved period' + (scoped.length === 1 ? '' : 's') + '</span></div>' +
      '<section class="rf-panel rf-filter-panel"><div class="rf-list-tools"><label>Find a report<input type="search" id="rfSearch" placeholder="Report or recipient" value="' + e(state.search) + '"></label><label>Show<select id="rfFilter">' + optionList({ all: 'All frequencies', ready: 'Awaiting approval', attention: 'Needs attention', ...frequencies }, state.filter) + '</select></label>' + button('refresh', 'Refresh', '', state.loading ? 'disabled' : '') + '</div></section>' +
      reportGroup(state.section, list) + setupNote() + '<p class="rf-footnote">Amounts due are entered in US dollars. A blank amount stays unknown. Dates use Central Time.</p>';
  }
  function input(name, label, value, opts = '') { return '<label>' + label + '<input name="' + name + '" value="' + e(value) + '" ' + opts + '></label>'; }
  function fieldsMarkup(r) { return (r.fields || []).map((field, index) => '<div class="rf-field-row" data-report-field="' + index + '"><label>Field name<input data-rf-field-label maxlength="160" value="' + e(field.label) + '" placeholder="Name on your report"></label><label>Value<textarea data-rf-field-value rows="2" maxlength="4000" placeholder="Enter information">' + e(field.value) + '</textarea></label><label class="rf-check"><input type="checkbox" data-rf-field-required ' + (field.required ? 'checked' : '') + '> Required</label>' + button('remove-field', 'Remove', 'rf-text-button', 'data-field-index="' + index + '" aria-label="Remove field ' + (index + 1) + '"') + '</div>').join(''); }
  function editMarkup() {
    const r = state.current || blank();
    const method = r.deliveryMethod || 'unconfigured';
    return '<form id="rfEditForm" class="rf-form"><section class="rf-panel"><div class="rf-panel-heading"><div><span class="rf-eyebrow">' + (r.id ? 'EDIT REPORT' : 'NEW REPORT') + '</span><h3>' + e(r.name || 'Report details') + '</h3></div>' + badge({ status: 'draft' }) + '</div><div class="rf-form-grid">' +
      input('name', 'Report name', r.name, 'maxlength="160" required placeholder="Name of the report"') +
      '<label>Government level<select name="jurisdiction">' + optionList({ unassigned: 'Choose city, parish, state, or federal', ...jurisdictions }, jurisdictionOf(r)) + '</select></label>' +
      '<label>How often<select name="frequency">' + optionList(frequencies, r.frequency) + '</select></label>' +
      input('periodStart', 'Period starts', r.periodStart, 'type="date"') + input('periodEnd', 'Period ends', r.periodEnd, 'type="date"') +
      input('dueDate', 'Due date for this report', r.dueDate, 'type="date"') + input('amountDue', 'Amount due (USD)', r.amountDue, 'type="number" min="0" max="999999999.99" step="0.01" placeholder="Not entered"') + input('recipientName', 'Recipient or organization', r.recipientName, 'maxlength="160" placeholder="Who receives this report"') + '</div><p class="rf-help">“Every two months” and “twice a month” are separate schedules. Enter the exact deadline for this reporting period.</p></section>' +
      '<section class="rf-panel"><div class="rf-panel-heading"><div><h3>Report information</h3><p>Add the fields from your report. A blank value stays blank.</p></div>' + button('add-field', '+ Add field') + '</div><div class="rf-fields">' + fieldsMarkup(r) + '</div><label class="rf-notes">Report notes (included in the submission)<textarea name="notes" rows="4" maxlength="12000" placeholder="Additional information to include in this report">' + e(r.notes) + '</textarea></label></section>' +
      '<section class="rf-panel"><div class="rf-panel-heading"><div><h3>Delivery</h3><p>Choose how this report is submitted.</p></div></div><div class="rf-form-grid"><label>Submission method<select name="deliveryMethod" id="rfDeliveryMethod">' + optionList(methods, method) + '</select></label>' +
      (method === 'email' ? input('recipientEmail', 'Recipient email', r.recipientEmail, 'type="email" maxlength="254" placeholder="name@example.com"') + input('subject', 'Email subject', r.subject, 'maxlength="200" placeholder="Report name and period"') : method === 'portal' ? input('portalUrl', 'Filing website', r.portalUrl, 'type="url" maxlength="1000" placeholder="https://"') : '') + '</div>' +
      (method === 'email' ? '<p class="rf-help">The review screen shows the email before you approve sending. ' + (state.delivery.emailConfigured ? '' : 'The email connection still needs setup.') + '</p>' : method === 'portal' ? '<p class="rf-help">Review and approve here, then open the filing website. Record its confirmation after submission.</p>' : '') + '</section>' +
      '<div class="rf-editor-footer"><p>' + (r.id && ['approved', 'ready'].includes(r.status) ? 'Saving changes returns this report to draft for a fresh review.' : 'Save a draft now. Review when all required information is entered.') + '</p><div><button type="submit" class="rf-button"' + (state.saving ? ' disabled' : '') + '>Save draft</button>' + button('save-review', 'Save &amp; review', 'rf-primary', state.saving ? 'disabled' : '') + '</div></div></form>';
  }
  function previewDetails(r) {
    const delivery = r.deliveryMethod === 'email' ? r.recipientEmail || 'Not entered' : r.deliveryMethod === 'portal' ? r.portalUrl || 'Not entered' : methods[r.deliveryMethod] || 'Not configured';
    return '<div class="rf-preview-grid"><div><span>Government level</span><strong>' + e(jurisdictionLabel(r)) + '</strong></div><div><span>Reporting period</span><strong>' + e(displayDate(r.periodStart)) + ' – ' + e(displayDate(r.periodEnd)) + '</strong></div><div><span>Due date</span><strong>' + e(displayDate(r.dueDate)) + '</strong></div><div><span>Amount due</span><strong>' + e(amountText(r)) + '</strong></div><div><span>Frequency</span><strong>' + e(frequencies[r.frequency] || 'Not set') + '</strong></div><div><span>Recipient</span><strong>' + e(r.recipientName || 'Not entered') + '</strong></div><div class="rf-wide"><span>' + (r.deliveryMethod === 'email' ? 'Send to' : 'Submission method') + '</span><strong>' + e(delivery) + '</strong></div></div><dl class="rf-values">' + (r.fields || []).map(field => '<div><dt>' + e(field.label || 'Unnamed field') + (field.required ? ' <span class="rf-required">Required</span>' : '') + '</dt><dd>' + (String(field.value ?? '').trim() ? e(field.value) : '<span class="rf-not-entered">Not entered</span>') + '</dd></div>').join('') + '</dl>' + (r.notes ? '<div class="rf-report-notes"><h4>Report notes</h4><p>' + e(r.notes) + '</p></div>' : '');
  }
  function emailMarkup(r) {
    if (r.deliveryMethod !== 'email') return '';
    const preview = r.emailPreview;
    return '<section class="rf-panel rf-email-preview"><div class="rf-panel-heading"><div><h3>Email preview</h3><p>This is the version being reviewed.</p></div></div><dl><div><dt>From</dt><dd>' + e(preview?.from || 'Sender setup needed') + '</dd></div><div><dt>To</dt><dd>' + e(preview?.to || r.recipientEmail || 'Not entered') + '</dd></div><div><dt>Subject</dt><dd>' + e(preview?.subject || r.subject || r.name) + '</dd></div></dl>' + (preview?.text ? '<pre>' + e(preview.text) + '</pre>' : '<p>The report information shown above will be included in the email.</p>') + '</section>';
  }
  function reviewActions(r) {
    if (state.saving) return '<p class="rf-processing" role="status">Saving the result… Please keep this page open.</p>';
    if (r.status === 'sending') return '<div class="rf-action-note"><strong>Sending is in progress.</strong><p>Refresh to check the saved result before trying another action.</p>' + button('refresh', 'Check result') + '</div>';
    if (r.status === 'uncertain') return '<div class="rf-action-note rf-warning"><strong>The sending result needs checking.</strong><p>Check the recipient or delivery service before sending again. This report is held to prevent a duplicate.</p>' + button('refresh', 'Refresh result') + '</div>';
    if (completed(r)) return '<div class="rf-action-note rf-success"><strong>' + (r.status === 'sent' ? 'The email service confirmed this send.' : 'A filing confirmation has been recorded.') + '</strong><p>' + (r.status === 'sent' ? 'Email sent is separate from acceptance by the recipient.' : 'The saved confirmation is shown below.') + '</p></div>';
    if (r.status === 'approved') return '<div class="rf-action-note"><strong>This version is approved.</strong><p>' + (r.deliveryMethod === 'email' ? 'Approval is recorded. This report has not been sent.' : 'Complete the submission, then record the confirmation.') + '</p></div>';
    if (r.status === 'ready') {
      const canSend = r.deliveryMethod === 'email' && state.delivery.emailConfigured;
      return '<div class="rf-approval-box"><div><span class="rf-eyebrow">OWNER APPROVAL</span><h3>Review this version before approval.</h3><p>' + (r.deliveryMethod === 'email' ? 'Approve & send emails this report immediately to <strong>' + e(r.recipientEmail) + '</strong>.' : 'Approval records your review. Submit using the report’s filing method, then save the confirmation.') + '</p></div><div>' + (r.deliveryMethod === 'email' ? button('approve-send', 'Approve &amp; send', 'rf-primary', canSend ? '' : 'disabled') + (!state.delivery.emailConfigured ? '<p class="rf-help">Email sending needs connection setup.</p>' : '') : button('approve', 'Approve this report', 'rf-primary')) + '</div></div>';
    }
    return '<div class="rf-action-note"><strong>' + (r.status === 'failed' ? 'Sending needs attention.' : 'Ready to check this draft?') + '</strong><p>' + e(r.deliveryResult?.error || r.lastError || r.error || 'Review the fields, dates, and delivery details before approval.') + '</p>' + button('review', 'Review for approval', 'rf-primary') + '</div>';
  }
  function receiptMarkup(r) {
    const receipt = r.receipt || r.submission;
    const receiptText = receipt ? '<div class="rf-receipt"><h4>Saved confirmation</h4>' + (receipt.providerId || receipt.messageId || receipt.id ? '<p><span>Email service ID</span><strong>' + e(receipt.providerId || receipt.messageId || receipt.id) + '</strong></p>' : '') + (receipt.reference ? '<p><span>' + (receipt.source === 'email' ? 'Email service ID' : 'Confirmation reference') + '</span><strong>' + e(receipt.reference) + '</strong></p>' : '') + (receipt.submittedAt || receipt.sentAt || receipt.at ? '<p><span>Date</span><strong>' + e(displayTime(receipt.submittedAt || receipt.sentAt || receipt.at)) + '</strong></p>' : '') + (receipt.notes ? '<p>' + e(receipt.notes) + '</p>' : '') + '</div>' : '';
    if (!state.receiptOpen) return receiptText;
    const draft = state.receiptDraft;
    return receiptText + '<form id="rfReceiptForm" class="rf-inline-form"><h4>Record a completed submission</h4><div class="rf-form-grid">' + input('reference', 'Confirmation number or receipt reference', draft.reference || '', 'required maxlength="300"') + input('submittedAt', 'Actual submission date', draft.submittedAt || '', 'type="date" max="' + today() + '" required') + '</div><label>Notes<textarea name="receiptNotes" rows="2" maxlength="2000">' + e(draft.notes || '') + '</textarea></label><div class="rf-inline-actions"><button type="submit" class="rf-button rf-primary">Save confirmation</button>' + button('cancel-receipt', 'Cancel') + '</div></form>';
  }
  function historyMarkup(r) {
    const history = Array.isArray(r.history) ? r.history : [];
    return '<details class="rf-history"><summary>Report history <span>' + history.length + ' event' + (history.length === 1 ? '' : 's') + '</span></summary>' + (history.length ? '<ol>' + history.map(item => '<li><strong>' + e(item.message || item.detail || item.action || item.event || item.type || 'Updated') + '</strong><span>' + e(displayTime(item.at || item.timestamp || item.createdAt)) + '</span></li>').join('') + '</ol>' : '<p>New activity will appear here after saving.</p>') + '</details>';
  }
  function nextMarkup(r) { return '<form id="rfNextForm" class="rf-panel rf-form"><span class="rf-eyebrow">NEXT REPORTING PERIOD</span><h3>' + e(r.name) + '</h3><p>Government level: <strong>' + e(jurisdictionLabel(r)) + '</strong>. The report name, field labels, and delivery details are reused. Values and approval start fresh.</p><div class="rf-form-grid">' + input('periodStart', 'New period starts', state.nextDates.periodStart || '', 'type="date" required') + input('periodEnd', 'New period ends', state.nextDates.periodEnd || '', 'type="date" required') + input('dueDate', 'New due date', state.nextDates.dueDate || '', 'type="date" required') + '</div><div class="rf-inline-actions"><button class="rf-button rf-primary" type="submit">Create next draft</button>' + button('cancel-next', 'Cancel') + '</div></form>'; }
  function previewMarkup() {
    const r = state.current;
    if (!r) return listMarkup();
    const portal = r.deliveryMethod === 'portal' && /^https:\/\//i.test(r.portalUrl || '') ? '<a class="rf-button" href="' + e(r.portalUrl) + '" target="_blank" rel="noopener noreferrer">Open filing website</a>' : '';
    const abandonedSend = r.status === 'sending' && Date.now() - Date.parse(r.deliveryResult?.attemptedAt || '') > 180000;
    const canRecordReceipt = ['approved', 'sent', 'failed', 'uncertain'].includes(r.status) || abandonedSend;
    return '<section class="rf-panel rf-report-document"><div class="rf-panel-heading"><div><span class="rf-eyebrow">REPORT REVIEW · VERSION ' + e(r.revision || 1) + '</span><h3>' + e(r.name) + '</h3></div>' + badge(r) + '</div>' + previewDetails(r) + '</section>' + emailMarkup(r) + reviewActions(r) +
      '<section class="rf-panel rf-record-tools"><div class="rf-tool-buttons">' + (!locked(r) ? button('edit', 'Edit report') : '') + button('print', 'Print / save PDF') + portal + (canRecordReceipt ? button('receipt', 'Record filing confirmation') : '') + button('next', 'Prepare next period') + '</div>' + receiptMarkup(r) + historyMarkup(r) + '</section>';
  }
  function redraw() {
    if (!visible() || !host()) return;
    if (state.changed) setDirty(true);
    document.body.classList.add('report-filings-view');
    host().innerHTML = '<div id="reportFilingHub" class="rf-hub" aria-busy="' + String(state.loading || state.saving) + '">' + heading() + (state.error ? '<div class="rf-error" role="alert">' + e(state.error) + '</div>' : '') + (!state.loaded && state.loading ? '<div class="rf-panel rf-loading" role="status">Loading saved reports…</div>' : !state.loaded && state.error ? '<div class="rf-panel"><p>Saved reports could not be loaded. Refresh to try again.</p>' + button('refresh', 'Try again') + '</div>' : state.mode === 'edit' ? editMarkup() : state.mode === 'next' ? nextMarkup(state.current) : state.mode === 'preview' ? previewMarkup() : listMarkup()) + '</div>';
    if (state.saving || state.loading) host().querySelectorAll('#reportFilingHub input, #reportFilingHub select, #reportFilingHub textarea, #reportFilingHub button').forEach(control => { control.disabled = true; });
  }
  async function readAllReports(requestGeneration) {
    const byId = new Map();
    const seen = new Set(['0']);
    let cursor = null;
    let delivery = null;
    do {
      const data = await api('report-filings' + (cursor === null ? '' : '?cursor=' + encodeURIComponent(cursor)));
      if (requestGeneration !== generation) return null;
      if (!Array.isArray(data.reports)) throw new Error('The report list could not be read.');
      if (!delivery && data.delivery) delivery = data.delivery;
      data.reports.forEach(report => { if (report && typeof report.id === 'string') byId.set(report.id, report); });
      const next = data.nextCursor;
      if (next === null || next === undefined) {
        if (data.limited) throw new Error('Only part of the report history was returned. Refresh after the report service update finishes.');
        return { reports: [...byId.values()], delivery: delivery || { emailConfigured: false } };
      }
      if (typeof next !== 'string' || !/^\d+$/.test(next) || seen.has(next)) throw new Error('The report history could not be loaded completely. Refresh to try again.');
      seen.add(next);
      cursor = next;
    } while (true);
  }
  async function load(force = false) {
    if (state.loading || state.saving) return;
    if (state.changed && !force) { redraw(); return; }
    if (state.changed && force) {
      if (!leaveDraft()) return;
      discardDraft();
    }
    const requestGeneration = generation;
    state.loading = true;
    state.error = '';
    redraw();
    try {
      const data = await readAllReports(requestGeneration);
      if (requestGeneration !== generation) return;
      if (!data) return;
      if (!Array.isArray(data.reports)) throw new Error('The report list could not be read.');
      state.reports = data.reports;
      if (state.section === 'unassigned' && !state.reports.some(r => jurisdictionOf(r) === 'unassigned')) state.section = 'all';
      state.delivery = data.delivery || { emailConfigured: false };
      state.loaded = true;
      if (state.current?.id && !state.changed) state.current = copy(state.reports.find(r => r.id === state.current.id) || state.current);
    } catch (error) { if (requestGeneration === generation) state.error = error.message; }
    finally { if (requestGeneration === generation) { state.loading = false; redraw(); } }
  }
  function render() { if (!state.loaded && !state.loading) void load(); else redraw(); }
  function reset() { generation++; state.reports = []; state.current = null; state.delivery = { emailConfigured: false }; state.loaded = false; state.loading = false; state.saving = false; state.error = ''; state.mode = 'list'; state.receiptOpen = false; state.receiptDraft = {}; state.nextDates = {}; state.search = ''; state.section = 'all'; state.filter = 'all'; setDirty(false); document.body.classList.remove('report-filings-view'); }
  function discardDraft() {
    const saved = state.current?.id && state.reports.find(r => r.id === state.current.id);
    state.current = saved ? copy(saved) : null;
    state.mode = saved ? 'preview' : 'list';
    state.error = ''; state.receiptOpen = false; state.receiptDraft = {}; state.nextDates = {}; setDirty(false);
  }
  function onLeave() { if (state.changed || state.mode === 'next') discardDraft(); document.body.classList.remove('report-filings-view'); }
  function readForm() {
    const form = document.getElementById('rfEditForm');
    if (!form) return state.current;
    const values = new FormData(form);
    const next = { ...state.current };
    ['name', 'jurisdiction', 'amountDue', 'frequency', 'periodStart', 'periodEnd', 'dueDate', 'recipientName', 'deliveryMethod', 'recipientEmail', 'portalUrl', 'subject', 'notes'].forEach(key => { if (values.has(key)) next[key] = String(values.get(key)); });
    next.fields = [...form.querySelectorAll('[data-report-field]')].map(row => ({ label: row.querySelector('[data-rf-field-label]').value, value: row.querySelector('[data-rf-field-value]').value, required: row.querySelector('[data-rf-field-required]').checked }));
    return next;
  }
  function editableData(r) { const out = {}; ['name', 'jurisdiction', 'amountDue', 'frequency', 'periodStart', 'periodEnd', 'dueDate', 'recipientName', 'deliveryMethod', 'recipientEmail', 'portalUrl', 'subject', 'notes', 'fields'].forEach(key => { out[key] = r[key] ?? (key === 'fields' ? [] : ''); }); return out; }
  function acceptResult(result) { if (result.report) { state.current = result.report; const i = state.reports.findIndex(r => r.id === result.report.id); if (i < 0) state.reports.unshift(result.report); else state.reports[i] = result.report; if (state.section !== 'all') state.section = jurisdictionOf(result.report); } if (result.delivery) state.delivery = result.delivery; setDirty(false); }
  async function mutate(action, extra = {}, opts = {}) {
    if (state.saving) return false;
    const requestGeneration = generation;
    const requestId = state.current?.id;
    const expectedRevision = state.current?.revision;
    state.saving = true; state.error = ''; redraw();
    try {
      const data = await api('report-filings', { action, ...(requestId ? { id: requestId, expectedRevision } : {}), ...extra });
      if (requestGeneration !== generation) return false;
      acceptResult(data); state.mode = opts.mode || 'preview'; state.receiptOpen = false; state.receiptDraft = {}; state.nextDates = {};
      if (opts.message && typeof notice === 'function') notice(opts.message);
      return true;
    } catch (error) {
      if (requestGeneration !== generation) return false;
      const message = error.message;
      if (requestId && ['approveSend', 'approve', 'review', 'recordReceipt'].includes(action)) {
        try { const result = await readAllReports(requestGeneration); if (requestGeneration !== generation || !result) return false; if (Array.isArray(result.reports)) { state.reports = result.reports; const saved = result.reports.find(r => r.id === requestId); if (saved) state.current = copy(saved); state.delivery = result.delivery || state.delivery; state.mode = 'preview'; const pendingReceipt = action === 'recordReceipt' && state.current?.status !== 'filed'; state.receiptOpen = pendingReceipt; setDirty(pendingReceipt); } } catch { /* Keep the last confirmed state and the error. */ }
      }
      if (requestGeneration === generation) state.error = message; return false;
    } finally { if (requestGeneration === generation) { state.saving = false; redraw(); } }
  }
  async function save(review = false) {
    const form = document.getElementById('rfEditForm');
    if (!form || !form.reportValidity()) return;
    state.current = readForm();
    const report = editableData(state.current);
    report.fields = report.fields.filter(field => field.label.trim() || field.value.trim() || field.required);
    if (await mutate('save', { report }, { message: review ? '' : 'Report draft saved.' })) {
      if (review) await mutate('review', {}, { message: 'Report ready for your approval.' });
    }
  }
  function leaveDraft() { return !state.changed || confirm('Leave this report without saving your changes?'); }
  document.addEventListener('click', async event => {
    const control = event.target.closest('[data-report-action]');
    if (!control || !control.closest('#reportFilingHub')) return;
    event.preventDefault();
    if (state.saving || state.loading || control.disabled) return;
    const action = control.dataset.reportAction;
    if (action === 'section') { if (!leaveDraft()) return; const section = control.dataset.reportSection; if (!['all', 'unassigned', ...Object.keys(jurisdictions)].includes(section)) return; const previous = state.section; state.section = section; state.filter = 'all'; state.search = ''; state.mode = 'list'; state.current = null; state.error = ''; state.receiptOpen = false; state.receiptDraft = {}; state.nextDates = {}; setDirty(false); redraw(); const focusTarget = section === 'all' ? document.querySelector('.rf-section-card[data-report-section="' + (Object.hasOwn(jurisdictions, previous) ? previous : 'city') + '"]') : document.getElementById('rfHistoryTitle'); focusTarget?.focus({ preventScroll: true }); }
    else if (action === 'new') { if (!leaveDraft()) return; const section = control.dataset.reportSection || state.section; state.current = blank(section); state.mode = 'edit'; state.error = ''; setDirty(false); redraw(); document.querySelector('#rfEditForm [name="name"]')?.focus(); }
    else if (action === 'back') { if (!leaveDraft()) return; state.mode = 'list'; state.current = null; state.error = ''; state.receiptOpen = false; state.receiptDraft = {}; state.nextDates = {}; setDirty(false); redraw(); }
    else if (action === 'open') { const found = state.reports.find(r => r.id === control.dataset.reportId); if (found) { state.section = jurisdictionOf(found); state.current = copy(found); state.mode = 'preview'; state.error = ''; state.receiptOpen = false; setDirty(false); redraw(); } }
    else if (action === 'edit') { if (!leaveDraft()) return; state.mode = 'edit'; state.error = ''; state.receiptOpen = false; state.receiptDraft = {}; setDirty(false); redraw(); }
    else if (action === 'add-field') { state.current = readForm(); state.current.fields.push({ label: '', value: '', required: false }); setDirty(true); redraw(); const rows = document.querySelectorAll('#rfEditForm [data-rf-field-label]'); rows[rows.length - 1]?.focus(); }
    else if (action === 'remove-field') { state.current = readForm(); state.current.fields.splice(Number(control.dataset.fieldIndex), 1); setDirty(true); redraw(); }
    else if (action === 'save-review') await save(true);
    else if (action === 'review') await mutate('review', {}, { message: 'Report ready for your approval.' });
    else if (action === 'approve') await mutate('approve', {}, { message: 'Approval recorded. Complete the submission and save its confirmation.' });
    else if (action === 'approve-send') { await mutate('approveSend', {}, { message: 'Submission result saved. Review the confirmation below.' }); }
    else if (action === 'refresh') await load(true);
    else if (action === 'receipt') { state.receiptOpen = true; redraw(); document.querySelector('#rfReceiptForm [name="reference"]')?.focus(); }
    else if (action === 'cancel-receipt') { state.receiptOpen = false; state.receiptDraft = {}; setDirty(false); redraw(); }
    else if (action === 'next') { if (!leaveDraft()) return; state.mode = 'next'; state.nextDates = {}; state.error = ''; state.receiptOpen = false; state.receiptDraft = {}; setDirty(false); redraw(); }
    else if (action === 'cancel-next') { state.mode = 'preview'; state.nextDates = {}; setDirty(false); redraw(); }
    else if (action === 'print') window.print();
  });
  document.addEventListener('submit', async event => {
    const form = event.target;
    if (!form.closest('#reportFilingHub')) return;
    if (!['rfEditForm', 'rfReceiptForm', 'rfNextForm'].includes(form.id)) return;
    event.preventDefault();
    if (state.saving || !form.reportValidity()) return;
    if (form.id === 'rfEditForm') return save();
    const values = new FormData(form);
    if (form.id === 'rfReceiptForm') {
      const local = String(values.get('submittedAt'));
      const receipt = { reference: String(values.get('reference')), submittedAt: local, notes: String(values.get('receiptNotes') || '') };
      await mutate('recordReceipt', { receipt }, { message: 'Filing confirmation recorded.' });
    } else {
      const report = Object.fromEntries(['periodStart', 'periodEnd', 'dueDate'].map(key => [key, String(values.get(key))]));
      if (await mutate('nextPeriod', { report }, { mode: 'edit', message: 'Next reporting period created. Enter the new information.' })) setDirty(false);
    }
  });
  function rememberForm(event) {
    if (event.target.closest('#rfEditForm')) { state.current = readForm(); setDirty(true); }
    if (event.target.closest('#rfNextForm')) { const values = new FormData(event.target.form); state.nextDates = Object.fromEntries(['periodStart', 'periodEnd', 'dueDate'].map(key => [key, String(values.get(key) || '')])); setDirty(true); }
    if (event.target.closest('#rfReceiptForm')) { const values = new FormData(event.target.form); state.receiptDraft = { reference: String(values.get('reference') || ''), submittedAt: String(values.get('submittedAt') || ''), notes: String(values.get('receiptNotes') || '') }; setDirty(true); }
  }
  document.addEventListener('input', event => {
    rememberForm(event);
    if (event.target.id === 'rfSearch') { state.search = event.target.value; const cursor = event.target.selectionStart; redraw(); const search = document.getElementById('rfSearch'); search?.focus(); if (search && typeof cursor === 'number') search.setSelectionRange(cursor, cursor); }
  });
  document.addEventListener('change', event => {
    rememberForm(event);
    if (event.target.id === 'rfFilter') { state.filter = event.target.value; redraw(); }
    if (event.target.id === 'rfDeliveryMethod') { state.current = readForm(); setDirty(true); redraw(); }
  });
  window.addEventListener('beforeunload', event => { if (state.changed) { event.preventDefault(); event.returnValue = ''; } });
  window.djomsReportFilings = { render, load, reset, onLeave, isDirty: () => state.changed, leaveDraft, clearDirty: () => setDirty(false) };
})();
