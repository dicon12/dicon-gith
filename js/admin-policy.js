/**
 * DICON GITH admin dashboard - editor for the privacy policy, terms and other institutional content.
 * Mixed into AdminDashboard (see js/mixin.js); `this` is the AdminDashboard.
 */
import { legalContentService } from './legal-content.js';

export class AdminPolicyEditor {
  // ---- SYSTEM POLICIES & INSTITUTIONAL CONTENT EDITOR ----
  async initPolicyEditor() {
    this.activePolicyType = 'privacy';
    this.isPolicyPreviewMode = false;

    const textarea = document.getElementById('admin-policy-textarea');
    const titleEl = document.getElementById('admin-policy-editor-title');
    const subEl = document.getElementById('admin-policy-editor-sub');
    const statsEl = document.getElementById('admin-policy-meta-stats');
    const previewPane = document.getElementById('admin-policy-preview-pane');
    const editPane = document.getElementById('admin-policy-edit-pane');
    const btnEdit = document.getElementById('btn-mode-edit');
    const btnPreview = document.getElementById('btn-mode-preview');
    const btnSave = document.getElementById('btn-admin-policy-save');
    const btnReset = document.getElementById('btn-admin-policy-reset');
    const btnPublicModal = document.getElementById('btn-admin-preview-public');
    const tabs = document.querySelectorAll('.admin-policy-tab');

    if (!textarea) return;

    const updateStats = () => {
      const text = textarea.value || '';
      const chars = text.length;
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      if (statsEl) {
        statsEl.textContent = `Characters: ${chars.toLocaleString()} • Words: ${words.toLocaleString()}`;
      }
    };

    const loadPolicy = async (type) => {
      this.activePolicyType = type;
      tabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.policy === type);
      });

      const titles = {
        privacy: { title: 'Privacy Policy Editor', sub: 'Governs personal data protection, Section 11 Data Security & Section 12 Data Breaches' },
        terms: { title: 'Terms & Conditions Editor', sub: 'Governs participation rules, Section 20 Indemnity, Dispute Resolution, and DICON GITH mandate' },
        about: { title: 'About GITH Institutional Charter Editor', sub: 'The complete 11-section framework, DICON partnership, and innovation development pathway' }
      };

      if (titleEl) titleEl.textContent = titles[type]?.title || 'Policy Editor';
      if (subEl) subEl.textContent = titles[type]?.sub || 'Official Platform Policy';

      const policyData = await legalContentService.getPolicy(type);
      textarea.value = policyData.content || '';
      updateStats();

      if (this.isPolicyPreviewMode && previewPane) {
        previewPane.innerHTML = legalContentService.renderPolicyToHtml(textarea.value);
      }
    };

    // Tab clicks
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const type = tab.dataset.policy;
        if (type) loadPolicy(type);
      });
    });

    // Textarea input
    textarea.addEventListener('input', updateStats);

    // Edit vs Preview mode toggle
    if (btnEdit && btnPreview) {
      btnEdit.addEventListener('click', () => {
        this.isPolicyPreviewMode = false;
        btnEdit.classList.add('active');
        btnPreview.classList.remove('active');
        if (editPane) editPane.style.display = 'block';
        if (previewPane) previewPane.style.display = 'none';
      });

      btnPreview.addEventListener('click', () => {
        this.isPolicyPreviewMode = true;
        btnPreview.classList.add('active');
        btnEdit.classList.remove('active');
        if (editPane) editPane.style.display = 'none';
        if (previewPane) {
          previewPane.style.display = 'block';
          previewPane.innerHTML = legalContentService.renderPolicyToHtml(textarea.value);
        }
      });
    }

    // Save Policy Button
    if (btnSave) {
      btnSave.addEventListener('click', async () => {
        const text = textarea.value;
        btnSave.disabled = true;
        btnSave.innerHTML = `<span style="display:inline-block; animation:spin 1s linear infinite;">⏳</span> Saving...`;

        try {
          const author = this.currentUser?.fullName || 'Admin Reviewer';
          await legalContentService.savePolicy(this.activePolicyType, text, author);

          // Append to Immutable Audit Logs
          const auditEntry = {
            timestamp: new Date().toISOString(),
            adminName: author,
            actionTitle: `Updated ${legalContentService.titles[this.activePolicyType] || this.activePolicyType}`,
            referenceNumber: 'SYS-POL-' + this.activePolicyType.toUpperCase(),
            prevStatus: 'active',
            newStatus: 'published',
            note: `Updated and synchronized ${this.activePolicyType} across GITH portal.`
          };
          this.auditLogs.unshift(auditEntry);
          localStorage.setItem('dicon_gith_audit_logs', JSON.stringify(this.auditLogs));
          this.renderAuditLogs();

          this.showToast(`✓ ${legalContentService.titles[this.activePolicyType]} saved and published successfully!`);
        } catch (e) {
          this.showToast(`Error saving policy: ${e.message}`, 'error');
        } finally {
          btnSave.disabled = false;
          btnSave.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
            <span>Save & Publish Changes</span>
          `;
        }
      });
    }

    // Reset Policy Button
    if (btnReset) {
      btnReset.addEventListener('click', async () => {
        const confirmed = confirm(`Are you sure you want to reset "${legalContentService.titles[this.activePolicyType]}" to the official institutional default?`);
        if (!confirmed) return;

        const defaultContent = await legalContentService.resetPolicy(this.activePolicyType);
        textarea.value = defaultContent;
        updateStats();

        if (this.isPolicyPreviewMode && previewPane) {
          previewPane.innerHTML = legalContentService.renderPolicyToHtml(defaultContent);
        }

        this.showToast(`✓ Reset ${legalContentService.titles[this.activePolicyType]} to official default.`);
      });
    }

    // Public modal preview
    if (btnPublicModal) {
      btnPublicModal.addEventListener('click', () => {
        legalContentService.openModal(this.activePolicyType);
      });
    }

    // Initial load
    await loadPolicy('privacy');
  }
}
