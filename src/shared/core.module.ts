import type { DynamicModule, Provider } from '@nestjs/common';

import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';

import { ENV, type Env } from '../config/env';

import { AccessService } from './auth/access.service';
import { AuthGuard } from './auth/auth.guard';
import { SessionUserService } from './auth/session-user.service';
import { ActivityService, AuditService } from './events/activity.service';
import { NotifyService } from './events/notify.service';
import { AllExceptionsFilter } from './http/exception.filter';
import { LogMail } from './mail/log.mail';
import { MAIL } from './mail/mail.port';
import { ResendMail } from './mail/resend.mail';
import { OutboxService } from './outbox/outbox.service';
import { MODELS } from './schemas';
import { LocalStorage } from './storage/local.storage';
import { S3Storage } from './storage/s3.storage';
import { StorageController } from './storage/storage.controller';
import { STORAGE } from './storage/storage.port';
import { ClockService } from './util/clock.service';
import { SerialService } from './util/serial.service';
import { TransactionService } from './util/transaction.service';

const SHARED: Provider[] = [
  ClockService,
  SessionUserService,
  AccessService,
  ActivityService,
  AuditService,
  NotifyService,
  OutboxService,
  SerialService,
  TransactionService,
];

/** Infraestructura común a todos los módulos: modelos, auth, storage, correo, eventos. */
@Global()
@Module({})
export class CoreModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: CoreModule,
      imports: [MongooseModule.forRoot(env.MONGO_URI), MongooseModule.forFeature(MODELS)],
      controllers: [StorageController],
      providers: [
        { provide: ENV, useValue: env },
        ...SHARED,
        {
          provide: STORAGE,
          inject: [ClockService],
          useFactory: (clock: ClockService) =>
            env.STORAGE_DRIVER === 's3'
              ? new S3Storage({
                  bucket: env.S3_BUCKET,
                  region: env.S3_REGION,
                  endpoint: env.S3_ENDPOINT,
                  accessKeyId: env.S3_ACCESS_KEY_ID,
                  secretAccessKey: env.S3_SECRET_ACCESS_KEY,
                  forcePathStyle: env.S3_FORCE_PATH_STYLE,
                })
              : new LocalStorage(env.STORAGE_DIR, env.STORAGE_SECRET, env.PUBLIC_API_URL, () =>
                  clock.now(),
                ),
        },
        {
          provide: MAIL,
          useFactory: () =>
            env.MAIL_DRIVER === 'resend'
              ? new ResendMail(env.RESEND_API_KEY, env.MAIL_FROM)
              : new LogMail(),
        },
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
      exports: [ENV, STORAGE, MAIL, MongooseModule, ...SHARED],
    };
  }
}
