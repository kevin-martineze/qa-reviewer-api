import { Injectable } from '@nestjs/common';

/** Reloj inyectable: las pruebas lo fijan para controlar plazos y vencimientos. */
@Injectable()
export class ClockService {
  private fixed: Date | null = null;

  now(): Date {
    return this.fixed ? new Date(this.fixed) : new Date();
  }

  set(date: Date | null): void {
    this.fixed = date;
  }
}
