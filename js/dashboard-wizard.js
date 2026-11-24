/**
 * DICON GITH innovator dashboard - the 7-step innovation submission wizard, drafts and (re)submission.
 * Mixed into InnovatorDashboard (see js/mixin.js); `this` is the InnovatorDashboard.
 */
import { compressImage } from './image-compress.js';
import { uploadToCloud, canUploadToCloud, dataUrlToFile } from './file-upload.js';
import { storage } from './storage.js';

export class SubmissionWizard {
  // ---- 7-STEP INNOVATION SUBMISSION WIZARD ----
  bindWizardEvents() {
    const prevBtn = document.getElementById('wiz-btn-prev');
    const nextBtn = document.getElementById('wiz-btn-next');
    const draftBtn = document.getElementById('wiz-btn-draft');
    const form = document.getElementById('submission-wizard-form');

    // Clickable Step Nodes in Wizard Header
    document.querySelectorAll('.wizard-step-node').forEach(node => {
      node.style.cursor = 'pointer';
      node.addEventListener('click', () => {
        const targetStep = parseInt(node.getAttribute('data-step'), 10);
        if (targetStep < this.currentStep) {
          this.goToWizardStep(targetStep);
        } else if (targetStep === this.currentStep + 1 && this.validateWizardStep(this.currentStep)) {
          this.goToWizardStep(targetStep);
        }
      });
    });

    // File Upload Zones with drag/drop, keyboard, and real FileReader
    const photoZone = document.getElementById('zone-photo');
    const photoInput = document.getElementById('file-photo');
    if (photoZone && photoInput) {
      photoZone.addEventListener('click', () => photoInput.click());
      photoZone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          photoInput.click();
        }
      });

      photoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Size check (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
          this.showToast('Photo file exceeds the 10MB limit. Please choose a smaller file.', 'error');
          photoInput.value = '';
          return;
        }

        const statusEl = document.getElementById('file-photo-status');
        compressImage(file).then(async ({ dataUrl, size }) => {
          let finalUrl = dataUrl;
          if (canUploadToCloud()) {
            statusEl.textContent = `Uploading ${file.name}...`;
            try { finalUrl = await uploadToCloud(dataUrl.startsWith('data:') ? dataUrlToFile(dataUrl, file.name) : file, 'innovation-photo'); }
            catch (err) { statusEl.textContent = ''; photoInput.value = ''; this.showToast(err.message || 'Photo upload failed. Please try again.', 'error'); return; }
          }
          this.uploadedPhoto = {
            name: file.name,
            size: `${(size / (1024 * 1024)).toFixed(1)} MB`,
            url: finalUrl
          };
          statusEl.textContent = `✓ Selected: ${file.name} (${this.uploadedPhoto.size})`;
          this.showToast('Prototype photo loaded successfully!');
        }).catch(() => this.showToast('Could not read that photo. Please try another.', 'error'));
      });
    }

    const docZone = document.getElementById('zone-doc');
    const docInput = document.getElementById('file-doc');
    if (docZone && docInput) {
      docZone.addEventListener('click', () => docInput.click());
      docZone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          docInput.click();
        }
      });

      docInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Size check (max 15MB)
        if (file.size > 15 * 1024 * 1024) {
          this.showToast('Document file exceeds the 15MB limit. Please choose a smaller file.', 'error');
          docInput.value = '';
          return;
        }

        const docStatus = document.getElementById('file-doc-status');
        const finish = (url) => {
          this.uploadedDoc = {
            name: file.name,
            size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
            url
          };
          docStatus.textContent = `✓ Selected: ${file.name} (${this.uploadedDoc.size})`;
          this.showToast('Technical document loaded successfully!');
        };
        if (canUploadToCloud()) {
          docStatus.textContent = `Uploading ${file.name}...`;
          uploadToCloud(file, 'innovation-doc').then(finish).catch((err) => {
            docStatus.textContent = ''; docInput.value = '';
            this.showToast(err.message || 'Document upload failed. Please try again.', 'error');
          });
        } else {
          const reader = new FileReader();
          reader.onload = (re) => finish(re.target.result);
          reader.readAsDataURL(file);
        }
      });
    }

    const vidZone = document.getElementById('zone-video');
    const vidInput = document.getElementById('file-video');
    if (vidZone && vidInput) {
      vidZone.addEventListener('click', () => vidInput.click());
      vidZone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); vidInput.click(); } });
      vidInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const st = document.getElementById('file-video-status');
        if (file.size > 50 * 1024 * 1024) { this.showToast('Video exceeds the 50MB limit. Please choose a shorter clip or use a link.', 'error'); vidInput.value = ''; return; }
        if (!canUploadToCloud()) { this.showToast('Video upload works on the live site after you sign in. You can use a link instead.', 'error'); vidInput.value = ''; return; }
        st.textContent = `Uploading ${file.name}...`;
        uploadToCloud(file, 'innovation-video').then((url) => {
          this.uploadedVideo = { name: file.name, size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`, url };
          st.textContent = `✓ Selected: ${file.name} (${this.uploadedVideo.size})`;
          this.showToast('Video uploaded successfully!');
        }).catch((err) => { st.textContent = ''; vidInput.value = ''; this.showToast(err.message || 'Video upload failed. Please try again.', 'error'); });
      });
    }

    // Support step: live character count, clear error state on selection
    const supportNote = document.getElementById('wiz-support-note');
    if (supportNote) supportNote.addEventListener('input', () => this.updateSupportNoteCount());
    document.querySelectorAll('input[name="wiz-support"]').forEach(cb => {
      cb.addEventListener('change', () => {
        if (this.getSelectedSupport().length) {
          document.getElementById('wiz-support-options').classList.remove('is-invalid');
        }
      });
    });

    // Step Continue
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (this.validateWizardStep(this.currentStep)) {
          this.goToWizardStep(this.currentStep + 1);
        }
      });
    }

    // Step Back
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (this.currentStep > 1) {
          this.goToWizardStep(this.currentStep - 1);
        }
      });
    }

    // Save Draft
    if (draftBtn) {
      draftBtn.addEventListener('click', () => {
        this.saveCurrentDraft();
      });
    }

    // Final Submit
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.submitFinalInnovation();
      });
    }

    // Check for existing draft to restore
    this.restoreExistingDraft();
  }

  validateWizardStep(step) {
    if (step === 1) {
      const title = document.getElementById('wiz-title');
      const cat = document.getElementById('wiz-category');
      const stage = document.getElementById('wiz-stage');
      const state = document.getElementById('wiz-state');
      const lga = document.getElementById('wiz-lga');

      let valid = true;
      [title, cat, stage, state, lga].forEach(field => {
        if (!field.value.trim()) {
          field.classList.add('is-invalid');
          valid = false;
        } else {
          field.classList.remove('is-invalid');
        }
      });

      if (!valid) {
        this.showToast("Please complete all required fields marked with * in Step 1.", "error");
        return false;
      }
    } else if (step === 2) {
      const prob = document.getElementById('wiz-problem');
      const target = document.getElementById('wiz-target-users');
      const imp = document.getElementById('wiz-importance');

      let valid = true;
      [prob, target, imp].forEach(field => {
        if (!field.value.trim()) {
          field.classList.add('is-invalid');
          valid = false;
        } else {
          field.classList.remove('is-invalid');
        }
      });

      if (!valid) {
        this.showToast("Please complete all problem details in Step 2.", "error");
        return false;
      }
    } else if (step === 3) {
      const sol = document.getElementById('wiz-solution');
      const how = document.getElementById('wiz-how-it-works');
      const uniq = document.getElementById('wiz-uniqueness');

      let valid = true;
      [sol, how, uniq].forEach(field => {
        if (!field.value.trim()) {
          field.classList.add('is-invalid');
          valid = false;
        } else {
          field.classList.remove('is-invalid');
        }
      });

      if (!valid) {
        this.showToast("Please describe your solution and its uniqueness in Step 3.", "error");
        return false;
      }
    } else if (step === 6) {
      const group = document.getElementById('wiz-support-options');
      if (this.getSelectedSupport().length === 0) {
        if (group) group.classList.add('is-invalid');
        this.showToast("Please select at least one type of support you are looking for.", "error");
        return false;
      }
      if (group) group.classList.remove('is-invalid');
    }
    return true;
  }

  // ---- SUPPORT NEEDED (Step 6) ----
  getSelectedSupport() {
    return Array.from(document.querySelectorAll('input[name="wiz-support"]:checked'))
      .map(cb => cb.value);
  }

  setSelectedSupport(values) {
    const chosen = Array.isArray(values) ? values : [];
    document.querySelectorAll('input[name="wiz-support"]').forEach(cb => {
      cb.checked = chosen.includes(cb.value);
    });
    const group = document.getElementById('wiz-support-options');
    if (group && chosen.length) group.classList.remove('is-invalid');
  }

  setSupportNote(text) {
    const note = document.getElementById('wiz-support-note');
    if (note) note.value = text || '';
    this.updateSupportNoteCount();
  }

  updateSupportNoteCount() {
    const note = document.getElementById('wiz-support-note');
    const count = document.getElementById('wiz-support-note-count');
    if (note && count) count.textContent = note.value.length;
  }

  goToWizardStep(step) {
    this.currentStep = step;

    // Panes
    document.querySelectorAll('.wizard-pane').forEach(p => p.classList.remove('active'));
    const currentPane = document.querySelector(`.wizard-pane[data-pane="${step}"]`);
    if (currentPane) currentPane.classList.add('active');

    // Header nodes
    document.querySelectorAll('.wizard-step-node').forEach(node => {
      const nodeStep = parseInt(node.getAttribute('data-step'), 10);
      node.classList.remove('active', 'completed');
      if (nodeStep === step) {
        node.classList.add('active');
      } else if (nodeStep < step) {
        node.classList.add('completed');
      }
    });

    // Buttons
    const prevBtn = document.getElementById('wiz-btn-prev');
    const nextBtn = document.getElementById('wiz-btn-next');
    const submitBtn = document.getElementById('wiz-btn-submit');

    if (prevBtn) prevBtn.disabled = step === 1;

    if (step === this.totalSteps) {
      if (nextBtn) nextBtn.style.display = 'none';
      if (submitBtn) submitBtn.style.display = 'inline-flex';
      this.generateWizardSummary();
    } else {
      if (nextBtn) nextBtn.style.display = 'inline-flex';
      if (submitBtn) submitBtn.style.display = 'none';
    }
  }

  generateWizardSummary() {
    const summaryBox = document.getElementById('wizard-summary-box');
    if (!summaryBox) return;

    summaryBox.innerHTML = `
      <div style="font-weight:800; font-size:16px; margin-bottom:12px; color:var(--deep-forest);">
        ${this.escapeHtml(document.getElementById('wiz-title').value)}
      </div>
      <div class="wizard-summary-meta">
        <div><strong>Category:</strong> ${this.escapeHtml(document.getElementById('wiz-category').value)}</div>
        <div><strong>Stage:</strong> ${this.escapeHtml(document.getElementById('wiz-stage').value)}</div>
        <div><strong>Location:</strong> ${this.escapeHtml(document.getElementById('wiz-lga').value)}, ${this.escapeHtml(document.getElementById('wiz-state').value)} State</div>
        <div><strong>IP Status:</strong> ${this.escapeHtml(document.getElementById('wiz-ip-status').value)}</div>
      </div>
      <div style="margin-bottom:8px;">
        <strong>Problem Summary:</strong>
        <p style="color:var(--muted-gray); margin-top:2px;">${this.escapeHtml(document.getElementById('wiz-problem').value)}</p>
      </div>
      <div>
        <strong>Solution Overview:</strong>
        <p style="color:var(--muted-gray); margin-top:2px;">${this.escapeHtml(document.getElementById('wiz-solution').value)}</p>
      </div>
      <div style="margin-top:8px;">
        <strong>Support Needed:</strong>
        <p style="color:var(--muted-gray); margin-top:2px;">${this.escapeHtml(this.getSelectedSupport().join(', ') || 'None selected')}</p>
        ${document.getElementById('wiz-support-note').value.trim() ? `<p style="color:var(--muted-gray); margin-top:2px;">${this.escapeHtml(document.getElementById('wiz-support-note').value.trim())}</p>` : ''}
      </div>
      ${this.uploadedPhoto ? `<div style="margin-top:10px; font-weight:600; color:var(--primary-green);">✓ Photography Attached: ${this.escapeHtml(this.uploadedPhoto.name)}</div>` : ''}
      ${this.uploadedDoc ? `<div style="margin-top:4px; font-weight:600; color:var(--primary-green);">✓ Document Attached: ${this.escapeHtml(this.uploadedDoc.name)}</div>` : ''}
    `;
  }

  saveCurrentDraft() {
    const user = this.currentUser;
    const uid = user ? user.uid : 'anon';

    const draftData = {
      innovationName: document.getElementById('wiz-title').value.trim(),
      category: document.getElementById('wiz-category').value,
      developmentStage: document.getElementById('wiz-stage').value,
      state: document.getElementById('wiz-state').value,
      lga: document.getElementById('wiz-lga').value.trim(),
      teamName: document.getElementById('wiz-team').value.trim(),
      problemDescription: document.getElementById('wiz-problem').value.trim(),
      targetUsers: document.getElementById('wiz-target-users').value.trim(),
      problemImportance: document.getElementById('wiz-importance').value.trim(),
      solutionDescription: document.getElementById('wiz-solution').value.trim(),
      howItWorks: document.getElementById('wiz-how-it-works').value.trim(),
      uniqueness: document.getElementById('wiz-uniqueness').value.trim(),
      ipStatus: document.getElementById('wiz-ip-status').value,
      requiresIpSupport: document.getElementById('wiz-ip-support').checked,
      supportNeeded: this.getSelectedSupport(),
      supportNote: document.getElementById('wiz-support-note').value.trim(),
      uploadedPhoto: this.uploadedPhoto,
      uploadedDoc: this.uploadedDoc
    };

    storage.saveDraft(draftData, uid);
    this.showToast('Draft saved successfully! You can resume anytime.');
    this.renderOverviewStats();
    this.renderDrafts();
  }

  restoreExistingDraft() {
    const user = this.currentUser;
    const uid = user ? user.uid : null;
    const draft = storage.getDraft(uid);
    if (!draft) return;

    if (draft.innovationName) document.getElementById('wiz-title').value = draft.innovationName;
    if (draft.category) document.getElementById('wiz-category').value = draft.category;
    if (draft.developmentStage) document.getElementById('wiz-stage').value = draft.developmentStage;
    if (draft.state) document.getElementById('wiz-state').value = draft.state;
    if (draft.lga) document.getElementById('wiz-lga').value = draft.lga;
    if (draft.teamName) document.getElementById('wiz-team').value = draft.teamName;
    if (draft.problemDescription) document.getElementById('wiz-problem').value = draft.problemDescription;
    if (draft.targetUsers) document.getElementById('wiz-target-users').value = draft.targetUsers;
    if (draft.problemImportance) document.getElementById('wiz-importance').value = draft.problemImportance;
    if (draft.solutionDescription) document.getElementById('wiz-solution').value = draft.solutionDescription;
    if (draft.howItWorks) document.getElementById('wiz-how-it-works').value = draft.howItWorks;
    if (draft.uniqueness) document.getElementById('wiz-uniqueness').value = draft.uniqueness;
    if (draft.ipStatus) document.getElementById('wiz-ip-status').value = draft.ipStatus;
    if (typeof draft.requiresIpSupport === 'boolean') {
      document.getElementById('wiz-ip-support').checked = draft.requiresIpSupport;
    }
    this.setSelectedSupport(draft.supportNeeded);
    this.setSupportNote(draft.supportNote);
    if (draft.uploadedPhoto) {
      this.uploadedPhoto = draft.uploadedPhoto;
      const el = document.getElementById('file-photo-status');
      if (el) el.textContent = `✓ Saved in draft: ${draft.uploadedPhoto.name}`;
    }
    if (draft.uploadedDoc) {
      this.uploadedDoc = draft.uploadedDoc;
      const el = document.getElementById('file-doc-status');
      if (el) el.textContent = `✓ Saved in draft: ${draft.uploadedDoc.name}`;
    }
  }

  submitFinalInnovation() {
    const declaration = document.getElementById('wiz-declaration');
    if (!declaration.checked) {
      this.showToast("Please confirm the legal declaration before submitting.", "error");
      return;
    }

    if (!this.validateWizardStep(6)) {
      this.goToWizardStep(6);
      return;
    }

    const data = {
      innovationName: document.getElementById('wiz-title').value.trim(),
      category: document.getElementById('wiz-category').value,
      developmentStage: document.getElementById('wiz-stage').value,
      state: document.getElementById('wiz-state').value,
      lga: document.getElementById('wiz-lga').value.trim(),
      teamName: document.getElementById('wiz-team').value.trim(),
      problemDescription: document.getElementById('wiz-problem').value.trim(),
      targetUsers: document.getElementById('wiz-target-users').value.trim(),
      problemImportance: document.getElementById('wiz-importance').value.trim(),
      solutionDescription: document.getElementById('wiz-solution').value.trim(),
      howItWorks: document.getElementById('wiz-how-it-works').value.trim(),
      uniqueness: document.getElementById('wiz-uniqueness').value.trim(),
      ipStatus: document.getElementById('wiz-ip-status').value,
      requiresIpSupport: document.getElementById('wiz-ip-support').checked,
      supportNeeded: this.getSelectedSupport(),
      supportNote: document.getElementById('wiz-support-note').value.trim(),
      imageUrls: this.uploadedPhoto ? [this.uploadedPhoto.url] : [],
      documentUrls: this.uploadedDoc ? [{ name: this.uploadedDoc.name, size: this.uploadedDoc.size, url: this.uploadedDoc.url }] : [],
      videoUrls: [...(this.uploadedVideo ? [this.uploadedVideo.url] : []), ...(/^https?:\/\/\S+$/i.test(document.getElementById('wiz-video').value.trim()) ? [document.getElementById('wiz-video').value.trim()] : [])]
    };

    try {
      // If editing a returned innovation, update it; otherwise create new
      let created;
      if (this.editingInnovationId) {
        const updated = storage.resubmitOwnInnovation(this.editingInnovationId, data);
        if (updated) {
          created = updated;
          this.editingInnovationId = null;
        } else {
          created = storage.submitInnovation(data);
        }
      } else {
        created = storage.submitInnovation(data);
      }

      this.showToast(`Application Submitted! Ref: ${created.referenceNumber}`, 'success');

      // Reset wizard form and uploaded files
      document.getElementById('submission-wizard-form').reset();
      this.updateSupportNoteCount();
      this.uploadedPhoto = null;
      this.uploadedDoc = null;
      this.uploadedVideo = null;
      document.getElementById('file-photo-status').textContent = '';
      document.getElementById('file-doc-status').textContent = '';
      this.goToWizardStep(1);

      // Refresh overview and list
      this.renderOverviewStats();
      this.renderInnovationsTable();

      // Navigate to tracking
      this.activeTrackingId = created.innovationId;
      window.location.hash = '#tracking';

    } catch (err) {
      this.showToast(`Submission error: ${err.message}`, 'error');
    }
  }
}
