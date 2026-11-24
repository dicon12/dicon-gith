/**
 * DICON GITH admin dashboard - "Partner with us" requests: list, filters, detail drawer and review.
 * Mixed into AdminDashboard (see js/mixin.js); `this` is the AdminDashboard.
 */
import { GITH_CATEGORIES, NIGERIAN_STATES } from './data.js';
import { firebaseService } from './firebase-config.js';
import { partnerService, PARTNER_STATUSES } from './partner-service.js';

export class AdminPartners {
  // ---- PARTNER / SPONSOR REQUESTS ----
  async startPartnerWatch() {
    try {
      this._partnerLive = await partnerService.watchAll(
        (list) => { this.partnerList = list; this.renderPartners(); this.renderMatching(); },
        (err) => {
          console.warn('Partner requests listener failed:', err);
          this.showToast('Could not load partnership requests (permission or network problem).', 'error');
        }
      );
    } catch (err) {
      console.warn('Partner requests load failed:', err);
      this.showToast('Could not load partnership requests.', 'error');
    }
  }

  bindPartnerEvents() {
    const statusFilter = document.getElementById('admin-partners-status-filter');
    if (statusFilter) {
      PARTNER_STATUSES.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.key;
        opt.textContent = s.label;
        statusFilter.appendChild(opt);
      });
    }
    const catFilter = document.getElementById('admin-partners-cat-filter');
    if (catFilter) {
      GITH_CATEGORIES.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        catFilter.appendChild(opt);
      });
    }
    const stateFilter = document.getElementById('admin-partners-state-filter');
    if (stateFilter) {
      NIGERIAN_STATES.forEach(st => {
        const opt = document.createElement('option');
        opt.value = st;
        opt.textContent = st;
        stateFilter.appendChild(opt);
      });
    }
    const select = document.getElementById('pd-status-select');
    if (select) {
      PARTNER_STATUSES.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.key;
        opt.textContent = s.label;
        select.appendChild(opt);
      });
    }

    ['admin-partners-search'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', () => this.renderPartners());
    });
    [statusFilter, catFilter, stateFilter].forEach(el => {
      if (el) el.addEventListener('change', () => this.renderPartners());
    });

    const backdrop = document.getElementById('partner-drawer-backdrop');
    const close = () => backdrop && backdrop.classList.remove('active');
    document.getElementById('partner-drawer-close')?.addEventListener('click', close);
    document.getElementById('pd-cancel-btn')?.addEventListener('click', close);
    if (backdrop) backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    document.getElementById('pd-save-btn')?.addEventListener('click', () => this.savePartnerReview());
  }

  renderPartners() {
    const tbody = document.getElementById('admin-partners-tbody');
    const all = this.partnerList || [];

    const badge = document.getElementById('admin-badge-partners');
    if (badge) badge.textContent = all.filter(r => (r.status || 'new') === 'new').length;
    if (!tbody) return;

    const term = (document.getElementById('admin-partners-search')?.value || '').toLowerCase().trim();
    const cat = document.getElementById('admin-partners-cat-filter')?.value || 'all';
    const state = document.getElementById('admin-partners-state-filter')?.value || 'all';
    const status = document.getElementById('admin-partners-status-filter')?.value || 'all';

    const rows = all.filter(r => {
      if (term && !(`${r.organisationName} ${r.contactName} ${r.email} ${r.reference}`.toLowerCase().includes(term))) return false;
      if (cat !== 'all' && !(r.allCategories || (r.categories || []).includes(cat))) return false;
      if (state !== 'all' && !(r.allStates || (r.states || []).includes(state))) return false;
      if (status !== 'all' && (r.status || 'new') !== status) return false;
      return true;
    });

    tbody.innerHTML = '';
    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:32px; color:var(--muted-gray);">${all.length === 0 ? 'No partnership requests yet.' : 'No requests match the selected filters.'}</td></tr>`;
      return;
    }

    rows.forEach(r => {
      const st = PARTNER_STATUSES.find(s => s.key === (r.status || 'new')) || PARTNER_STATUSES[0];
      const offers = (r.offerTypes || []);
      const offerText = offers.length > 2 ? `${offers.slice(0, 2).join(', ')} +${offers.length - 2}` : offers.join(', ');
      const catText = r.allCategories ? 'All categories' : `${(r.categories || []).length} categor${(r.categories || []).length === 1 ? 'y' : 'ies'}`;
      const stateText = r.allStates ? 'Nationwide' : `${(r.states || []).length} state${(r.states || []).length === 1 ? '' : 's'}`;
      const received = r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><code style="font-weight:700; color:var(--deep-forest); font-size:12px;">${this.escapeHtml(r.reference)}</code></td>
        <td><strong>${this.escapeHtml(r.organisationName)}</strong><div style="font-size:11px; color:var(--muted-gray);">${this.escapeHtml(r.orgType)}</div></td>
        <td>${this.escapeHtml(r.contactName)}<div style="font-size:11px; color:var(--muted-gray);">${this.escapeHtml(r.email)}</div></td>
        <td style="font-size:12px;">${this.escapeHtml(offerText)}</td>
        <td style="font-size:12px;">${this.escapeHtml(catText)}<br>${this.escapeHtml(stateText)}</td>
        <td><span class="status-pill ${st.pill}">${this.escapeHtml(st.label)}</span></td>
        <td>${this.escapeHtml(received)}</td>
        <td><button class="btn-table-action">Review</button></td>
      `;
      tr.querySelector('button').addEventListener('click', () => this.openPartnerDrawer(r.id));
      tbody.appendChild(tr);
    });
  }

  openPartnerDrawer(id) {
    const r = (this.partnerList || []).find(x => x.id === id);
    if (!r) return;
    this.activePartner = r;

    const set = (elId, text) => { const el = document.getElementById(elId); if (el) el.textContent = text || '—'; };
    set('partner-drawer-title', r.organisationName);
    set('pd-ref', r.reference);
    set('pd-type', r.orgType);
    set('pd-received', r.createdAt ? new Date(r.createdAt).toLocaleString() : '');
    set('pd-contact', [r.contactName, r.contactRole].filter(Boolean).join(' — '));
    set('pd-phone', r.phone);
    set('pd-offer-types', (r.offerTypes || []).join(', '));
    set('pd-offer-desc', r.offerDescription);
    set('pd-commitment', r.commitment || 'Not specified');
    set('pd-categories', r.allCategories ? 'All categories' : (r.categories || []).join(', '));
    set('pd-states', r.allStates ? 'Nationwide (all states)' : (r.states || []).join(', '));

    // Email / website become links only when they look safe: the data is public input.
    const linkInto = (elId, text, href) => {
      const el = document.getElementById(elId);
      if (!el) return;
      el.textContent = '';
      if (!text) { el.textContent = '—'; return; }
      if (!href) { el.textContent = text; return; }
      const a = document.createElement('a');
      a.href = href;
      a.textContent = text;
      a.style.color = 'var(--deep-forest)';
      a.style.fontWeight = '700';
      if (href.startsWith('http')) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      el.appendChild(a);
    };
    const safeEmail = /^[^\s@<>"'?&]+@[^\s@<>"'?&]+\.[^\s@<>"'?&]{2,}$/.test(r.email || '');
    linkInto('pd-email', r.email, safeEmail ? `mailto:${r.email}` : '');
    linkInto('pd-website', r.website, /^https?:\/\/[^\s]+$/i.test(r.website || '') ? r.website : '');

    const status = r.status || 'new';
    const pill = document.getElementById('pd-status-pill');
    const st = PARTNER_STATUSES.find(s => s.key === status) || PARTNER_STATUSES[0];
    if (pill) { pill.className = `status-pill ${st.pill}`; pill.textContent = st.label; }

    const select = document.getElementById('pd-status-select');
    if (select) select.value = st.key;
    const note = document.getElementById('pd-admin-note');
    if (note) note.value = r.adminNote || '';
    const by = document.getElementById('pd-reviewed-by');
    if (by) {
      by.textContent = r.reviewedByName
        ? `Last updated by ${r.reviewedByName}${r.reviewedAt ? ' on ' + new Date(r.reviewedAt).toLocaleString() : ''}`
        : 'Not reviewed yet.';
    }

    document.getElementById('partner-drawer-backdrop')?.classList.add('active');
  }

  async savePartnerReview() {
    const r = this.activePartner;
    if (!r) return;
    const btn = document.getElementById('pd-save-btn');
    const status = document.getElementById('pd-status-select').value;
    const note = document.getElementById('pd-admin-note').value;
    const prevStatus = r.status || 'new';

    if (btn) btn.disabled = true;
    try {
      await partnerService.updateReview(
        r.id,
        { status, adminNote: note },
        { uid: this.currentUser.uid, name: this.currentUser.fullName || this.currentUser.email }
      );
      if (status !== prevStatus) this.recordPartnerAudit(r, prevStatus, status, note);
      // Live mode refreshes through the Firestore listener; local mode re-reads the store.
      if (!this._partnerLive) await this.startPartnerWatch();
      document.getElementById('partner-drawer-backdrop')?.classList.remove('active');
      this.showToast('Partnership request updated.');
    } catch (err) {
      console.warn('Partner request update failed:', err);
      const denied = err && err.code === 'permission-denied';
      this.showToast(denied ? 'Could not save: permission denied. Please sign in again.' : 'Could not save the changes. Please try again.', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  recordPartnerAudit(r, prevStatus, newStatus, note) {
    const now = new Date().toISOString();
    const label = (key) => (PARTNER_STATUSES.find(s => s.key === key) || {}).label || key;
    this.auditLogs.unshift({
      logId: `audit-${Date.now()}`,
      referenceNumber: r.reference,
      innovationId: r.id,
      adminName: this.currentUser.fullName || 'Admin',
      adminEmail: this.currentUser.email,
      prevStatus,
      newStatus,
      actionTitle: `Partner request: moved to ${label(newStatus)}`,
      note: note || '',
      timestamp: now
    });
    localStorage.setItem('dicon_gith_audit_logs', JSON.stringify(this.auditLogs));
    this.renderAuditLogs();

    // Also write the signed audit entry to Firestore when live (same pattern as status changes)
    if (firebaseService.isLiveConnected && firebaseService.db && firebaseService.auth && firebaseService.auth.currentUser) {
      firebaseService.db.collection('auditLogs').add({
        userId: firebaseService.auth.currentUser.uid,
        action: 'partner_status_change',
        targetId: r.id,
        from: prevStatus,
        to: newStatus,
        note: note || '',
        createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
      }).catch(err => console.warn('Audit log write failed:', err));
    }
  }
}
