import { Module } from '@nestjs/common';

import { IdempotencyService } from './idempotency.service';
import { ReviewsController } from './reviews.controller';
import { ReviewMapper } from './reviews.mapper';
import { ReviewsService } from './reviews.service';
import { SkillLookupController } from './skill-lookup.controller';
import { SkillLookupService } from './skill-lookup.service';
import { SkillController } from './skill.controller';
import { SkillService } from './skill.service';

@Module({
  controllers: [ReviewsController, SkillController, SkillLookupController],
  providers: [ReviewsService, SkillService, SkillLookupService, IdempotencyService, ReviewMapper],
  exports: [ReviewsService, ReviewMapper],
})
export class ReviewsModule {}
