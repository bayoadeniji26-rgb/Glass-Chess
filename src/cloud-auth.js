/*
 * Glass Chess donation and support messaging.
 * Account authentication and cloud saves live in src/clerk-auth.js.
 */
import './cloud-auth.css';

const CASHAPP_TAG = '$RaphaelAboy';
const CASHAPP_URL = 'https://cash.app/$RaphaelAboy';
const EMAILJS_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID || 'service_3l9tc2a';
const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || 'template_qwi52h9';
const EMAILJS_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY || 'aKuTsseHTnwR-RWg';

const $ = id => document.getElementById(id);
let supportMode = 'donate';
let lastSupportOpener = null;

function toast(message, isError = false) {
  let node = $('gc-save-toast');
  if (!node) {
    node = document.createElement('div');
    node.id = 'gc-save-toast';
    node.setAttribute('role', 'status');
    document.body.appendChild(node);
  }
  node.textContent = message;
  node.classList.toggle('gc-toast-error', Boolean(isError));
  node.classList.add('gc-toast-visible');
  clearTimeout(node._hideTimer);
  node._hideTimer = setTimeout(() => node.classList.remove('gc-toast-visible'), 2800);
}


function mountDonationDialog() {
  if ($('gc-donation-dialog')) return;
  const modal = document.createElement('section');
  modal.id = 'gc-donation-dialog';
  modal.className = 'gc-donation-overlay';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="gc-donation-card" role="dialog" aria-modal="true" aria-labelledby="gc-donation-title">
      <header class="gc-donation-header">
        <div class="gc-donation-mark" aria-hidden="true">$</div>
        <div><small>SUPPORT THE PROJECT</small><h2 id="gc-donation-title">Support Glass Chess</h2>
        <p>Your contribution helps keep the board improving.</p></div>
        <button type="button" id="gc-donation-close" aria-label="Close donation dialog">×</button>
      </header>
      <form id="gc-donation-form">
        <label for="gc-donation-name">Your name <span>(optional)</span></label>
        <input id="gc-donation-name" name="from_name" maxlength="80" autocomplete="name" placeholder="Name">
        <label for="gc-donation-email">Your email <span>(optional, for a reply)</span></label>
        <input id="gc-donation-email" name="reply_to" type="email" maxlength="160" autocomplete="email" placeholder="you@example.com">
        <div class="gc-donation-amount-field" id="gc-donation-amount-field">
          <label for="gc-donation-amount">Donation amount</label>
          <select id="gc-donation-amount" name="donation_amount">
            <option value="Not specified">Choose an amount (optional)</option>
            <option value="$3">$3</option><option value="$5">$5</option>
            <option value="$10">$10</option><option value="$15">$15</option>
            <option value="$20">$20</option><option value="$25">$25</option>
            <option value="$50">$50</option><option value="Other amount">Other amount</option>
          </select>
          <input id="gc-donation-custom-amount" type="number" min="1" max="1000" step="1" placeholder="Enter amount in USD" hidden>
        </div>
        <label for="gc-donation-topic">What is this about?</label>
        <select id="gc-donation-topic" name="message_type">
          <option value="General message">General message</option>
          <option value="Bug report">Bug report</option>
          <option value="Feature suggestion">Feature suggestion</option>
          <option value="Chess feedback">Chess feedback</option>
          <option value="Other">Other</option>
        </select>
        <label for="gc-donation-message">Message <span>(sent to the Glass Chess creator)</span></label>
        <textarea id="gc-donation-message" name="message" rows="4" maxlength="1200" required placeholder="Write a thank-you, suggestion, or note about your donation…"></textarea>
        <input class="gc-donation-honeypot" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
        <p id="gc-donation-status" class="gc-donation-status" role="status">
          Messages are emailed using the project's email service. Payment happens separately in Cash App.
        </p>
        <div class="gc-donation-actions">
          <button type="submit" id="gc-donation-send">Send message</button>
          <a href="${CASHAPP_URL}" target="_blank" rel="noopener noreferrer" id="gc-donation-cashapp">Continue to Cash App <span aria-hidden="true">↗</span></a>
        </div>
        <div class="gc-donation-copy-row" id="gc-donation-copy-row">
          <button type="button" id="gc-copy-cashapp-dialog">Copy ${CASHAPP_TAG}</button>
        </div>
        <small class="gc-donation-footnote">Cash App: <strong>${CASHAPP_TAG}</strong>. Sending a message does not make a payment.</small>
      </form>
    </div>`;
  document.body.appendChild(modal);
  const close = () => {
    modal.hidden = true;
    modal.classList.remove('is-contact');
    lastSupportOpener?.focus?.();
  };
  $('gc-donation-close').addEventListener('click', close);
  $('gc-copy-cashapp-dialog').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(CASHAPP_TAG);
      toast('Copied ' + CASHAPP_TAG + ' to clipboard!');
    } catch {
      toast('Clipboard access is unavailable. Cash App tag: ' + CASHAPP_TAG, true);
    }
  });
  modal.addEventListener('click', event => { if (event.target === modal) close(); });
  $('gc-donation-cashapp').addEventListener('click', () => {
    // The link opens Cash App separately. Keep the message form open so it can still be sent.
  });
  $('gc-donation-amount').addEventListener('change', event => {
    $('gc-donation-custom-amount').hidden = event.target.value !== 'Other amount';
  });
  $('gc-donation-form').addEventListener('submit', event => {
    event.preventDefault();
    void sendDonationMessage();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !modal.hidden) close();
  });
}

function openDonationDialog(mode = 'donate') {
  mountDonationDialog();
  const modal = $('gc-donation-dialog');
  if (!modal) return;
  supportMode = mode === 'contact' ? 'contact' : 'donate';
  lastSupportOpener = document.activeElement;
  const isContact = supportMode === 'contact';
  modal.classList.toggle('is-contact', isContact);
  modal.hidden = false;
  modal.querySelector('.gc-donation-header small').textContent = isContact ? 'SEND A MESSAGE' : 'SUPPORT THE PROJECT';
  $('gc-donation-title').textContent = isContact ? 'Contact Glass Chess' : 'Support Glass Chess';
  modal.querySelector('.gc-donation-header p').textContent = isContact
    ? 'Send a question, bug report, or idea directly to the creator.'
    : 'Your contribution helps keep the board improving.';
  modal.querySelector('.gc-donation-mark').textContent = isContact ? '✉' : '$';
  $('gc-donation-amount-field').hidden = isContact;
  $('gc-donation-cashapp').hidden = isContact;
  $('gc-donation-copy-row').hidden = isContact;
  $('gc-donation-amount').value = 'Not specified';
  $('gc-donation-topic').value = 'General message';
  $('gc-donation-message').placeholder = isContact
    ? 'Tell me what is on your mind…'
    : 'Write a thank-you, suggestion, or note about your donation…';
  $('gc-donation-status').classList.remove('is-error');
  $('gc-donation-status').textContent = EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID && EMAILJS_PUBLIC_KEY
    ? (isContact
      ? 'Your message will be emailed to the recipient configured in the EmailJS template. No donation is required.'
      : 'Your message will be emailed to the recipient configured in the EmailJS template. Payment happens separately in Cash App.')
    : 'Email delivery needs EmailJS configuration before messages can be sent. Cash App is available for donations.';
  $('gc-donation-message').focus();
}

async function sendDonationMessage() {
  const form = $('gc-donation-form');
  const send = $('gc-donation-send');
  const status = $('gc-donation-status');
  if (!form || !send || !status) return;
  if (form.elements.website?.value) {
    status.textContent = 'Thanks. Your message could not be submitted.';
    return;
  }
  if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
    status.textContent = 'This feature is not available. Try again later.';
    status.classList.add('is-error');
    return;
  }
  const message = $('gc-donation-message').value.trim();
  if (message.length < 3) {
    status.textContent = 'Please write a short message before sending.';
    status.classList.add('is-error');
    $('gc-donation-message').focus();
    return;
  }
  const email = $('gc-donation-email').value.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    status.textContent = 'Please enter a valid email address or leave that field blank.';
    status.classList.add('is-error');
    $('gc-donation-email').focus();
    return;
  }
  const selectedAmount = $('gc-donation-amount').value;
  const customAmount = $('gc-donation-custom-amount').value;
  if (supportMode === 'donate' && selectedAmount === 'Other amount' && (!Number.isFinite(Number(customAmount)) || Number(customAmount) < 1 || Number(customAmount) > 1000)) {
    status.textContent = 'Enter an amount between $1 and $1,000.';
    status.classList.add('is-error');
    $('gc-donation-custom-amount').focus();
    return;
  }
  send.disabled = true;
  send.textContent = 'Sending…';
  status.classList.remove('is-error');
  status.textContent = 'Sending your message securely through the configured email service…';
  const templateParams = {
    from_name: $('gc-donation-name').value.trim() || 'Glass Chess visitor',
    reply_to: email || '',
    donation_amount: supportMode === 'contact' ? 'No donation — contact message' : (selectedAmount === 'Other amount' ? String.fromCharCode(36) + Number(customAmount).toFixed(2) : selectedAmount),
    message_type: $('gc-donation-topic').value,
    subject: supportMode === 'contact' ? 'Glass Chess contact message' : 'Glass Chess donation message',
    message,
    cashapp_tag: CASHAPP_TAG,
    submitted_at: new Date().toLocaleString(),
    source_url: window.location.origin
  };
  try {
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: templateParams
      })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(detail.slice(0, 300) || 'The email service rejected the message.');
    }
    status.textContent = supportMode === 'contact'
      ? 'Message sent! Thanks for reaching out.'
      : 'Message sent! Thank you for supporting Glass Chess.';
    toast(supportMode === 'contact' ? 'Your message was sent to the Glass Chess creator.' : 'Your support message was sent.');
    form.reset();
    $('gc-donation-custom-amount').hidden = true;
  } catch (error) {
    status.textContent = 'This feature is not available. Try again later.';
    status.classList.add('is-error');
    toast('This feature is not available. Try again later.');
  } finally {
    send.disabled = false;
    send.textContent = 'Send message';
  }
}


function mountDonationWidget() {
  const header = document.querySelector('.topbar');
  if (!header) return;
  let actions = $('gc-top-actions');
  if (!actions) {
    actions = document.createElement('div');
    actions.id = 'gc-top-actions';
    const newGame = $('new-game');
    header.insertBefore(actions, newGame || null);
  }
  if (!$('gc-donate')) {
    const donate = document.createElement('button');
    donate.id = 'gc-donate';
    donate.type = 'button';
    donate.title = 'Support Glass Chess';
    donate.innerHTML = '<span aria-hidden="true">$</span> Donate';
    actions.appendChild(donate);
    donate.addEventListener('click', () => openDonationDialog('donate'));
  }
  if (!$('gc-contact')) {
    const contact = document.createElement('button');
    contact.id = 'gc-contact';
    contact.type = 'button';
    contact.title = 'Send a message to the Glass Chess creator';
    contact.textContent = 'Contact';
    actions.appendChild(contact);
    contact.addEventListener('click', () => openDonationDialog('contact'));
  }
  $('gc-copy-cashapp')?.remove();
  mountDonationDialog();
}

function initializeDonations() {
  mountDonationWidget();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeDonations, { once: true });
} else {
  initializeDonations();
}
