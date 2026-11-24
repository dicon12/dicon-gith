/** Innovator dashboard: "Upcoming Opportunities" card from published events. */
import { phase2 } from './phase2-service.js';
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function init() {
  const host = document.getElementById('view-overview'); if (!host) return;
  const today = new Date().toISOString().slice(0, 10);
  let events = [];
  try { await new Promise(r => setTimeout(r, 800)); events = (await phase2.getEvents(true)).filter(e => String(e.date).slice(0, 10) >= today).slice(0, 5); } catch (e) { return; }
  if (!events.length) return;
  host.insertAdjacentHTML('beforeend', `<div class="content-card" style="padding:18px;margin-top:16px"><div class="card-header-title" style="margin-bottom:8px">Upcoming Opportunities</div>` +
    events.map(e => `<div style="padding:10px 0;border-top:1px solid #e5ebe8"><b>${esc(e.title)}</b><div style="font-size:13px;color:#5f6f68">${esc(String(e.date).slice(0, 10))}${e.location ? ' · ' + esc(e.location) : ''}</div>${e.description ? `<div style="font-size:14px;margin-top:4px">${esc(e.description)}</div>` : ''}</div>`).join('') + '</div>');
}
document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
