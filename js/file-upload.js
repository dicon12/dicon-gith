/**
 * Uploads a file to Supabase Storage through the Netlify function /.netlify/functions/upload-url
 * and returns its public link. Only the short link is then saved in Firestore, so the 1 MB
 * Firestore document limit no longer applies to photos and documents.
 *
 * kind: 'profile' | 'innovation-photo' | 'innovation-doc'
 */
import { firebaseService } from './firebase-config.js';

export function canUploadToCloud() {
  return !!(firebaseService.isLiveConnected && firebaseService.auth && firebaseService.auth.currentUser);
}

export async function uploadToCloud(file, kind) {
  const user = firebaseService.auth && firebaseService.auth.currentUser;
  if (!(firebaseService.isLiveConnected && user)) throw new Error('Sign in to upload files.');
  const token = await user.getIdToken();

  const res = await fetch('/.netlify/functions/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ kind, filename: file.name || 'file', contentType: file.type, size: file.size }),
  });
  let info = {};
  try { info = await res.json(); } catch (e) { /* ignore */ }
  if (!res.ok) {
    if (res.status === 404) throw new Error('File upload is not available on this site yet (the upload function is missing).');
    throw new Error(info.error || `Upload could not start (${res.status}).`);
  }

  // Supabase signed upload: PUT multipart form with the file under an empty field name.
  const form = new FormData();
  form.append('cacheControl', '31536000');
  form.append('', file);
  const put = await fetch(info.uploadUrl, { method: 'PUT', body: form });
  if (!put.ok) throw new Error(`Upload failed (${put.status}). Please try again.`);
  return info.publicUrl;
}

/** Turns a data: URL (from the image compressor) back into a File so it can be uploaded. */
export function dataUrlToFile(dataUrl, name = 'photo.jpg') {
  const [head, b64] = dataUrl.split(',');
  const type = (head.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
  const bin = atob(b64); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const ext = type.split('/')[1] || 'jpg';
  return new File([arr], name.replace(/\.[^.]+$/, '') + '.' + ext, { type });
}

/**
 * Private files: innovation photos and documents are stored in a private bucket. The saved link is only a
 * reference; this asks the file-url function for a one-hour signed link. The owner and admins always get one;
 * an evaluator or mentor only when `innovationId` is passed and Firestore lets them read that innovation.
 * Links that are not from the private bucket (profile photos, other external images) are returned unchanged.
 */
const _signed = new Map();
export async function resolveFileUrls(urls, innovationId = '') {
  const user = firebaseService.auth && firebaseService.auth.currentUser;
  const todo = [...new Set(urls)].filter((u) => /\/storage\/v1\/object\/(public|sign)\//.test(u || '') && !(_signed.get(u) && _signed.get(u).exp > Date.now()));
  if (todo.length && user) {
    try {
      const token = await user.getIdToken();
      for (let i = 0; i < todo.length; i += 20) {
        const res = await fetch('/.netlify/functions/file-url', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ urls: todo.slice(i, i + 20), innovationId: innovationId || undefined }) });
        if (res.ok) { const d = await res.json(); Object.entries(d.urls || {}).forEach(([k, v]) => _signed.set(k, { url: v, exp: Date.now() + 50 * 60 * 1000 })); }
      }
    } catch (e) { /* fall back to the stored link */ }
  }
  return urls.map((u) => (_signed.get(u) && _signed.get(u).url) || u);
}
export async function resolveFileUrl(url) { return (await resolveFileUrls([url]))[0]; }
/** Fills every <img data-private-src> / <a data-private-href> inside root with signed links. */
export async function hydratePrivateFiles(root = document) {
  const imgs = [...root.querySelectorAll('img[data-private-src]')], links = [...root.querySelectorAll('a[data-private-href]')];
  const all = await resolveFileUrls([...imgs.map((e) => e.dataset.privateSrc), ...links.map((e) => e.dataset.privateHref)]);
  imgs.forEach((e, i) => { e.src = all[i]; }); links.forEach((e, i) => { e.href = all[imgs.length + i]; });
}
