/**
 * DICON GITH admin dashboard - sponsor matching: sponsor-ready tags, partner matches and introductions.
 * Mixed into AdminDashboard (see js/mixin.js); `this` is the AdminDashboard.
 */
import { storage } from './storage.js';
import { firebaseService } from './firebase-config.js';
import { PARTNER_STATUSES } from './partner-service.js';
import { matchingService, matchPartners, canBeReadyForSponsors, INTRO_METHODS, INTRO_OUTCOMES } from './matching-service.js';

export class AdminMatching {
  async startMatchingWatch() {
    try {
      this._matchLive = await matchingService.watchAll(
        {
          onReady: (list) => { this.readyList = list; this.renderMatching(); },
          onIntros: (list) => { this.introList = list; this.renderMatching(); }
        },
        (err) => {
          console.warn('Sponsor matching listener failed:', err);
          this.showToast('Could not load sponsor matching data (permission or network problem).', 'error');
        }
      );
    } catch (err) {
      console.warn('Sponsor matching load failed:', err);
      this.showToast('Could not load sponsor matching data.', 'error');
    }
  }

  bindMatchingEvents() {
    const method = document.getElementById('intro-method');
    if (method) INTRO_METHODS.forEach(m => method.appendChild(new Option(m, m)));
    const outcome = document.getElementById('intro-outcome');
    if (outcome) INTRO_OUTCOMES.forEach(o => outcome.appendChild(new Option(o.label, o.key)));

    document.getElementById('ms-toggle-btn')?.addEventListener('click', () => this.saveSponsorTag(true));
    document.getElementById('ms-remove-btn')?.addEventListener('click', () => this.saveSponsorTag(false));

    const backdrop = document.getElementById('intro-modal-backdrop');
    const close = () => { backdrop && backdrop.classList.remove('active'); this._introCtx = null; };
    document.getElementById('intro-close-btn')?.addEventListener('click', close);
    document.getElementById('intro-cancel-btn')?.addEventListener('click', close);
    if (backdrop) backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    document.getElementById('intro-save-btn')?.addEventListener('click', () => this.saveIntroduction());
  }

  _readyFor(innovationId) {
    return (this.readyList || []).find(r => r.id === innovationId && r.ready) || null;
  }

  _outcomeInfo(key) {
    return INTRO_OUTCOMES.find(o => o.key === key) || INTRO_OUTCOMES[0];
  }

  renderMatching() {
    this.renderMatchingView();
    const drawerOpen = document.getElementById('review-drawer-backdrop')?.classList.contains('active');
    if (drawerOpen && this.activeApplication) this.renderDrawerMatching(this.activeApplication, false);
  }

  renderMatchingView() {
    const ready = (this.readyList || []).filter(r => r.ready);
    const badge = document.getElementById('admin-badge-matching');
    if (badge) badge.textContent = ready.length;

    const tbody = document.getElementById('admin-matching-ready-tbody');
    if (tbody) {
      tbody.innerHTML = '';
      if (ready.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:32px; color:var(--muted-gray);">No innovations are tagged as ready for sponsors yet. Open a recommended innovation and use the Sponsor Matching section.</td></tr>';
      }
      ready.forEach(r => {
        const inno = storage.getInnovationById(r.innovationId) || r;
        const matches = matchPartners({ category: inno.category, state: inno.state }, this.partnerList);
        const full = matches.filter(m => m.full).length;
        const intros = (this.introList || []).filter(i => i.innovationId === r.innovationId).length;
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><code style="font-weight:700; color:var(--deep-forest); font-size:12px;">${this.escapeHtml(r.referenceNumber)}</code></td>
          <td><strong>${this.escapeHtml(inno.innovationName || r.innovationName)}</strong></td>
          <td>${this.escapeHtml(inno.category)}</td>
          <td>${this.escapeHtml(inno.state || 'Nigeria')}</td>
          <td>${full} full match${full === 1 ? '' : 'es'}<div style="font-size:11px; color:var(--muted-gray);">${matches.length} partner${matches.length === 1 ? '' : 's'} in total</div></td>
          <td>${intros}</td>
          <td><button class="btn-table-action">Open</button></td>`;
        tr.querySelector('button').addEventListener('click', () => this.openReviewDrawer(r.innovationId));
        tbody.appendChild(tr);
      });
    }

    const itbody = document.getElementById('admin-matching-intro-tbody');
    if (itbody) {
      itbody.innerHTML = '';
      const intros = this.introList || [];
      if (intros.length === 0) {
        itbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:32px; color:var(--muted-gray);">No introductions logged yet.</td></tr>';
        return;
      }
      intros.forEach(i => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${this.escapeHtml(i.date)}</td>
          <td><strong>${this.escapeHtml(i.innovationName)}</strong><div style="font-size:11px; color:var(--muted-gray);">${this.escapeHtml(i.referenceNumber)}</div></td>
          <td><strong>${this.escapeHtml(i.organisationName)}</strong><div style="font-size:11px; color:var(--muted-gray);">${this.escapeHtml(i.partnerReference)}</div></td>
          <td>${this.escapeHtml(i.method)}</td>
          <td></td>
          <td>${this.escapeHtml(i.loggedByName || '—')}</td>
          <td style="font-size:12px; max-width:240px;">${this.escapeHtml(i.note || '—')}</td>`;
        const sel = document.createElement('select');
        sel.className = 'filter-select';
        sel.setAttribute('aria-label', 'Outcome');
        INTRO_OUTCOMES.forEach(o => sel.appendChild(new Option(o.label, o.key)));
        sel.value = this._outcomeInfo(i.outcome).key;
        sel.addEventListener('change', () => this.changeIntroOutcome(i, sel.value));
        tr.children[4].appendChild(sel);
        itbody.appendChild(tr);
      });
    }
  }

  renderDrawerMatching(inno, resetSummary) {
    const tag = this._readyFor(inno.innovationId);
    const locked = !canBeReadyForSponsors(inno) && !tag;
    const show = (id, on) => { const el = document.getElementById(id); if (el) el.style.display = on ? '' : 'none'; };

    show('ms-locked-note', locked);
    show('ms-controls', !locked);
    show('ms-remove-btn', !!tag);

    const pill = document.getElementById('ms-state-pill');
    if (pill) {
      pill.className = `status-pill ${tag ? 'pill-selected' : 'pill-submitted'}`;
      pill.textContent = tag ? 'Ready for sponsors' : 'Not tagged';
    }
    const line = document.getElementById('ms-state-line');
    if (line) {
      line.textContent = tag
        ? `Tagged by ${tag.markedByName || 'an admin'}${tag.markedAt ? ' on ' + new Date(tag.markedAt).toLocaleDateString() : ''}`
        : '';
    }
    const summary = document.getElementById('ms-summary');
    if (summary && resetSummary) summary.value = tag ? (tag.summary || '') : '';
    const toggle = document.getElementById('ms-toggle-btn');
    if (toggle) toggle.textContent = tag ? 'Save pitch' : 'Mark ready for sponsors';

    // Interested partners (shown for any innovation, so admins can gauge demand early)
    const wrap = document.getElementById('ms-matches-wrap');
    const list = document.getElementById('ms-matches');
    if (!wrap || !list) return;
    wrap.style.display = '';
    list.innerHTML = '';
    const matches = matchPartners(inno, this.partnerList);
    if (matches.length === 0) {
      list.innerHTML = '<div style="font-size:12px; color:var(--muted-gray);">No partners have shown interest in this category or state yet.</div>';
      return;
    }
    matches.forEach(m => {
      const p = m.partner;
      const st = PARTNER_STATUSES.find(s => s.key === (p.status || 'new')) || PARTNER_STATUSES[0];
      const kind = m.full ? 'Full match' : (m.categoryMatch ? 'Category only' : 'State only');
      const past = (this.introList || []).filter(i => i.innovationId === inno.innovationId && i.partnerId === p.id);
      const last = past[0];
      const offers = (p.offerTypes || []).join(', ');

      const row = document.createElement('div');
      row.style.cssText = 'border:1px solid var(--border); border-radius:8px; padding:10px 12px; display:flex; gap:10px; align-items:flex-start; justify-content:space-between;';
      row.innerHTML = `
        <div style="min-width:0;">
          <div style="font-size:13px; font-weight:800;">${this.escapeHtml(p.organisationName)}</div>
          <div style="font-size:11px; color:var(--muted-gray); margin:2px 0 4px;">${this.escapeHtml(p.contactName)} • ${this.escapeHtml(p.email)}</div>
          <div style="font-size:12px;">${this.escapeHtml(offers || '—')}</div>
          <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;">
            <span class="status-pill ${m.full ? 'pill-selected' : 'pill-screening'}">${kind}</span>
            <span class="status-pill ${st.pill}">${this.escapeHtml(st.label)}</span>
            ${last ? `<span class="status-pill ${this._outcomeInfo(last.outcome).pill}">${past.length > 1 ? past.length + ' introductions, latest: ' : ''}${this.escapeHtml(this._outcomeInfo(last.outcome).label)}</span>` : ''}
          </div>
        </div>
        <div></div>`;
      const slot = row.lastElementChild;
      if (tag) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-table-action';
        btn.textContent = past.length ? 'Log another' : 'Log introduction';
        btn.addEventListener('click', () => this.openIntroModal(inno, p));
        slot.appendChild(btn);
      } else {
        slot.innerHTML = '<span style="font-size:11px; color:var(--muted-gray);">Tag as ready to log an introduction</span>';
      }
      list.appendChild(row);
    });
  }

  async saveSponsorTag(ready) {
    const inno = this.activeApplication;
    if (!inno) return;
    const summary = document.getElementById('ms-summary')?.value || '';
    const wasReady = !!this._readyFor(inno.innovationId);
    const btn = document.getElementById(ready ? 'ms-toggle-btn' : 'ms-remove-btn');
    if (btn) btn.disabled = true;
    try {
      await matchingService.setReady(inno, { ready, summary }, this._adminInfo());
      const title = ready
        ? (wasReady ? 'Sponsor pitch updated' : 'Tagged as ready for sponsors')
        : 'Removed from sponsors-ready list';
      this.recordMatchAudit(inno.referenceNumber, inno.innovationId, ready ? 'sponsor_ready_set' : 'sponsor_ready_removed', title, summary);
      if (!this._matchLive) await this.startMatchingWatch();
      this.showToast(title + '.');
    } catch (err) {
      console.warn('Sponsor tag failed:', err);
      const denied = err && err.code === 'permission-denied';
      this.showToast(denied ? 'Could not save: permission denied. Please sign in again.' : (err && err.message) || 'Could not save the change.', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  openIntroModal(inno, partner) {
    this._introCtx = { inno, partner };
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    const sub = document.getElementById('intro-modal-subtitle');
    if (sub) sub.textContent = inno.innovationName + ' • ' + partner.organisationName;
    set('intro-method', INTRO_METHODS[0]);
    set('intro-outcome', INTRO_OUTCOMES[0].key);
    set('intro-date', new Date().toLocaleDateString('en-CA'));
    set('intro-note', '');
    const err = document.getElementById('intro-error');
    if (err) err.style.display = 'none';
    document.getElementById('intro-modal-backdrop')?.classList.add('active');
  }

  async saveIntroduction() {
    const ctx = this._introCtx;
    if (!ctx) return;
    const { inno, partner } = ctx;
    const val = (id) => document.getElementById(id)?.value || '';
    const raw = {
      innovationId: inno.innovationId,
      partnerId: partner.id,
      method: val('intro-method'),
      outcome: val('intro-outcome'),
      date: val('intro-date'),
      note: val('intro-note')
    };
    const errEl = document.getElementById('intro-error');
    const btn = document.getElementById('intro-save-btn');
    if (btn) btn.disabled = true;
    try {
      const res = await matchingService.logIntroduction(raw, {
        referenceNumber: inno.referenceNumber,
        innovationName: inno.innovationName,
        partnerReference: partner.reference,
        organisationName: partner.organisationName
      }, this._adminInfo());
      if (!res.ok) {
        if (errEl) { errEl.textContent = Object.values(res.errors)[0]; errEl.style.display = ''; }
        return;
      }
      this.recordMatchAudit(inno.referenceNumber, inno.innovationId, 'introduction_logged',
        'Introduced to ' + partner.organisationName, raw.note);
      document.getElementById('intro-modal-backdrop')?.classList.remove('active');
      this._introCtx = null;
      if (!this._matchLive) await this.startMatchingWatch();
      this.showToast('Introduction logged.');
    } catch (err) {
      console.warn('Introduction save failed:', err);
      const denied = err && err.code === 'permission-denied';
      this.showToast(denied ? 'Could not save: permission denied. Please sign in again.' : 'Could not save the introduction. Please try again.', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async changeIntroOutcome(intro, outcome) {
    try {
      await matchingService.updateOutcome(intro.id, { outcome }, this._adminInfo());
      this.recordMatchAudit(intro.referenceNumber, intro.innovationId, 'introduction_outcome',
        'Introduction to ' + intro.organisationName + ': ' + this._outcomeInfo(outcome).label, '');
      if (!this._matchLive) await this.startMatchingWatch();
      this.showToast('Outcome updated.');
    } catch (err) {
      console.warn('Outcome update failed:', err);
      this.showToast('Could not update the outcome. Please try again.', 'error');
      this.renderMatchingView();
    }
  }

  recordMatchAudit(referenceNumber, targetId, action, title, note) {
    this.auditLogs.unshift({
      logId: `audit-${Date.now()}`,
      referenceNumber,
      innovationId: targetId,
      adminName: this.currentUser.fullName || 'Admin',
      adminEmail: this.currentUser.email,
      prevStatus: '',
      newStatus: '',
      actionTitle: title,
      note: note || '',
      timestamp: new Date().toISOString()
    });
    localStorage.setItem('dicon_gith_audit_logs', JSON.stringify(this.auditLogs));
    this.renderAuditLogs();

    if (firebaseService.isLiveConnected && firebaseService.db && firebaseService.auth && firebaseService.auth.currentUser) {
      firebaseService.db.collection('auditLogs').add({
        userId: firebaseService.auth.currentUser.uid,
        action,
        targetId,
        note: note || '',
        createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
      }).catch(err => console.warn('Audit log write failed:', err));
    }
  }
}
