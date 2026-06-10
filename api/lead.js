// POST /api/lead — receives the consultation form and emails it to you
// through your own Google Workspace mailbox over SMTP. Zero dependencies:
// implements the SMTP conversation directly with Node's built-in `tls` module,
// so no package.json / npm install is needed and any deploy method works.
//
// Environment Variables (Vercel → Project → Settings → Environment Variables):
//   SMTP_USER      the Google mailbox that sends, e.g. marketing@thetaxfirm.us
//   SMTP_PASS      a Google App Password for that mailbox (16 chars, no spaces)
//   LEAD_TO_EMAIL  where leads land (optional; defaults to SMTP_USER)
//
// Until SMTP_USER/SMTP_PASS are set, submissions still succeed and are written
// to the function logs so no lead is lost.

const tls = require('tls');

const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

const isEmail = (s = '') => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// Minimal SMTP client for smtps://smtp.gmail.com:465 (implicit TLS + AUTH LOGIN).
function sendViaGmail({ user, pass, to, replyToName, replyToEmail, subject, text, html }) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(465, 'smtp.gmail.com', { servername: 'smtp.gmail.com' });
    socket.setTimeout(15000, () => { socket.destroy(); reject(new Error('SMTP timeout')); });

    let buffer = '';
    const steps = [];
    let i = 0;

    const boundary = 'b' + Math.random().toString(36).slice(2);
    const msgId = '<' + Date.now() + '.' + Math.random().toString(36).slice(2) + '@thetaxfirm.us>';
    // RFC 5322 message. Dot-stuff lines starting with "."
    const body = [
      `From: "MH Services Leads" <${user}>`,
      `To: <${to}>`,
      `Reply-To: "${replyToName.replace(/"/g, "'")}" <${replyToEmail}>`,
      `Subject: ${subject}`,
      `Message-ID: ${msgId}`,
      `Date: ${new Date().toUTCString()}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      text,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      '',
      html,
      '',
      `--${boundary}--`,
      '',
    ].join('\r\n').replace(/\r\n\./g, '\r\n..');

    steps.push(
      { expect: 220, send: () => 'EHLO mddeductions.com\r\n' },
      { expect: 250, send: () => 'AUTH LOGIN\r\n' },
      { expect: 334, send: () => Buffer.from(user).toString('base64') + '\r\n' },
      { expect: 334, send: () => Buffer.from(pass).toString('base64') + '\r\n' },
      { expect: 235, send: () => `MAIL FROM:<${user}>\r\n` },
      { expect: 250, send: () => `RCPT TO:<${to}>\r\n` },
      { expect: 250, send: () => 'DATA\r\n' },
      { expect: 354, send: () => body + '\r\n.\r\n' },
      { expect: 250, send: () => 'QUIT\r\n', done: true },
    );

    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      // process complete lines; multi-line replies end with "NNN " (space after code)
      const lines = buffer.split('\r\n');
      buffer = lines.pop(); // keep partial
      for (const line of lines) {
        if (!/^\d{3} /.test(line)) continue; // intermediate line of a multiline reply
        const code = parseInt(line.slice(0, 3), 10);
        const step = steps[i];
        if (!step) continue;
        if (code !== step.expect) {
          socket.destroy();
          return reject(new Error(`SMTP step ${i} expected ${step.expect} got: ${line.slice(0, 200)}`));
        }
        socket.write(step.send());
        if (step.done) { socket.end(); return resolve(); }
        i++;
      }
    });

    socket.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  // Honeypot — bots fill hidden fields. Pretend success, drop silently.
  if (body.company_website) return res.status(200).json({ ok: true });

  const name = (body.name || '').trim();
  const email = (body.email || '').trim();
  const phone = (body.phone || '').trim();
  const profile = (body.profile || '').trim();
  const income = (body.income || '').trim();
  const message = (body.message || '').trim();

  if (!name || name.length > 120) return res.status(400).json({ error: 'A valid name is required.' });
  if (!isEmail(email)) return res.status(400).json({ error: 'A valid email is required.' });
  if (message.length > 5000) return res.status(400).json({ error: 'Message is too long.' });

  const submittedAt = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }) + ' PT';
  const rows = [
    ['Name', name], ['Email', email], ['Phone', phone || '—'],
    ['Profile', profile || '—'], ['Income', income || '—'],
    ['Message', message || '—'], ['Submitted', submittedAt],
  ];
  const html =
    '<h2 style="font-family:Arial,sans-serif;color:#0e2a47">New consultation request</h2>' +
    '<table style="font-family:Arial,sans-serif;font-size:14px;border-collapse:collapse">' +
    rows.map(([k, v]) =>
      `<tr><td style="padding:4px 12px 4px 0;color:#5b6b7c;vertical-align:top">${k}</td>` +
      `<td><b>${esc(v).replace(/\n/g, '<br>')}</b></td></tr>`
    ).join('') + '</table>';
  const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n');

  const USER = process.env.SMTP_USER;
  const PASS = (process.env.SMTP_PASS || '').replace(/\s+/g, ''); // app passwords are often pasted with spaces
  const TO = process.env.LEAD_TO_EMAIL || USER;

  if (!USER || !PASS) {
    console.log('[lead] (email not configured) ', JSON.stringify({ name, email, phone, profile, income, message, submittedAt }));
    return res.status(200).json({ ok: true, delivered: false });
  }

  try {
    await sendViaGmail({
      user: USER, pass: PASS, to: TO,
      replyToName: name, replyToEmail: email,
      subject: `New consultation request — ${name}`,
      text, html,
    });
    return res.status(200).json({ ok: true, delivered: true });
  } catch (err) {
    console.error('[lead] SMTP error:', err && err.message);
    console.log('[lead] (delivery failed) ', JSON.stringify({ name, email, phone, profile, income, message, submittedAt }));
    return res.status(502).json({ error: 'Could not send the message.' });
  }
};
