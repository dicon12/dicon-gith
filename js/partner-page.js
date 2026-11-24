/**
 * DICON GITH — "Partner with us" page controller
 */

import { GITH_CATEGORIES, NIGERIAN_STATES } from './data.js';
const PAGE_LOADED_AT = Date.now();
import { firebaseService } from './firebase-config.js';
import { legalContentService } from './legal-content.js';
import {
  partnerService,
  ORG_TYPES,
  OFFER_TYPES,
  COMMITMENT_OPTIONS
} from './partner-service.js';

const $ = (id) => document.getElementById(id);
const form = $('partner-form-el');

/* ---------- chips & selects ---------- */

function fillSelect(el, options, placeholder) {
  el.innerHTML = '';
  const first = document.createElement('option');
  first.value = '';
  first.textContent = placeholder;
  el.appendChild(first);
  options.forEach(o => {
    const opt = document.createElement('option');
    opt.value = o;
    opt.textContent = o;
    el.appendChild(opt);
  });
}

function buildChips(container, values, name) {
  container.innerHTML = '';
  values.forEach(v => {
    const label = document.createElement('label');
    label.className = 'pf-chip';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = name;
    input.value = v;
    const span = document.createElement('span');
    span.textContent = v;
    label.append(input, span);
    container.appendChild(label);
  });
}

const checked = (container) =>
  Array.from(container.querySelectorAll('input:checked')).map(i => i.value);

function bindAllToggle(toggleId, chipsId, countId) {
  const toggle = $(toggleId);
  const chips = $(chipsId);
  const count = $(countId);

  const refresh = () => {
    if (toggle.checked) {
      chips.classList.add('is-disabled');
      count.textContent = 'All';
    } else {
      chips.classList.remove('is-disabled');
      count.textContent = String(checked(chips).length);
    }
  };
  toggle.addEventListener('change', refresh);
  chips.addEventListener('change', refresh);
  return refresh;
}

fillSelect($('pf-orgType'), ORG_TYPES, 'Select…');
fillSelect($('pf-commitment'), COMMITMENT_OPTIONS, 'Select (optional)…');
buildChips($('pf-offer-chips'), OFFER_TYPES, 'offerTypes');
buildChips($('pf-cat-chips'), GITH_CATEGORIES, 'categories');
buildChips($('pf-state-chips'), NIGERIAN_STATES, 'states');

const refreshCats = bindAllToggle('pf-all-categories', 'pf-cat-chips', 'pf-cat-count');
const refreshStates = bindAllToggle('pf-all-states', 'pf-state-chips', 'pf-state-count');

const offerBox = $('pf-offerDescription');
offerBox.addEventListener('input', () => {
  $('pf-offer-count').textContent = String(offerBox.value.length);
});

/* ---------- errors ---------- */

function clearErrors() {
  form.querySelectorAll('.has-error').forEach(el => el.classList.remove('has-error'));
  form.querySelectorAll('.pf-error').forEach(el => { el.textContent = ''; });
  const top = $('pf-form-error');
  top.classList.remove('is-visible');
  top.textContent = '';
}

function showErrors(errors) {
  let firstEl = null;
  Object.entries(errors).forEach(([field, msg]) => {
    if (field === 'form') {
      const top = $('pf-form-error');
      top.textContent = msg;
      top.classList.add('is-visible');
      firstEl = firstEl || top;
      return;
    }
    const wrap = form.querySelector(`[data-field="${field}"]`);
    if (!wrap) return;
    wrap.classList.add('has-error');
    const err = wrap.querySelector('.pf-error');
    if (err) err.textContent = msg;
    firstEl = firstEl || wrap;
  });
  if (firstEl) firstEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* ---------- submit ---------- */

function collect() {
  return {
    organisationName: $('pf-organisationName').value,
    orgType: $('pf-orgType').value,
    contactName: $('pf-contactName').value,
    contactRole: $('pf-contactRole').value,
    email: $('pf-email').value,
    phone: $('pf-phone').value,
    website: $('pf-website').value,
    offerTypes: checked($('pf-offer-chips')),
    offerDescription: offerBox.value,
    commitment: $('pf-commitment').value,
    allCategories: $('pf-all-categories').checked,
    categories: checked($('pf-cat-chips')),
    allStates: $('pf-all-states').checked,
    states: checked($('pf-state-chips')),
    consent: $('pf-consent').checked
  };
}

function showSuccess(reference) {
  $('pf-ref').textContent = reference;
  $('pf-form-wrap').style.display = 'none';
  const ok = $('pf-success');
  ok.classList.add('is-visible');
  ok.scrollIntoView({ behavior: 'smooth', block: 'center' });
  ok.focus({ preventScroll: true });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors();

  // Honeypot: bots fill hidden fields (a slow human whose browser autofilled it is not treated as a bot). Pretend success, store nothing.
  if ($('pf-hp').value && Date.now() - PAGE_LOADED_AT < 20000) {
    showSuccess('PRT-00000000');
    return;
  }

  const btn = $('pf-submit');
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Sending…';

  try {
    const result = await partnerService.submit(collect());
    if (!result.ok) {
      showErrors(result.errors);
    } else {
      showSuccess(result.reference);
      form.reset();
      refreshCats();
      refreshStates();
      $('pf-offer-count').textContent = '0';
    }
  } catch (err) {
    console.error('Partner request failed:', err);
    showErrors({ form: 'We could not send your request right now. Please check your connection and try again, or email dicongith@gmail.com.' });
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
});

$('pf-another').addEventListener('click', () => {
  $('pf-success').classList.remove('is-visible');
  $('pf-form-wrap').style.display = '';
  $('partner-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

/* ---------- chrome ---------- */

const menuBtn = $('btn-mobile-menu');
const drawer = $('mobile-drawer');
if (menuBtn && drawer) {
  menuBtn.addEventListener('click', () => {
    drawer.classList.toggle('active');
    menuBtn.textContent = drawer.classList.contains('active') ? '✕' : '☰';
  });
}
$('current-year').textContent = new Date().getFullYear();

legalContentService.initTriggers();
firebaseService.initLive();
