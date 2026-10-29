import type { MailMessage } from './mail.port';

function escape(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Correo simple: un párrafo y un botón. Mismo texto en plano para clientes sin HTML. */
export function simpleMail(
  to: string,
  subject: string,
  lines: string[],
  action?: { label: string; url: string },
): MailMessage {
  const text = [...lines, ...(action ? ['', `${action.label}: ${action.url}`] : [])].join('\n');
  const button = action
    ? `<p><a href="${escape(action.url)}" style="display:inline-block;padding:10px 16px;background:#1f2937;color:#fff;border-radius:6px;text-decoration:none">${escape(action.label)}</a></p>`
    : '';
  const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#111827;line-height:1.5">${lines
    .map((l) => `<p>${escape(l)}</p>`)
    .join('')}${button}<p style="color:#6b7280;font-size:12px">QA Reviewer</p></div>`;
  return { to, subject, text, html };
}
