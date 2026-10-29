import type { Env } from './config/env';
import type { DynamicModule } from '@nestjs/common';

import { Module } from '@nestjs/common';

import { AuthModule } from './modules/auth/auth.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { HealthModule } from './modules/health/health.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { ReportsModule } from './modules/reports/reports.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { TokensModule } from './modules/tokens/tokens.module';
import { CoreModule } from './shared/core.module';

@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [
        CoreModule.forRoot(env),
        HealthModule,
        AuthModule,
        OrganizationModule,
        ProjectsModule,
        ReviewsModule,
        FeedbackModule,
        NotificationsModule,
        TokensModule,
        ReportsModule,
      ],
    };
  }
}
