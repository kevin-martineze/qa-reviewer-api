import { Module } from '@nestjs/common';

import { IdempotencyService } from './idempotency.service';
import { ReviewsController } from './reviews.controller';
import { ReviewMapper } from './reviews.mapper';
import { ReviewsService } from './reviews.service';
import { SkillController } from './skill.controller';
import { SkillService } from './skill.service';

@Module({
  controllers: [ReviewsController, SkillController],
  providers: [ReviewsService, SkillService, IdempotencyService, ReviewMapper],
  exports: [ReviewsService, ReviewMapper],
})
export class ReviewsModule {}
