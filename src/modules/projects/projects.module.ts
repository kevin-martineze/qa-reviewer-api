import { Module } from '@nestjs/common';

import { MembersService } from './members.service';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService, MembersService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
