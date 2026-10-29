import { Module } from '@nestjs/common';

import { ReviewsModule } from '../reviews/reviews.module';

import { CommentsController, ReviewFeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';

@Module({
  imports: [ReviewsModule],
  controllers: [ReviewFeedbackController, CommentsController],
  providers: [FeedbackService],
})
export class FeedbackModule {}
