import type { MailMessage, MailPort } from './mail.port';

import { Logger } from '@nestjs/common';

/** Desarrollo: el correo se escribe en el log (incluye los links de invitación y recuperación). */
export class LogMail implements MailPort {
  private readonly logger = new Logger('Mail');
  readonly sent: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    if (this.sent.length > 100) this.sent.shift();
    this.logger.log(`→ ${message.to} · ${message.subject}\n${message.text}`);
  }
}
