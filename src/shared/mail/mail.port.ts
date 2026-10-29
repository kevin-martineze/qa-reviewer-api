export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface MailPort {
  send(message: MailMessage): Promise<void>;
}

export const MAIL = Symbol('MAIL');
