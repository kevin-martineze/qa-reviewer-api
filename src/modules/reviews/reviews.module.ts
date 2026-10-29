import { Module } from '@nestjs/common';

import { ReviewsController } from './reviews.controller';
import { ReviewMapper } from './reviews.mapper';
import { ReviewsService } from './reviews.service';

@Module({
  controllers: [ReviewsController],
  providers: [ReviewsService, ReviewMapper],
  exports: [ReviewsService, ReviewMapper],
})
export class ReviewsModule {}
