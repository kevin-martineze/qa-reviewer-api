import { Module } from '@nestjs/common';

import { ProjectsModule } from '../projects/projects.module';

import { TokensController } from './tokens.controller';
import { TokensService } from './tokens.service';

@Module({
  imports: [ProjectsModule],
  controllers: [TokensController],
  providers: [TokensService],
  exports: [TokensService],
})
export class TokensModule {}
