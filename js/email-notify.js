/**
 * Asks the Netlify email function to send a status / announcement email.
 * Never throws. If the email cannot be sent, it raises the app's normal error toast
 * ("gith-sync-error") with the reason, so the admin can see what is wrong.
 */
import { firebaseService } from './firebase-config.js';

function reportFailure(message) {
  try { window.dispatchEvent(new CustomEvent('gith-sync-error', { detail: { message } })); } catch (e) { /* ignore */ }
}

export async function sendEmailNotice(payload) {
  const user = firebaseService.auth && firebaseService.auth.currentUser;
  if (!(firebaseService.isLiveConnected && user)) return false;
  try {
    const token = await user.getIdToken();
    const res = await fetch('/.netlify/functions/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      let sent = 1;
      try { sent = (await res.json()).sent; } catch (e) { /* ignore */ }
      if (sent === 0) reportFailure('Saved, but no email was sent (the innovator may have no email address).');
      return true;
    }
    let reason = '';
    try { reason = (await res.json()).error || ''; } catch (e) { /* ignore */ }
    if (res.status === 404) reportFailure('Saved, but the email function is missing from this site (deploy the latest zip with the netlify folder).');
    else if (res.status === 503) reportFailure('Saved, but email is not set up: add BREVO_API_KEY and SENDER_EMAIL in Netlify, then deploy again.');
    else if (res.status === 401 || res.status === 403) reportFailure(`Saved, but the email was refused (${reason || res.status}). Sign out and in again, and check your admin role.`);
    else reportFailure(`Saved, but the email could not be sent (${res.status}${reason ? ': ' + reason : ''}). Check Brevo sender and API key.`);
    return false;
  } catch (e) {
    reportFailure('Saved, but the email service could not be reached.');
    return false;
  }
}
