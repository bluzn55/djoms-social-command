'use strict';
(() => {
  const VIEW = 'Reports & Filing';
  const ZONE = 'America/Chicago';
  const jurisdictions = { city: 'City', parish: 'Parish', state: 'State', federal: 'Federal' };
  const jurisdictionOf = report => Object.hasOwn(jurisdictions, report?.jurisdiction) ? report.jurisdiction : 'unassigned';
  const jurisdictionLabel = report => jurisdictions[jurisdictionOf(report)] || 'To classify';
  const frequencies = { unspecified: 'Schedule not set', monthly: 'Monthly', every_two_months: 'Every two months', twice_monthly: 'Twice a month', yearly: 'Yearly', one_time: 'One time' };
  const businessDefinitions = [{ id: 'conestoga', name: 'Colo Distillery LLC', stage: 'active' }, { id: 'doc_jaks', name: "Doc Jak’s", stage: 'setup' }];
  const profileKeys = ['legalName', 'displayName', 'address', 'ein', 'plantNumber'];
  const businessOf = report => businessDefinitions.some(b => b.id === report?.businessId) ? report.businessId : 'unassigned';
  const statusNames = { draft: 'Draft', ready: 'Awaiting approval', approved: 'Approved', sending: 'Sending', sent: 'Email sent', filed: 'Filing recorded', failed: 'Needs attention', uncertain: 'Check submission' };
  const methods = { unconfigured: 'Choose delivery method', email: 'Email after approval', portal: 'Filing website', manual: 'File manually' };
  const completed = r => ['sent', 'filed'].includes(r.status);
  const locked = r => ['sending', 'sent', 'filed', 'uncertain'].includes(r.status);
  const state = { reports: [], templates: [], businessProfiles: [], business: 'conestoga', delivery: { emailConfigured: false }, loaded: false, loading: false, saving: false, error: '', mode: 'list', current: null, section: 'all', filter: 'all', search: '', changed: false, nextDates: {}, receiptDraft: {}, receiptOpen: false, profileDraft: null, profileImportText: '', profileImportNotes: [], profileRequiresConfirmation: false, profileConfirmed: false, salesContext: null };
  let generation = 0;
  let importGeneration = 0;
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
  function businessProfile(id = state.business) { return state.businessProfiles.find(b => b.id === id) || businessDefinitions.find(b => b.id === id) || { id: 'unassigned', name: 'Unassigned reports', stage: '', revision: 0, values: {} }; }
  function businessName(id) { return businessProfile(id).name; }
  function businessReports() { return state.reports.filter(r => businessOf(r) === state.business); }
  function templateFor(report) { return state.templates.find(template => template.id === report?.templateId); }
  function monthlyTemplate(report) { return templateFor(report)?.schedule?.type === 'monthly_following'; }
  function blank(section = state.section) { return { name: '', businessId: state.business === 'unassigned' ? 'conestoga' : state.business, jurisdiction: Object.hasOwn(jurisdictions, section) ? section : 'unassigned', templateId: '', templateValues: {}, amountDue: '', frequency: 'unspecified', periodStart: '', periodEnd: '', targetDate: '', dueDate: '', recipientName: '', deliveryMethod: 'unconfigured', recipientEmail: '', portalUrl: '', subject: '', notes: '', fields: [{ label: '', value: '', required: false }] }; }
  function templateDraft(template) {
    const report = { ...blank(template.jurisdiction), name: template.name, templateId: template.id, frequency: template.frequency || 'unspecified', recipientName: template.agency || '', fields: [] };
    const profile = businessProfile(report.businessId).values || {};
    for (const field of template.fields || []) {
      if (!field.profileKey || field.manualOnly || field.calculation) continue;
      const value = field.profileKey === 'nameAddress' ? [profile.legalName || profile.displayName, profile.address].filter(Boolean).join('\n') : profileKeys.includes(field.profileKey) ? profile[field.profileKey] : '';
      if (value) report.templateValues[field.id] = String(value);
    }
    return report;
  }
  function badge(r) { return '<span class="rf-status rf-status-' + e(r.status || 'draft') + '">' + e(statusNames[r.status] || 'Draft') + '</span>'; }
  function optionList(values, selected) { return Object.entries(values).map(([value, label]) => '<option value="' + e(value) + '"' + (value === selected ? ' selected' : '') + '>' + e(label) + '</option>').join(''); }
  function button(action, label, className = '', extra = '') { return '<button type="button" data-report-action="' + e(action) + '" class="rf-button ' + className + '" ' + extra + '>' + label + '</button>'; }
  function heading() { const backLabel = state.section === 'all' ? 'All sections' : jurisdictions[state.section] ? 'Back to ' + jurisdictions[state.section].toLowerCase() + ' reports' : 'Reports to classify'; return '<div class="rf-heading"><div class="rf-station-title"><span class="rf-eyebrow">DOC JAKS · REPORTING STATION</span><h2>Reports &amp; Filing</h2><p>Monthly · Every two months · Twice a month · Yearly</p></div><div class="rf-heading-actions">' + (state.mode === 'list' ? button('new', '+ Add report', 'rf-primary') : button('back', backLabel)) + '</div></div>'; }
  function businessSelector() {
    const selected = businessProfile();
    const unassigned = state.reports.filter(r => businessOf(r) === 'unassigned').length;
    const options = Object.fromEntries(businessDefinitions.map(b => [b.id, businessName(b.id) + ' · ' + (b.stage === 'active' ? 'Active' : 'Setup')]));
    if (unassigned || state.business === 'unassigned') options.unassigned = 'Unassigned reports (' + unassigned + ')';
    return '<div class="rf-business-bar"><label for="rfBusinessSelect">Business<select id="rfBusinessSelect">' + optionList(options, state.business) + '</select></label><div class="rf-business-context"><strong>' + e(selected.name) + '</strong><span>' + (state.business === 'unassigned' ? 'Choose a business on each legacy report. Nothing is assigned automatically.' : (selected.stage === 'setup' ? 'Setup in progress' : 'Active distillery') + ' · Separate reports and history') + '</span></div>' + (state.business !== 'unassigned' ? button('business-profile', 'Business identity', 'rf-profile-button') : '') + '</div>';
  }
  function setupNote() { return '<div class="rf-setup"><span class="rf-shield" aria-hidden="true">✓</span><div><strong>Your approval controls sending.</strong><p>Each report keeps its own dates, information, and history. Email reports send when you choose <b>Approve &amp; send</b>. Filing websites use their own submission process.</p></div></div>'; }
  function scopedReports() {
    const reports = businessReports().filter(r => state.section === 'all' || jurisdictionOf(r) === state.section);
    const context = state.salesContext;
    if (!context) return reports;
    const dates = monthDates(context.month);
    return reports.filter(r => r.templateId === context.templateId && dates &&
      /^\d{4}-\d{2}-\d{2}$/.test(r.periodStart || '') && /^\d{4}-\d{2}-\d{2}$/.test(r.periodEnd || '') &&
      r.periodStart <= dates.periodEnd && r.periodEnd >= dates.periodStart);
  }
  function salesContextMarkup() {
    const context = state.salesContext;
    if (!context) return '';
    const template = state.templates.find(item => item.id === context.templateId);
    const month = new Date(context.month + '-01T12:00:00Z').toLocaleDateString('en-US', {month: 'long', year: 'numeric', timeZone: 'UTC'});
    const actions = context.templateId === 'ttb_excise'
      ? button('sales-period', 'Open 1st-half form', 'rf-primary', 'data-sales-half="first"') + button('sales-period', 'Open 2nd-half form', '', 'data-sales-half="second"')
      : button('sales-period', 'Open ' + e(month) + ' form', 'rf-primary');
    return '<section class="rf-panel rf-sales-context"><div><span class="rf-eyebrow">FROM SALES</span><h3>' + e(template?.shortName || template?.name || 'TTB reports') + ' · ' + e(month) + '</h3><p>' + e(businessName(state.business)) + ' · Saved reports and new forms for this period. Report values are entered and reviewed here; sales do not establish production, transfers, stock, or taxable removals.</p></div><div class="rf-sales-context-actions">' + actions + button('clear-sales-context', 'Show all federal history', 'rf-text-button') + '</div></section>';
  }
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
  function amountText(report, empty = 'Not entered') {
    const value = String(report.amountDue ?? '').trim();
    if (!value || !/^\d+(?:\.\d{1,2})?$/.test(value)) return empty;
    const number = Number(value);
    return Number.isFinite(number) ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(number) : empty;
  }
  function sentState(report) {
    return ({ sent: 'Email sent', filed: 'Filing recorded', sending: 'Sending', uncertain: 'Check submission' })[report.status] || 'Not sent';
  }
  function sentDateValue(report) {
    if (!completed(report)) return '';
    const receipt = report.receipt || report.submission;
    if (report.status === 'filed') return receipt?.reference ? receipt.submittedAt || '' : '';
    const providerId = report.deliveryResult?.providerId || (receipt?.source === 'email' ? receipt.reference || receipt.providerId || receipt.messageId : '');
    return providerId ? receipt?.submittedAt || report.deliveryResult?.sentAt || '' : '';
  }
  function shortDate(value) {
    if (!value) return '—';
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const date = new Date(dateOnly ? value + 'T12:00:00Z' : value);
    return Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-US', { timeZone: dateOnly ? 'UTC' : ZONE, month: '2-digit', day: '2-digit', year: '2-digit' }) : '—';
  }
  function sectionSignal(key) {
    const list = businessReports().filter(r => jurisdictionOf(r) === key);
    if (!list.length) return { color: 'yellow', label: 'Needs setup', detail: 'No saved reports in this section.' };
    const pending = list.filter(r => !completed(r));
    if (pending.some(r => ['failed', 'uncertain'].includes(r.status) || (dueDays(r) !== null && dueDays(r) < 0))) return { color: 'red', label: 'Needs attention', detail: 'An overdue report or a submission result needs attention.' };
    if (pending.some(r => ['ready', 'approved', 'sending'].includes(r.status) || (dueDays(r) !== null && dueDays(r) <= 7) || (r.targetDate && dueDays({ dueDate: r.targetDate }) <= 7))) return { color: 'yellow', label: 'Action upcoming', detail: 'A target or due date is within seven days, or a report needs approval or submission.' };
    if (pending.some(r => !r.dueDate || !r.periodStart || !r.periodEnd || !r.frequency || r.frequency === 'unspecified')) return { color: 'yellow', label: 'Needs setup', detail: 'An unfinished report still needs its reporting period or schedule.' };
    return { color: 'green', label: pending.length ? 'Current' : 'Saved periods submitted', detail: pending.length ? 'Saved reports have no overdue or upcoming action within seven days.' : 'All saved reports have a confirmed email send or a recorded filing.' };
  }
  function sectionHeader(key) {
    const label = jurisdictions[key];
    const total = businessReports().filter(r => jurisdictionOf(r) === key).length;
    const signal = sectionSignal(key);
    return '<div class="rf-section-beacon" title="' + e(signal.label + ': ' + signal.detail) + '"><span class="rf-lamp rf-lamp-' + signal.color + '" aria-hidden="true"></span><span class="rf-sr">' + e(signal.label) + '</span></div><button type="button" class="rf-section-header" data-report-action="section" data-report-section="' + key + '" aria-label="' + e(label + ': ' + signal.label + '. ' + signal.detail + ' View full history of ' + total + ' saved reports.') + '"><span>' + label + '</span></button>';
  }
  function frontReports(key) {
    return businessReports().filter(r => jurisdictionOf(r) === key).slice().sort((a, b) => {
      const finishedOrder = Number(completed(a)) - Number(completed(b));
      if (finishedOrder) return finishedOrder;
      if (completed(a)) return String(b.periodEnd || b.updatedAt || '').localeCompare(String(a.periodEnd || a.updatedAt || '')) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
      return String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    });
  }
  function sectionTemplates(key) { return state.business === 'unassigned' ? [] : state.templates.filter(template => template.jurisdiction === key); }
  function frontEntries(key) {
    const reports = frontReports(key);
    const templates = sectionTemplates(key);
    const entries = templates.map(template => ({ template, report: reports.find(report => report.templateId === template.id && !completed(report)) || reports.find(report => report.templateId === template.id && completed(report)) || null }));
    const remaining = reports.filter(report => !templates.some(template => template.id === report.templateId));
    return [...entries, ...remaining.slice(0, Math.max(0, 5 - entries.length)).map(report => ({ report }))];
  }
  function summaryRow(entry) {
    const { report, template } = entry;
    const name = report?.name || template?.name || 'Untitled report';
    const opensTemplate = template && (!report || !completed(report));
    const action = opensTemplate ? 'template' : 'open';
    const detail = opensTemplate ? 'data-template-id="' + e(template.id) + '"' : 'data-report-id="' + e(report.id) + '"';
    const sent = report ? sentDateValue(report) : '';
    const overdue = report && !completed(report) && dueDays(report) !== null && dueDays(report) < 0;
    const period = report ? displayDate(report.periodStart) + ' through ' + displayDate(report.periodEnd) : 'No reporting period saved';
    return '<tr class="rf-summary-row"><th scope="row">' + button(action, e(name), 'rf-summary-report', detail + ' title="' + e(period) + '" aria-label="' + e((report ? 'Open ' : 'Start ') + name + '. ' + period + (report ? '. ' + (statusNames[report.status] || 'Draft') : '')) + '"') + '</th><td data-label="Due date"' + (overdue ? ' class="rf-overdue-text"' : '') + '>' + e(shortDate(report?.dueDate)) + '</td><td data-label="Sent date" title="' + e(report ? sentState(report) : 'Not started') + '">' + e(shortDate(sent)) + '<span class="rf-sr">' + e(report ? sentState(report) : 'Not started') + '</span></td><td data-label="Amount ($)" class="rf-summary-amount">' + e(report ? amountText(report, '—') : '—') + '</td></tr>';
  }
  function landingMarkup() {
    const unassigned = businessReports().filter(r => jurisdictionOf(r) === 'unassigned').length;
    return '<section class="rf-sections rf-landing" aria-label="Government report sections"><div class="rf-section-toolbar"><div><span class="rf-eyebrow">FOUR REPORT SECTIONS</span><p>Open a section to see its full reporting history.</p></div><div>' + button('refresh', 'Refresh', '', state.loading ? 'disabled' : '') + '</div></div><div class="rf-section-cards">' + Object.entries(jurisdictions).map(([key, label]) => {
      const entries = frontEntries(key);
      const total = businessReports().filter(r => jurisdictionOf(r) === key).length;
      return '<section class="rf-landing-column" data-report-group="' + key + '" aria-label="' + label + ' reports">' + sectionHeader(key) + '<div class="rf-section-ledger"><div class="rf-ledger-heading rf-ledger-tools">' + button('new', '+ Add report', 'rf-ledger-add', 'data-report-section="' + key + '" aria-label="Add ' + label.toLowerCase() + ' report"') + '</div>' + (entries.length ? '<div class="rf-summary-scroll"><table class="rf-summary-table" aria-label="' + label + ' report summary"><thead><tr><th scope="col">Report</th><th scope="col">Due date</th><th scope="col">Sent date</th><th scope="col">Amount ($)</th></tr></thead><tbody>' + entries.map(summaryRow).join('') + '</tbody></table></div>' : '<p class="rf-ledger-empty">No reports added yet.</p>') + '<div class="rf-ledger-footer">' + button('section', 'Full history · ' + total + ' saved', '', 'data-report-section="' + key + '"') + '</div></div></section>';
    }).join('') + '</div>' + (unassigned ? '<div class="rf-classify-note"><span>' + unassigned + ' report' + (unassigned === 1 ? ' needs' : 's need') + ' a government level.</span>' + button('section', 'To classify (' + unassigned + ')', 'rf-classify-button', 'data-report-section="unassigned"') + '</div>' : '') + '</section><p class="rf-status-legend"><span><i class="rf-dot rf-dot-green" aria-hidden="true"></i> Current / submitted</span><span><i class="rf-dot rf-dot-yellow" aria-hidden="true"></i> Setup / due soon / approval</span><span><i class="rf-dot rf-dot-red" aria-hidden="true"></i> Overdue / needs attention</span></p>' + setupNote() + '<p class="rf-footnote">Dates and amounts appear only when entered or confirmed. Each TTB form shows its earliest unfinished period, otherwise its latest completed period. Full history keeps every saved period.</p>';
  }
  function reportTable(list, label) {
    return '<div class="rf-table-wrap"><table class="rf-table" aria-label="' + e(label) + ' reports"><thead><tr><th scope="col">Report</th><th scope="col">Reporting period</th><th scope="col">Due date</th><th scope="col">Sent date</th><th scope="col">Status</th><th scope="col">Amount due</th><th scope="col"><span class="rf-sr">Open report</span></th></tr></thead><tbody>' + list.map(r => '<tr><td><strong>' + e(r.name || 'Untitled report') + '</strong><span class="rf-subline">' + e(frequencies[r.frequency] || 'Schedule not set') + (r.recipientName ? ' · ' + e(r.recipientName) : '') + '</span></td><td>' + e(displayDate(r.periodStart)) + '<span class="rf-subline">through ' + e(displayDate(r.periodEnd)) + '</span></td><td><strong>' + e(displayDate(r.dueDate)) + '</strong><span class="rf-subline ' + (!completed(r) && dueDays(r) < 0 && dueDays(r) !== null ? 'rf-overdue-text' : '') + '">' + (!completed(r) ? e(dueText(r)) : 'Completed period') + '</span>' + (r.targetDate ? '<span class="rf-subline">Prepare by ' + e(displayDate(r.targetDate)) + '</span>' : '') + '</td><td>' + e(shortDate(sentDateValue(r))) + '</td><td>' + badge(r) + '</td><td class="rf-amount-cell">' + e(amountText(r)) + '</td><td>' + button('open', 'Open', '', 'data-report-id="' + e(r.id) + '"') + '</td></tr>').join('') + '</tbody></table></div>';
  }
  function templateShelf(key) {
    if (state.salesContext) return '';
    const templates = sectionTemplates(key);
    if (!templates.length) return '';
    return '<section class="rf-panel rf-template-shelf"><h3>Reusable report forms</h3><p>Start a new period or continue an unfinished report for ' + e(businessName(state.business)) + '.</p><div>' + templates.map(template => {
      const unfinished = frontReports(key).find(report => report.templateId === template.id && !completed(report));
      return button('template', '<strong>' + e(template.shortName || template.name) + '</strong><span>' + (unfinished ? 'Continue saved period' : 'Start a new draft') + '</span>', '', 'data-template-id="' + e(template.id) + '"');
    }).join('') + '</div></section>';
  }
  function reportGroup(key, list) {
    const label = jurisdictions[key] || 'To classify';
    const total = businessReports().filter(r => jurisdictionOf(r) === key).length;
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
    const sectionTitle = state.salesContext ? 'Saved reports for the selected month' : state.section === 'unassigned' ? 'Reports to classify' : jurisdictions[state.section] + ' · Full report history';
    return salesContextMarkup() + '<div class="rf-history-navigation">' + button('section', 'All sections', 'rf-section-all', 'data-report-section="all"') + '<p>Every saved reporting period stays in this section.</p></div><div class="rf-scope-heading"><h3 id="rfHistoryTitle" tabindex="-1">' + e(sectionTitle) + '</h3><span>' + scoped.length + ' saved period' + (scoped.length === 1 ? '' : 's') + '</span></div>' +
      templateShelf(state.section) + '<section class="rf-panel rf-filter-panel"><div class="rf-list-tools"><label>Find a report<input type="search" id="rfSearch" placeholder="Report or recipient" value="' + e(state.search) + '"></label><label>Show<select id="rfFilter">' + optionList({ all: 'All frequencies', ready: 'Awaiting approval', attention: 'Needs attention', ...frequencies }, state.filter) + '</select></label>' + button('refresh', 'Refresh', '', state.loading ? 'disabled' : '') + '</div></section>' +
      reportGroup(state.section, list) + setupNote() + '<p class="rf-footnote">Amounts due are entered in US dollars. A blank amount stays unknown. Dates use Central Time.</p>';
  }
  function input(name, label, value, opts = '') { return '<label>' + label + '<input name="' + name + '" value="' + e(value) + '" ' + opts + '></label>'; }
  function fieldsMarkup(r) { return (r.fields || []).map((field, index) => '<div class="rf-field-row" data-report-field="' + index + '"><label>Field name<input data-rf-field-label maxlength="160" value="' + e(field.label) + '" placeholder="Name on your report"></label><label>Value<textarea data-rf-field-value rows="2" maxlength="4000" placeholder="Enter information">' + e(field.value) + '</textarea></label><label class="rf-check"><input type="checkbox" data-rf-field-required ' + (field.required ? 'checked' : '') + '> Required</label>' + button('remove-field', 'Remove', 'rf-text-button', 'data-field-index="' + index + '" aria-label="Remove field ' + (index + 1) + '"') + '</div>').join(''); }
  function monthDates(value, schedule = { targetDay: 5, dueDay: 15 }) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value || '')) return null;
    const [year, month] = value.split('-').map(Number);
    if (year < 1000 || year > 9998) return null;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const following = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7);
    return { periodStart: value + '-01', periodEnd: value + '-' + lastDay, targetDate: following + '-' + String(schedule.targetDay || 5).padStart(2, '0'), dueDate: following + '-' + String(schedule.dueDay || 15).padStart(2, '0') };
  }
  function selectedMonth(report) {
    const month = String(report.periodStart || '').slice(0, 7);
    const dates = monthDates(month);
    return dates && dates.periodStart === report.periodStart && dates.periodEnd === report.periodEnd ? month : '';
  }
  function syncPeriodValues(report, template) {
    const month = selectedMonth(report);
    for (const field of template.fields || []) {
      if (field.periodKey === 'monthYear') report.templateValues[field.id] = month ? new Date(month + '-01T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';
      if (field.periodKey === 'periodStart') report.templateValues[field.id] = report.periodStart || '';
      if (field.periodKey === 'periodEnd') report.templateValues[field.id] = report.periodEnd || '';
    }
  }
  function decimalUnits(value) {
    const text = String(value ?? '').trim();
    if (!/^-?\d{1,18}(?:\.\d{1,6})?$/.test(text)) return null;
    const negative = text.startsWith('-');
    const [whole, fraction = ''] = (negative ? text.slice(1) : text).split('.');
    const units = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
    return negative ? -units : units;
  }
  function decimalText(units, money = false) {
    const sign = units < 0n ? '-' : '';
    const absolute = units < 0n ? -units : units;
    const whole = String(absolute / 1000000n);
    const fraction = String(absolute % 1000000n).padStart(6, '0');
    return sign + whole + (money ? '.' + fraction.slice(0, 2) : fraction.replace(/0+$/, '') ? '.' + fraction.replace(/0+$/, '') : '');
  }
  function calculateTemplate(report) {
    const template = templateFor(report);
    if (!template) return report;
    report.templateValues = { ...(report.templateValues || {}) };
    syncPeriodValues(report, template);
    const definitions = new Map((template.fields || []).map(field => [field.id, field]));
    const done = new Set();
    const visiting = new Set();
    function resolve(id) {
      const field = definitions.get(id);
      if (!field) return '';
      if (field.manualOnly) return report.templateValues[id] = '';
      if (!field.calculation) {
        const value = String(report.templateValues[id] ?? '');
        if (field.type === 'money' && !/^\d{1,9}(?:\.\d{1,2})?$/.test(value.trim())) return '';
        if (field.type === 'number' && !(field.integer ? /^\d{1,12}$/ : /^\d{1,12}(?:\.\d{1,6})?$/).test(value.trim())) return '';
        return value;
      }
      if (done.has(id)) return report.templateValues[id];
      if (visiting.has(id)) return '';
      visiting.add(id);
      const values = (field.calculation.refs || []).map(ref => decimalUnits(resolve(ref)));
      let total = null;
      if (values.length && values.every(value => value !== null)) {
        if (field.calculation.op === 'sum') total = values.reduce((a, b) => a + b, 0n);
        if (field.calculation.op === 'subtract') total = values.slice(1).reduce((a, b) => a - b, values[0]);
      }
      report.templateValues[id] = total === null ? '' : decimalText(total, field.type === 'money');
      visiting.delete(id); done.add(id);
      return report.templateValues[id];
    }
    (template.fields || []).forEach(field => resolve(field.id));
    if (template.amountDueField) {
      const value = decimalUnits(report.templateValues[template.amountDueField]);
      report.amountDue = value !== null && value >= 0n ? decimalText(value, true) : '';
    }
    return report;
  }
  function templateFieldControl(field, report, editable, columnLabel = '') {
    const raw = field.manualOnly ? '' : String(report.templateValues?.[field.id] ?? '');
    const accessibleLabel = [field.label, columnLabel, field.unit].filter(Boolean).join(' · ');
    if (!editable) {
      let value = raw;
      if (field.type === 'select') value = (field.options || []).find(option => String(typeof option === 'string' ? option : option.value) === raw)?.label || raw;
      if (field.type === 'date' && raw) value = displayDate(raw);
      if (field.type === 'money' && raw && /^\d+(?:\.\d+)?$/.test(raw)) value = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(raw));
      return '<div class="rf-template-value' + (field.calculation ? ' rf-derived-value' : '') + '">' + (field.manualOnly ? '<span class="rf-not-entered">Unsigned · complete manually</span>' : value ? e(value) : '<span class="rf-not-entered">Not entered</span>') + '</div>';
    }
    const readonly = field.manualOnly || field.calculation || field.periodKey;
    const attrs = ' data-template-field="' + e(field.id) + '" aria-label="' + e(accessibleLabel + (field.calculation ? ' · Calculated' : '')) + '"' + (field.required ? ' aria-required="true"' : '') + (readonly ? ' readonly' : '');
    const className = readonly ? ' class="rf-derived-input"' : '';
    if (field.type === 'textarea' && !readonly) return '<textarea' + attrs + ' rows="3" maxlength="8000">' + e(raw) + '</textarea>';
    if (field.type === 'select' && !readonly) return '<select' + attrs + '><option value="">Not entered</option>' + (field.options || []).map(option => { const value = typeof option === 'string' ? option : option.value; const label = typeof option === 'string' ? option : option.label; return '<option value="' + e(value) + '"' + (String(value) === raw ? ' selected' : '') + '>' + e(label) + '</option>'; }).join('') + '</select>';
    const numeric = ['number', 'money'].includes(field.type);
    const pattern = field.type === 'money' ? '[0-9]{1,9}(\\.[0-9]{1,2})?' : field.integer ? '[0-9]{1,12}' : '[0-9]{1,12}(\\.[0-9]{1,6})?';
    return '<input type="' + (field.type === 'date' ? 'date' : 'text') + '"' + attrs + className + ' value="' + e(raw) + '"' + (numeric && !readonly ? ' inputmode="' + (field.integer ? 'numeric' : 'decimal') + '" pattern="' + pattern + '" maxlength="24" title="' + (field.type === 'money' ? 'Enter a nonnegative amount with up to two decimal places.' : field.integer ? 'Enter a nonnegative whole number.' : 'Enter a nonnegative number with up to six decimal places.') + '"' : ' maxlength="8000"') + (field.manualOnly ? ' placeholder="Unsigned"' : field.calculation ? ' placeholder="Awaiting values"' : field.periodKey ? ' placeholder="Choose reporting period"' : '') + '>';
  }
  function templateFieldLabel(field, report, editable) {
    const tag = editable ? 'label' : 'div';
    return '<' + tag + ' class="rf-template-field' + (field.type === 'textarea' ? ' rf-field-wide' : '') + '"><span>' + e(field.label) + (field.unit ? ' <small>(' + e(field.unit) + ')</small>' : '') + (field.required ? '<span class="rf-required">Required for review</span>' : '') + (field.calculation ? '<span class="rf-calculated-label">Calculated</span>' : '') + '</span>' + templateFieldControl(field, report, editable) + '</' + tag + '>';
  }
  function templateChecksMarkup(report, editable = false) {
    const checks = Array.isArray(report.templateChecks) ? report.templateChecks : [];
    if (!checks.length || (editable && state.changed)) return '<p class="rf-help rf-checks-note">Arithmetic and balance checks run when this draft is saved.</p>';
    return '<div class="rf-template-checks"><h4>Arithmetic &amp; balance checks</h4><ul>' + checks.map(check => '<li class="rf-check-' + e(check.status) + '"><strong>' + e(check.label) + '</strong><span>' + e(check.message || ({ pass: 'Matches', pending: 'More values needed', fail: 'Check the entered values' })[check.status]) + '</span></li>').join('') + '</ul></div>';
  }
  function templateMarkup(report, editable = false) {
    const template = templateFor(report);
    if (!report.templateId) return '';
    if (!template) return '<section class="rf-panel rf-warning"><h3>Form definition unavailable</h3><p>Refresh to load this report’s form before editing or reviewing its values.</p></section>';
    const fields = template.fields || [];
    const sections = [...(template.sections || [])];
    const unmatched = fields.filter(field => !sections.some(section => section.id === field.section));
    if (unmatched.length) sections.push({ id: '__additional', title: 'Additional form fields', type: 'fields' });
    const reference = /^\/assets\/report-forms\/[a-z0-9-]+\.pdf$/i.test(template.pdfAsset || '') ? '<a class="rf-button" href="' + e(template.pdfAsset) + '" target="_blank" rel="noopener noreferrer" download>Download reference form</a>' : '';
    return '<div class="rf-template-document"><section class="rf-panel rf-template-intro"><div class="rf-panel-heading"><div><span class="rf-eyebrow">' + e(template.formNumber || 'REPORT FORM') + (template.sourceEdition ? ' · ' + e(template.sourceEdition) : '') + '</span><h3>' + e(template.name) + '</h3></div>' + reference + '</div><p>All form sections are included. Blank numbers stay unknown; enter zero only when it is correct. Calculated totals wait for every related value. Shaded cells are not used on this form.</p><p class="rf-help">' + (editable ? 'Save at any point. Fields marked “Required for review” may remain blank in a draft. ' : '') + 'The reference form is separate from this review. Government portal filing and accounting, sales, production, and inventory feeds are not connected.</p><nav class="rf-template-index" aria-label="Form sections">' + sections.map(section => '<a href="#rfTemplate-' + e(section.id) + '">' + e(section.title) + '</a>').join('') + '</nav></section>' + sections.map(section => {
      const members = section.id === '__additional' ? unmatched : fields.filter(field => field.section === section.id);
      const numeric = members.filter(field => ['number', 'money'].includes(field.type) && !field.calculation && !field.manualOnly && !field.periodKey);
      const rows = (section.rows || []).map(row => typeof row === 'string' ? { id: row, label: row } : row);
      const columns = (section.columns || []).map(column => typeof column === 'string' ? { id: column, label: column } : column);
      let contents = '';
      if (section.type === 'table' && rows.length && columns.length) {
        const used = new Set();
        contents = '<div class="rf-template-scroll" tabindex="0" aria-label="' + e(section.title) + ' table; scroll horizontally to see all columns"><table class="rf-template-table"><thead><tr><th scope="col">Line / transaction</th>' + columns.map(column => '<th scope="col">' + e(column.label) + (column.unit ? '<span class="rf-column-unit">' + e(column.unit) + '</span>' : '') + '</th>').join('') + '</tr></thead><tbody>' + rows.map(row => '<tr><th scope="row">' + e(row.label) + '</th>' + columns.map(column => {
          const field = members.find(member => member.row === row.id && member.column === column.id);
          if (!field) return '<td class="rf-cell-unused"><span aria-hidden="true">—</span><span class="rf-sr">Not used on this form</span></td>';
          used.add(field.id);
          return '<td' + (field.calculation ? ' class="rf-cell-derived"' : '') + '>' + templateFieldControl(field, report, editable, column.label) + '</td>';
        }).join('') + '</tr>').join('') + '</tbody></table></div>';
        const extra = members.filter(field => !used.has(field.id));
        if (extra.length) contents += '<div class="rf-form-grid rf-template-extras">' + extra.map(field => templateFieldLabel(field, report, editable)).join('') + '</div>';
      } else contents = '<div class="rf-form-grid">' + members.map(field => templateFieldLabel(field, report, editable)).join('') + '</div>';
      return '<section class="rf-panel rf-template-section" id="rfTemplate-' + e(section.id) + '"><div class="rf-panel-heading"><div><h3>' + e(section.title) + '</h3>' + (section.description ? '<p>' + e(section.description) + '</p>' : '') + '</div>' + (editable && numeric.length ? button('zero-section', 'Fill blank numeric cells with zero', 'rf-zero-button', 'data-template-section="' + e(section.id) + '"') : '') + '</div>' + contents + '</section>';
    }).join('') + '<section class="rf-panel rf-checks-panel">' + templateChecksMarkup(report, editable) + '</section></div>';
  }
  function editMarkup() {
    const r = state.current || blank();
    const method = r.deliveryMethod || 'unconfigured';
    const template = templateFor(r);
    const monthly = monthlyTemplate(r);
    const businessInput = businessOf(r) === 'unassigned' ? '<label>Business for this report<select name="businessId">' + optionList({ unassigned: 'Choose a business', ...Object.fromEntries(businessDefinitions.map(b => [b.id, b.name])) }, businessOf(r)) + '</select></label>' : '<div class="rf-fixed-field"><span>Business</span><strong>' + e(businessName(r.businessId)) + '</strong><small>This report stays with this business.</small><input type="hidden" name="businessId" value="' + e(r.businessId) + '"></div>';
    return '<form id="rfEditForm" class="rf-form"><section class="rf-panel"><div class="rf-panel-heading"><div><span class="rf-eyebrow">' + (r.id ? 'EDIT REPORT' : 'NEW REPORT') + '</span><h3>' + e(r.name || 'Report details') + '</h3></div>' + badge({ status: 'draft' }) + '</div><div class="rf-form-grid">' + businessInput +
      input('name', 'Report name', r.name, 'maxlength="160" required placeholder="Name of the report"') +
      (template ? '<div class="rf-fixed-field"><span>Government level</span><strong>' + e(jurisdictionLabel(r)) + '</strong><input type="hidden" name="jurisdiction" value="' + e(r.jurisdiction) + '"></div>' : '<label>Government level<select name="jurisdiction">' + optionList({ unassigned: 'Choose city, parish, state, or federal', ...jurisdictions }, jurisdictionOf(r)) + '</select></label>') +
      (monthly ? '<div class="rf-fixed-field"><span>How often</span><strong>Monthly</strong><input type="hidden" name="frequency" value="monthly"></div>' + input('reportMonth', 'Reporting month', selectedMonth(r), 'type="month" id="rfPeriodMonth"') : '<label>How often<select name="frequency">' + optionList(frequencies, r.frequency) + '</select></label>') +
      input('periodStart', 'Period starts', r.periodStart, 'type="date"' + (monthly ? ' readonly' : '')) + input('periodEnd', 'Period ends', r.periodEnd, 'type="date"' + (monthly ? ' readonly' : '')) +
      input('targetDate', 'Prepare by' + (monthly ? '' : ' (optional)'), r.targetDate, 'type="date"' + (monthly ? ' readonly' : '')) + input('dueDate', 'Due date for this report', r.dueDate, 'type="date"' + (monthly ? ' readonly' : '')) + input('amountDue', 'Amount due (USD)' + (template?.amountDueField ? ' · calculated from form' : ''), r.amountDue, 'type="number" min="0" max="999999999.99" step="0.01" placeholder="Not entered"' + (template?.amountDueField ? ' readonly' : '')) + input('recipientName', 'Recipient or organization', r.recipientName, 'maxlength="160" placeholder="Who receives this report"') + '</div><p class="rf-help">' + (monthly ? 'Choose the complete reporting month. Preparation target: the 5th of the following month. Due date: the 15th of the following month.' : template?.scheduleNote ? e(template.scheduleNote) + '. Choose the confirmed cadence and exact dates for this period.' : '“Every two months” and “twice a month” are separate schedules. Enter the exact deadline for this reporting period.') + '</p></section>' +
      (template ? '<div class="rf-editor-savebar"><span>Save a draft at any point.</span><div><button type="submit" class="rf-button">Save draft</button>' + button('save-review', 'Save &amp; review', 'rf-primary') + '</div></div>' + templateMarkup(r, true) : '') +
      '<section class="rf-panel"><div class="rf-panel-heading"><div><h3>' + (template ? 'Additional report information' : 'Report information') + '</h3><p>' + (template ? 'Optional extra fields and notes are included in the submission.' : 'Add the fields from your report. A blank value stays blank.') + '</p></div>' + button('add-field', '+ Add field') + '</div><div class="rf-fields">' + fieldsMarkup(r) + '</div><label class="rf-notes">Report notes (included in the submission)<textarea name="notes" rows="4" maxlength="12000" placeholder="Additional information to include in this report">' + e(r.notes) + '</textarea></label></section>' +
      '<section class="rf-panel"><div class="rf-panel-heading"><div><h3>Delivery</h3><p>Choose how this report is submitted.</p></div></div><div class="rf-form-grid"><label>Submission method<select name="deliveryMethod" id="rfDeliveryMethod">' + optionList(methods, method) + '</select></label>' +
      (method === 'email' ? input('recipientEmail', 'Recipient email', r.recipientEmail, 'type="email" maxlength="254" placeholder="name@example.com"') + input('subject', 'Email subject', r.subject, 'maxlength="200" placeholder="Report name and period"') : method === 'portal' ? input('portalUrl', 'Filing website', r.portalUrl, 'type="url" maxlength="1000" placeholder="https://"') : '') + '</div>' +
      (method === 'email' ? '<p class="rf-help">The review screen shows the email before you approve sending. ' + (state.delivery.emailConfigured ? '' : 'The email connection still needs setup.') + '</p>' : method === 'portal' ? '<p class="rf-help">Review and approve here, then open the filing website. Record its confirmation after submission.</p>' : '') + '</section>' +
      '<div class="rf-editor-footer"><p>' + (r.id && ['approved', 'ready'].includes(r.status) ? 'Saving changes returns this report to draft for a fresh review.' : 'Save a draft now. Review when all required information is entered.') + '</p><div><button type="submit" class="rf-button"' + (state.saving ? ' disabled' : '') + '>Save draft</button>' + button('save-review', 'Save &amp; review', 'rf-primary', state.saving ? 'disabled' : '') + '</div></div></form>';
  }
  function previewDetails(r) {
    const delivery = r.deliveryMethod === 'email' ? r.recipientEmail || 'Not entered' : r.deliveryMethod === 'portal' ? r.portalUrl || 'Not entered' : methods[r.deliveryMethod] || 'Not configured';
    return '<div class="rf-preview-grid"><div><span>Business</span><strong>' + e(businessName(businessOf(r))) + '</strong></div><div><span>Government level</span><strong>' + e(jurisdictionLabel(r)) + '</strong></div><div><span>Reporting period</span><strong>' + e(displayDate(r.periodStart)) + ' – ' + e(displayDate(r.periodEnd)) + '</strong></div><div><span>Prepare by</span><strong>' + e(displayDate(r.targetDate)) + '</strong></div><div><span>Due date</span><strong>' + e(displayDate(r.dueDate)) + '</strong></div><div><span>Sent / filed date</span><strong>' + e(sentDateValue(r) ? displayTime(sentDateValue(r)) : 'Not submitted') + '</strong></div><div><span>Amount due</span><strong>' + e(amountText(r)) + '</strong></div><div><span>Frequency</span><strong>' + e(frequencies[r.frequency] || 'Not set') + '</strong></div><div><span>Recipient</span><strong>' + e(r.recipientName || 'Not entered') + '</strong></div><div class="rf-wide"><span>' + (r.deliveryMethod === 'email' ? 'Send to' : 'Submission method') + '</span><strong>' + e(delivery) + '</strong></div></div><dl class="rf-values">' + (r.fields || []).map(field => '<div><dt>' + e(field.label || 'Unnamed field') + (field.required ? ' <span class="rf-required">Required</span>' : '') + '</dt><dd>' + (String(field.value ?? '').trim() ? e(field.value) : '<span class="rf-not-entered">Not entered</span>') + '</dd></div>').join('') + '</dl>' + (r.notes ? '<div class="rf-report-notes"><h4>Report notes</h4><p>' + e(r.notes) + '</p></div>' : '');
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
  function nextMarkup(r) {
    const monthly = monthlyTemplate(r);
    return '<form id="rfNextForm" class="rf-panel rf-form"><span class="rf-eyebrow">NEXT REPORTING PERIOD</span><h3>' + e(r.name) + '</h3><p><strong>' + e(businessName(businessOf(r))) + ' · ' + e(jurisdictionLabel(r)) + '</strong>. This business, report form, and delivery details are retained. Operational values, amount due, and approval start fresh. Saved identity is used only from this business.</p><div class="rf-form-grid">' + (monthly ? input('reportMonth', 'New reporting month', selectedMonth(state.nextDates), 'type="month" id="rfNextMonth" required') : '') + input('periodStart', 'New period starts', state.nextDates.periodStart || '', 'type="date" required' + (monthly ? ' readonly' : '')) + input('periodEnd', 'New period ends', state.nextDates.periodEnd || '', 'type="date" required' + (monthly ? ' readonly' : '')) + input('targetDate', 'Prepare by' + (monthly ? '' : ' (optional)'), state.nextDates.targetDate || '', 'type="date"' + (monthly ? ' readonly' : '')) + input('dueDate', 'New due date', state.nextDates.dueDate || '', 'type="date" required' + (monthly ? ' readonly' : '')) + '</div>' + (monthly ? '<p class="rf-help">The selected month sets the preparation target to the following 5th and the due date to the following 15th.</p>' : '') + '<div class="rf-inline-actions"><button class="rf-button rf-primary" type="submit">Create next draft</button>' + button('cancel-next', 'Cancel') + '</div></form>';
  }
  function previewMarkup() {
    const r = state.current;
    if (!r) return listMarkup();
    const portal = r.deliveryMethod === 'portal' && /^https:\/\//i.test(r.portalUrl || '') ? '<a class="rf-button" href="' + e(r.portalUrl) + '" target="_blank" rel="noopener noreferrer">Open filing website</a>' : '';
    const abandonedSend = r.status === 'sending' && Date.now() - Date.parse(r.deliveryResult?.attemptedAt || '') > 180000;
    const canRecordReceipt = ['approved', 'sent', 'failed', 'uncertain'].includes(r.status) || abandonedSend;
    return '<section class="rf-panel rf-report-document"><div class="rf-panel-heading"><div><span class="rf-eyebrow">REPORT REVIEW · VERSION ' + e(r.revision || 1) + '</span><h3>' + e(r.name) + '</h3></div>' + badge(r) + '</div>' + previewDetails(r) + '</section>' + templateMarkup(r) + emailMarkup(r) + reviewActions(r) +
      '<section class="rf-panel rf-record-tools"><div class="rf-tool-buttons">' + (!locked(r) ? button('edit', 'Edit report') : '') + button('print', 'Print review / save PDF') + portal + (canRecordReceipt ? button('receipt', 'Record filing confirmation') : '') + button('next', 'Prepare next period') + '</div>' + receiptMarkup(r) + historyMarkup(r) + '</section>';
  }
  function profileMarkup() {
    const profile = state.profileDraft || {};
    return '<form id="rfProfileForm" class="rf-form"><section class="rf-panel"><div class="rf-panel-heading"><div><span class="rf-eyebrow">PRIVATE BUSINESS IDENTITY</span><h3>' + e(businessName(state.business)) + '</h3><p>Used only for this business’s new report drafts. Existing reports keep their saved identity.</p></div></div><div class="rf-form-grid">' + input('legalName', 'Legal proprietor name', profile.legalName, 'maxlength="180" autocomplete="off"') + input('displayName', 'Trade / display name', profile.displayName, 'maxlength="180" autocomplete="off"') + '<label class="rf-field-wide">Business / bonded-premises address<textarea name="address" rows="3" maxlength="2000" autocomplete="off">' + e(profile.address) + '</textarea></label>' + input('ein', 'EIN', profile.ein, 'maxlength="32" pattern="[0-9]{2}-?[0-9]{7}" title="Enter nine digits, with an optional hyphen after the first two." autocomplete="off"') + input('plantNumber', 'Plant / permit number', profile.plantNumber, 'maxlength="80" autocomplete="off"') + '</div><p class="rf-help">Use the identity on this business’s permit. No account, inventory, or reporting history is transferred by saving these details.</p></section><section class="rf-panel rf-profile-import"><h3>Import prepared identity</h3><p>Choose the private JSON file or paste its contents, then preview the fields above before saving.</p><label class="rf-import-file">Choose JSON file<input id="rfProfileImportFile" type="file" accept="application/json,.json"></label><label>Or paste identity JSON<textarea id="rfProfileImportText" rows="4" spellcheck="false" autocomplete="off" placeholder="Paste the prepared business identity JSON">' + e(state.profileImportText) + '</textarea></label>' + button('preview-profile-import', 'Preview import') + '</section>' + (state.profileImportNotes.length ? '<section class="rf-panel rf-profile-source-notes"><h3>Source notes</h3><ul>' + state.profileImportNotes.map(note => '<li>' + e(note) + '</li>').join('') + '</ul></section>' : '') + (state.profileRequiresConfirmation ? '<div class="rf-profile-confirmation"><label><input type="checkbox" id="rfProfileConfirmed" required' + (state.profileConfirmed ? ' checked' : '') + '> Confirm the legal proprietor name against your permit before saving.</label></div>' : '') + '<div class="rf-editor-footer"><p>Identity stays in the signed-in reporting account and is never copied to the other business.</p><div><button type="submit" class="rf-button rf-primary">Save business identity</button>' + button('back', 'Cancel') + '</div></div></form>';
  }
  function clearProfileDraft() { importGeneration++; state.profileDraft = null; state.profileRevision = 0; state.profileImportText = ''; state.profileImportNotes = []; state.profileRequiresConfirmation = false; state.profileConfirmed = false; }
  function readProfileForm() {
    const form = document.getElementById('rfProfileForm');
    if (!form) return state.profileDraft || {};
    const values = new FormData(form);
    return Object.fromEntries(profileKeys.map(key => [key, String(values.get(key) || '')]));
  }
  function previewProfileImport(text) {
    try {
      const source = JSON.parse(text);
      if (!source || typeof source !== 'object' || source.businessId !== state.business) throw new Error('This import must name the currently selected business. Switch businesses before importing another identity.');
      if (!source.profile || typeof source.profile !== 'object' || Array.isArray(source.profile)) throw new Error('The file must contain a profile with the prepared identity fields.');
      if (Object.keys(source.profile).some(key => !profileKeys.includes(key)) || Object.values(source.profile).some(value => typeof value !== 'string')) throw new Error('The profile contains unsupported fields. Use legalName, displayName, address, ein, and plantNumber as text values.');
      state.profileDraft = { ...readProfileForm(), ...source.profile };
      state.profileImportText = text;
      state.profileImportNotes = Array.isArray(source.sourceNotes) ? source.sourceNotes.filter(note => typeof note === 'string').slice(0, 20) : [];
      state.profileRequiresConfirmation = source.requiresNameConfirmation === true;
      state.profileConfirmed = false;
      state.error = ''; setDirty(true); redraw();
      document.querySelector('#rfProfileForm [name="legalName"]')?.focus();
    } catch (error) { state.error = error.message || 'The identity JSON could not be read.'; redraw(); }
  }
  async function saveProfile() {
    const form = document.getElementById('rfProfileForm');
    if (!form || !form.reportValidity() || state.saving) return;
    state.profileDraft = readProfileForm();
    if (state.profileRequiresConfirmation && !state.profileConfirmed) { state.error = 'Confirm the legal proprietor name against your permit before saving.'; redraw(); return; }
    const requestGeneration = generation;
    const businessId = state.business;
    state.saving = true; state.error = ''; redraw();
    try {
      const result = await api('report-filings', { action: 'saveBusinessProfile', businessId, expectedRevision: state.profileRevision, profile: state.profileDraft });
      if (requestGeneration !== generation) return;
      if (!result.businessProfile) throw new Error('The saved business identity could not be confirmed. Refresh before trying again.');
      const index = state.businessProfiles.findIndex(profile => profile.id === businessId);
      if (index < 0) state.businessProfiles.push(result.businessProfile); else state.businessProfiles[index] = result.businessProfile;
      state.profileDraft = copy(result.businessProfile.values || {}); state.profileRevision = result.businessProfile.revision || 0; setDirty(false);
      if (typeof notice === 'function') notice('Business identity saved. New drafts for this business can use it.');
    } catch (error) { if (requestGeneration === generation) state.error = error.message; }
    finally { if (requestGeneration === generation) { state.saving = false; redraw(); } }
  }
  function redraw() {
    if (!visible() || !host()) return;
    if (state.changed) setDirty(true);
    document.body.classList.add('report-filings-view');
    host().innerHTML = '<div id="reportFilingHub" class="rf-hub" aria-busy="' + String(state.loading || state.saving) + '">' + heading() + (state.loaded ? businessSelector() : '') + (state.error ? '<div class="rf-error" role="alert">' + e(state.error) + '</div>' : '') + (!state.loaded && state.loading ? '<div class="rf-panel rf-loading" role="status">Loading saved reports…</div>' : !state.loaded && state.error ? '<div class="rf-panel"><p>Saved reports could not be loaded. Refresh to try again.</p>' + button('refresh', 'Try again') + '</div>' : state.mode === 'profile' ? profileMarkup() : state.mode === 'edit' ? editMarkup() : state.mode === 'next' ? nextMarkup(state.current) : state.mode === 'preview' ? previewMarkup() : listMarkup()) + '</div>';
    if (state.saving || state.loading) host().querySelectorAll('#reportFilingHub input, #reportFilingHub select, #reportFilingHub textarea, #reportFilingHub button').forEach(control => { control.disabled = true; });
  }
  async function readAllReports(requestGeneration) {
    const byId = new Map();
    const seen = new Set(['0']);
    let cursor = null;
    let delivery = null;
    let templates = null;
    let businessProfiles = null;
    do {
      const data = await api('report-filings' + (cursor === null ? '' : '?cursor=' + encodeURIComponent(cursor)));
      if (requestGeneration !== generation) return null;
      if (!Array.isArray(data.reports)) throw new Error('The report list could not be read.');
      if (!delivery && data.delivery) delivery = data.delivery;
      if (!templates && Array.isArray(data.templates)) templates = data.templates;
      if (!businessProfiles && Array.isArray(data.businessProfiles)) businessProfiles = data.businessProfiles;
      data.reports.forEach(report => { if (report && typeof report.id === 'string') byId.set(report.id, report); });
      const next = data.nextCursor;
      if (next === null || next === undefined) {
        if (data.limited) throw new Error('Only part of the report history was returned. Refresh after the report service update finishes.');
        return { reports: [...byId.values()], delivery: delivery || { emailConfigured: false }, templates: templates || [], businessProfiles: businessProfiles || businessDefinitions.map(profile => ({ ...profile, revision: 0, values: {} })) };
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
      state.templates = data.templates;
      state.businessProfiles = data.businessProfiles;
      if (state.section === 'unassigned' && !businessReports().some(r => jurisdictionOf(r) === 'unassigned')) state.section = 'all';
      state.delivery = data.delivery || { emailConfigured: false };
      state.loaded = true;
      if (state.current?.id && !state.changed) state.current = copy(state.reports.find(r => r.id === state.current.id) || state.current);
      if (state.mode === 'profile' && !state.changed) { state.profileDraft = copy(businessProfile().values || {}); state.profileRevision = businessProfile().revision || 0; }
    } catch (error) { if (requestGeneration === generation) state.error = error.message; }
    finally { if (requestGeneration === generation) { state.loading = false; redraw(); } }
  }
  function render() { if (!state.loaded && !state.loading) void load(); else redraw(); }
  function reset() { generation++; state.reports = []; state.templates = []; state.businessProfiles = []; state.business = 'conestoga'; state.current = null; state.delivery = { emailConfigured: false }; state.loaded = false; state.loading = false; state.saving = false; state.error = ''; state.mode = 'list'; state.receiptOpen = false; state.receiptDraft = {}; state.nextDates = {}; state.search = ''; state.section = 'all'; state.filter = 'all'; state.salesContext = null; clearProfileDraft(); setDirty(false); document.body.classList.remove('report-filings-view'); }
  function discardDraft() {
    const saved = state.current?.id && state.reports.find(r => r.id === state.current.id);
    state.current = saved ? copy(saved) : null;
    state.mode = saved ? 'preview' : 'list';
    state.error = ''; state.receiptOpen = false; state.receiptDraft = {}; state.nextDates = {}; clearProfileDraft(); setDirty(false);
  }
  function onLeave() { if (state.changed || ['next', 'profile'].includes(state.mode)) discardDraft(); state.salesContext = null; document.body.classList.remove('report-filings-view'); }
  async function openForBusiness(businessId, templateId, month) {
    if (!visible() || state.saving || !businessDefinitions.some(item => item.id === businessId) ||
        !['ttb_excise', 'ttb_production', 'ttb_storage', 'ttb_processing'].includes(templateId) || !monthDates(month)) return false;
    if (!leaveDraft()) return false;
    clearWork(); state.business = businessId; state.section = 'federal'; state.filter = 'all'; state.search = '';
    state.salesContext = {businessId, templateId, month};
    if (!state.loaded && !state.loading) await load(); else redraw();
    return true;
  }
  function openSalesPeriod(half) {
    const context = state.salesContext;
    if (!context || state.business !== context.businessId || !leaveDraft()) return;
    const template = state.templates.find(item => item.id === context.templateId);
    const month = monthDates(context.month, template?.schedule || undefined);
    if (!template || !month) return;
    const excise = template.id === 'ttb_excise';
    if (excise && !['first', 'second'].includes(half)) return;
    const start = excise && half === 'second' ? context.month + '-16' : month.periodStart;
    const end = excise && half === 'first' ? context.month + '-15' : month.periodEnd;
    const matches = businessReports().filter(r => r.templateId === template.id && r.periodStart === start && r.periodEnd === end)
      .sort((a, b) => Number(completed(a)) - Number(completed(b)) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    clearWork();
    if (matches.length) { state.current = copy(matches[0]); state.mode = 'preview'; }
    else {
      state.current = templateDraft(template);
      Object.assign(state.current, {periodStart: start, periodEnd: end});
      if (excise) state.current.frequency = 'twice_monthly';
      else if (template.schedule?.type === 'monthly_following') Object.assign(state.current, month);
      state.mode = 'edit'; calculateTemplate(state.current); setDirty(true);
    }
    redraw();
  }
  function readForm() {
    const form = document.getElementById('rfEditForm');
    if (!form) return state.current;
    const values = new FormData(form);
    const next = { ...state.current };
    ['name', 'businessId', 'jurisdiction', 'amountDue', 'frequency', 'periodStart', 'periodEnd', 'targetDate', 'dueDate', 'recipientName', 'deliveryMethod', 'recipientEmail', 'portalUrl', 'subject', 'notes'].forEach(key => { if (values.has(key)) next[key] = String(values.get(key)); });
    next.fields = [...form.querySelectorAll('[data-report-field]')].map(row => ({ label: row.querySelector('[data-rf-field-label]').value, value: row.querySelector('[data-rf-field-value]').value, required: row.querySelector('[data-rf-field-required]').checked }));
    next.templateValues = { ...(next.templateValues || {}) };
    form.querySelectorAll('[data-template-field]').forEach(control => { next.templateValues[control.dataset.templateField] = control.value; });
    if (monthlyTemplate(next) && values.has('reportMonth')) Object.assign(next, monthDates(String(values.get('reportMonth')), templateFor(next).schedule) || { periodStart: '', periodEnd: '', targetDate: '', dueDate: '' });
    return calculateTemplate(next);
  }
  function editableData(r) { const out = {}; ['name', 'businessId', 'jurisdiction', 'templateId', 'templateValues', 'amountDue', 'frequency', 'periodStart', 'periodEnd', 'targetDate', 'dueDate', 'recipientName', 'deliveryMethod', 'recipientEmail', 'portalUrl', 'subject', 'notes', 'fields'].forEach(key => { out[key] = r[key] ?? (key === 'fields' ? [] : key === 'templateValues' ? {} : ''); }); return out; }
  function acceptResult(result) { if (result.report) { state.current = result.report; const i = state.reports.findIndex(r => r.id === result.report.id); if (i < 0) state.reports.unshift(result.report); else state.reports[i] = result.report; state.business = businessOf(result.report); if (state.section !== 'all') state.section = jurisdictionOf(result.report); } if (result.delivery) state.delivery = result.delivery; setDirty(false); }
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
        try { const result = await readAllReports(requestGeneration); if (requestGeneration !== generation || !result) return false; if (Array.isArray(result.reports)) { state.reports = result.reports; state.templates = result.templates; state.businessProfiles = result.businessProfiles; const saved = result.reports.find(r => r.id === requestId); if (saved) state.current = copy(saved); state.delivery = result.delivery || state.delivery; state.mode = 'preview'; const pendingReceipt = action === 'recordReceipt' && state.current?.status !== 'filed'; state.receiptOpen = pendingReceipt; setDirty(pendingReceipt); } } catch { /* Keep the last confirmed state and the error. */ }
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
  function leaveDraft() { return !state.changed || confirm(state.mode === 'profile' ? 'Leave these business identity changes without saving?' : 'Leave this report without saving your changes?'); }
  function clearWork() { state.current = null; state.mode = 'list'; state.error = ''; state.receiptOpen = false; state.receiptDraft = {}; state.nextDates = {}; clearProfileDraft(); setDirty(false); }
  function clearSalesContext() {
    state.salesContext = null;
    if (typeof location !== 'undefined' && location.pathname === '/reports' && typeof history !== 'undefined' && typeof history.replaceState === 'function') history.replaceState({}, '', '/reports');
  }
  function refreshDerivedControls() {
    const form = document.getElementById('rfEditForm');
    if (!form || !state.current) return;
    const template = templateFor(state.current);
    if (!template) return;
    const readonly = new Set((template.fields || []).filter(field => field.calculation || field.manualOnly || field.periodKey).map(field => field.id));
    form.querySelectorAll('[data-template-field]').forEach(control => { if (readonly.has(control.dataset.templateField)) control.value = state.current.templateValues?.[control.dataset.templateField] || ''; });
    ['periodStart', 'periodEnd', 'targetDate', 'dueDate', 'amountDue'].forEach(key => { const control = form.elements.namedItem(key); if (control?.readOnly) control.value = state.current[key] || ''; });
    const checks = form.querySelector('.rf-checks-panel');
    if (checks) checks.innerHTML = templateChecksMarkup(state.current, true);
  }
  document.addEventListener('click', async event => {
    const control = event.target.closest('[data-report-action]');
    if (!control || !control.closest('#reportFilingHub')) return;
    event.preventDefault();
    if (state.saving || state.loading || control.disabled) return;
    const action = control.dataset.reportAction;
    if (action === 'section') { if (!leaveDraft()) return; const section = control.dataset.reportSection; if (!['all', 'unassigned', ...Object.keys(jurisdictions)].includes(section)) return; const previous = state.section; clearSalesContext(); state.section = section; state.filter = 'all'; state.search = ''; clearWork(); redraw(); const focusTarget = section === 'all' ? document.querySelector('.rf-section-header[data-report-section="' + (Object.hasOwn(jurisdictions, previous) ? previous : 'city') + '"]') : document.getElementById('rfHistoryTitle'); focusTarget?.focus({ preventScroll: true }); }
    else if (action === 'sales-period') openSalesPeriod(control.dataset.salesHalf);
    else if (action === 'clear-sales-context') { if (!leaveDraft()) return; clearSalesContext(); clearWork(); redraw(); }
    else if (action === 'new') { if (!leaveDraft()) return; const section = control.dataset.reportSection || state.section; clearWork(); state.current = blank(section); state.business = state.current.businessId; state.mode = 'edit'; redraw(); document.querySelector('#rfEditForm [name="name"]')?.focus(); }
    else if (action === 'back') { if (!leaveDraft()) return; clearWork(); redraw(); }
    else if (action === 'open') { if (!leaveDraft()) return; const found = businessReports().find(r => r.id === control.dataset.reportId); if (found) { clearWork(); state.section = jurisdictionOf(found); state.current = copy(found); state.mode = 'preview'; redraw(); } }
    else if (action === 'template') {
      if (!leaveDraft() || state.business === 'unassigned') return;
      const template = state.templates.find(item => item.id === control.dataset.templateId);
      if (!template) return;
      const saved = frontReports(template.jurisdiction).find(report => report.templateId === template.id && !completed(report));
      clearWork(); state.section = template.jurisdiction; state.current = saved ? copy(saved) : templateDraft(template); state.mode = !saved || saved.status === 'draft' ? 'edit' : 'preview';
      if (state.mode === 'edit') calculateTemplate(state.current);
      redraw(); (document.getElementById('rfPeriodMonth') || document.querySelector('#rfEditForm [name="name"]'))?.focus();
    }
    else if (action === 'business-profile') { if (!leaveDraft() || state.business === 'unassigned') return; clearWork(); const profile = businessProfile(); state.profileDraft = copy(profile.values || {}); state.profileRevision = profile.revision || 0; state.mode = 'profile'; redraw(); document.querySelector('#rfProfileForm [name="legalName"]')?.focus(); }
    else if (action === 'preview-profile-import') { state.profileDraft = readProfileForm(); previewProfileImport(document.getElementById('rfProfileImportText')?.value || ''); }
    else if (action === 'edit') { if (!leaveDraft()) return; state.mode = 'edit'; state.error = ''; state.receiptOpen = false; state.receiptDraft = {}; setDirty(false); redraw(); }
    else if (action === 'add-field') { state.current = readForm(); state.current.fields.push({ label: '', value: '', required: false }); setDirty(true); redraw(); const rows = document.querySelectorAll('#rfEditForm [data-rf-field-label]'); rows[rows.length - 1]?.focus(); }
    else if (action === 'remove-field') { state.current = readForm(); state.current.fields.splice(Number(control.dataset.fieldIndex), 1); setDirty(true); redraw(); }
    else if (action === 'zero-section') {
      state.current = readForm();
      const template = templateFor(state.current);
      const section = control.dataset.templateSection;
      if (!template) return;
      let count = 0;
      for (const field of template.fields || []) {
        const inSection = section === '__additional' ? !(template.sections || []).some(item => item.id === field.section) : field.section === section;
        if (inSection && ['number', 'money'].includes(field.type) && !field.calculation && !field.manualOnly && !field.periodKey && !String(state.current.templateValues?.[field.id] ?? '').trim()) { state.current.templateValues[field.id] = field.type === 'money' ? '0.00' : '0'; count++; }
      }
      if (count) { calculateTemplate(state.current); setDirty(true); redraw(); [...document.querySelectorAll('[data-template-section]')].find(item => item.dataset.templateSection === section)?.focus({ preventScroll: true }); }
      if (typeof notice === 'function') notice(count ? count + ' blank numeric cells set to zero. Review before saving.' : 'This section has no blank numeric cells.');
    }
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
    if (!['rfEditForm', 'rfReceiptForm', 'rfNextForm', 'rfProfileForm'].includes(form.id)) return;
    event.preventDefault();
    if (state.saving || state.loading || !form.reportValidity()) return;
    if (form.id === 'rfEditForm') return save();
    if (form.id === 'rfProfileForm') return saveProfile();
    const values = new FormData(form);
    if (form.id === 'rfReceiptForm') {
      const local = String(values.get('submittedAt'));
      const receipt = { reference: String(values.get('reference')), submittedAt: local, notes: String(values.get('receiptNotes') || '') };
      await mutate('recordReceipt', { receipt }, { message: 'Filing confirmation recorded.' });
    } else {
      const report = Object.fromEntries(['periodStart', 'periodEnd', 'targetDate', 'dueDate'].map(key => [key, String(values.get(key) || '')]));
      if (monthlyTemplate(state.current)) Object.assign(report, monthDates(String(values.get('reportMonth') || ''), templateFor(state.current).schedule) || {});
      if (await mutate('nextPeriod', { report }, { mode: 'edit', message: 'Next reporting period created. Enter the new information.' })) setDirty(false);
    }
  });
  function rememberForm(event) {
    if (state.saving || state.loading) return;
    if (event.target.closest('#rfEditForm')) { state.current = readForm(); setDirty(true); refreshDerivedControls(); }
    if (event.target.closest('#rfNextForm')) { const values = new FormData(event.target.form); state.nextDates = Object.fromEntries(['periodStart', 'periodEnd', 'targetDate', 'dueDate'].map(key => [key, String(values.get(key) || '')])); if (monthlyTemplate(state.current)) { Object.assign(state.nextDates, monthDates(String(values.get('reportMonth') || ''), templateFor(state.current).schedule) || { periodStart: '', periodEnd: '', targetDate: '', dueDate: '' }); Object.entries(state.nextDates).forEach(([key, value]) => { const control = event.target.form.elements.namedItem(key); if (control?.readOnly) control.value = value; }); } setDirty(true); }
    if (event.target.closest('#rfReceiptForm')) { const values = new FormData(event.target.form); state.receiptDraft = { reference: String(values.get('reference') || ''), submittedAt: String(values.get('submittedAt') || ''), notes: String(values.get('receiptNotes') || '') }; setDirty(true); }
    if (event.target.closest('#rfProfileForm')) { state.profileDraft = readProfileForm(); state.profileImportText = document.getElementById('rfProfileImportText')?.value || ''; state.profileConfirmed = Boolean(document.getElementById('rfProfileConfirmed')?.checked); setDirty(true); }
  }
  document.addEventListener('input', event => {
    rememberForm(event);
    if (event.target.id === 'rfSearch') { state.search = event.target.value; const cursor = event.target.selectionStart; redraw(); const search = document.getElementById('rfSearch'); search?.focus(); if (search && typeof cursor === 'number') search.setSelectionRange(cursor, cursor); }
  });
  document.addEventListener('change', async event => {
    if (state.saving || state.loading) return;
    rememberForm(event);
    if (event.target.id === 'rfFilter') { state.filter = event.target.value; redraw(); }
    if (event.target.id === 'rfDeliveryMethod') { state.current = readForm(); setDirty(true); redraw(); }
    if (event.target.id === 'rfBusinessSelect') {
      const business = event.target.value;
      if (!['unassigned', ...businessDefinitions.map(profile => profile.id)].includes(business) || !leaveDraft()) { event.target.value = state.business; return; }
      clearWork(); clearSalesContext(); state.business = business; state.section = 'all'; state.filter = 'all'; state.search = ''; redraw(); document.getElementById('rfBusinessSelect')?.focus({ preventScroll: true });
    }
    if (event.target.id === 'rfProfileImportFile') {
      const file = event.target.files?.[0];
      if (!file) return;
      if (file.size > 100000) { state.error = 'Choose the small business-identity JSON file (under 100 KB).'; redraw(); return; }
      const token = ++importGeneration;
      const requestGeneration = generation;
      const business = state.business;
      try { const text = await file.text(); if (token === importGeneration && requestGeneration === generation && state.mode === 'profile' && state.business === business) previewProfileImport(text); }
      catch { if (token === importGeneration && requestGeneration === generation) { state.error = 'The identity file could not be read.'; redraw(); } }
    }
  });
  window.addEventListener('beforeunload', event => { if (state.changed) { event.preventDefault(); event.returnValue = ''; } });
  window.djomsReportFilings = { render, load, reset, onLeave, openForBusiness, isDirty: () => state.changed, leaveDraft, clearDirty: () => setDirty(false) };
})();
