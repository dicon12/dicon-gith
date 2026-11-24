/**
 * DICON GITH - view and download attachments (photos, documents, videos) for reviewers.
 * Used by the admin review drawer and the evaluator page. Every file can be previewed on the page
 * or downloaded. Private files get a short-lived signed link first (see file-upload.js).
 */
import { resolveFileUrls } from './file-upload.js';

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Links come from innovator-controlled fields, so only web links and inline media are allowed.
// Anything else (javascript:, data:text/html, vbscript:, ...) is dropped before it reaches href/src.
export const safeUrl = (u) => {
  const s = String(u ?? '').trim();
  return /^https?:\/\//i.test(s) || /^data:(image\/(png|jpe?g|webp|gif)|video\/(mp4|webm|quicktime)|application\/pdf)[;,]/i.test(s) ? s : '';
};
const ext = (u) => ((String(u).split('?')[0].match(/\.([a-z0-9]+)$/i) || [])[1] || '').toLowerCase();
const isStored = (u) => /\/storage\/v1\/object\/(public|sign)\//.test(u || '') || /^data:/.test(u || '');
function kindOf(u, hint) {
  const e = ext(u);
  if (/^data:image/.test(u) || /^(jpe?g|png|webp|gif)$/.test(e) || hint === 'image') return 'image';
  if (/^data:video/.test(u) || /^(mp4|webm|mov|m4v)$/.test(e)) return 'video';
  if (e === 'pdf' || /^data:application\/pdf/.test(u)) return 'pdf';
  if (hint === 'video' && !isStored(u)) return 'link';   // YouTube / Drive / Loom link
  return 'file';
}
function nameOf(u, given, fallback) {
  if (given) return given;
  try { const n = decodeURIComponent(String(u).split('?')[0].split('/').pop()).replace(/^[a-f0-9]{32}-/, ''); if (n && !/^data:/.test(u)) return n; } catch (e) { /* ignore */ }
  return fallback;
}
const dl = (u, name) => (/\/storage\/v1\/object\/sign\//.test(u) ? u + (u.includes('?') ? '&' : '?') + 'download=' + encodeURIComponent(name) : u);

function lightbox(item) {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(6,24,17,.88);display:flex;flex-direction:column;padding:12px';
  const media = item.kind === 'image' ? `<img src="${esc(item.url)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;margin:auto">`
    : item.kind === 'video' ? `<video src="${esc(item.url)}" controls autoplay playsinline style="max-width:100%;max-height:100%;margin:auto;background:#000"></video>`
    : `<iframe src="${esc(item.url)}" title="${esc(item.name)}" style="flex:1;width:100%;border:0;background:#fff;border-radius:8px"></iframe>`;
  box.innerHTML = `<div style="display:flex;gap:8px;align-items:center;color:#fff;margin-bottom:8px;flex-wrap:wrap"><b style="flex:1;min-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(item.name)}</b>
    <a href="${esc(item.url)}" target="_blank" rel="noopener" style="color:#E8B63A;font-weight:600">Open in new tab</a>
    <a href="${esc(dl(item.url, item.name))}" download="${esc(item.name)}" style="color:#E8B63A;font-weight:600">Download</a>
    <button type="button" data-x style="background:#fff;border:0;border-radius:8px;padding:6px 12px;font-weight:700;cursor:pointer">Close</button></div><div style="flex:1;display:flex;min-height:0">${media}</div>`;
  const close = () => { document.removeEventListener('keydown', key); box.remove(); };
  const key = (e) => { if (e.key === 'Escape') close(); };
  box.querySelector('[data-x]').onclick = close; box.addEventListener('click', (e) => { if (e.target === box) close(); });
  document.addEventListener('keydown', key); document.body.appendChild(box);
}

/** Fills `box` with every attachment of an innovation, each with View and Download. */
export async function renderAttachments(box, inno) {
  const raw = [];
  (inno.imageUrls || []).forEach((u, i) => u && raw.push({ u, hint: 'image', fb: `photo-${i + 1}` }));
  (inno.documentUrls || []).forEach((d, i) => { const u = typeof d === 'string' ? d : d && d.url; if (u) raw.push({ u, name: typeof d === 'object' ? d.name : '', hint: 'doc', fb: `document-${i + 1}` }); });
  (inno.videoUrls || []).forEach((u, i) => u && raw.push({ u, hint: 'video', fb: `video-${i + 1}` }));
  for (let i = raw.length - 1; i >= 0; i--) if (!safeUrl(raw[i].u)) raw.splice(i, 1);
  if (!raw.length) { box.innerHTML = '<div style="font-size:12px;color:var(--muted-gray,#5f6f68);font-style:italic">No photos, documents or videos attached to this submission.</div>'; return; }
  box.innerHTML = '<div style="font-size:12px;color:var(--muted-gray,#5f6f68)">Loading files…</div>';
  const urls = await resolveFileUrls(raw.map((r) => r.u), inno.innovationId || inno.id);
  const items = raw.map((r, i) => ({ url: safeUrl(urls[i]) || safeUrl(r.u), kind: kindOf(r.u, r.hint), name: nameOf(r.u, r.name, r.fb) }));
  const btn = 'border:1px solid #0A3323;background:#fff;color:#0A3323;border-radius:8px;padding:6px 12px;font:600 12px inherit;font-family:inherit;cursor:pointer;text-decoration:none;display:inline-block';
  box.innerHTML = items.map((it, i) => {
    const thumb = it.kind === 'image' ? `<img src="${esc(it.url)}" alt="" style="width:64px;height:48px;object-fit:cover;border-radius:6px;border:1px solid #dfe5e2">`
      : `<span style="width:64px;height:48px;border-radius:6px;background:#eef3f0;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#0A3323">${it.kind === 'video' || it.kind === 'link' ? 'VIDEO' : it.kind === 'pdf' ? 'PDF' : (ext(it.name) || 'FILE').toUpperCase().slice(0, 4)}</span>`;
    const actions = it.kind === 'link' ? `<a style="${btn}" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">Open link</a>`
      : (it.kind !== 'file' ? `<button type="button" style="${btn}" data-view="${i}">View</button>` : '') +
        `<a style="${btn}" href="${esc(dl(it.url, it.name))}" download="${esc(it.name)}" target="_blank" rel="noopener">Download</a>`;
    return `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:6px 0;border-bottom:1px solid #eef3f0">${thumb}<span style="flex:1;min-width:120px;font-size:13px;font-weight:600;word-break:break-word">${esc(it.name)}</span>${actions}</div>`;
  }).join('');
  box.querySelectorAll('[data-view]').forEach((b) => { b.onclick = () => lightbox(items[Number(b.dataset.view)]); });
}
