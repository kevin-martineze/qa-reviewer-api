import { Module } from '@nestjs/common';

import { ProjectsModule } from '../projects/projects.module';
import { TokensModule } from '../tokens/tokens.module';

import { DeviceController, SkillDeviceController } from './device.controller';
import { DeviceService } from './device.service';

@Module({
  imports: [ProjectsModule, TokensModule],
  controllers: [SkillDeviceController, DeviceController],
  providers: [DeviceService],
})
export class DeviceModule {}
