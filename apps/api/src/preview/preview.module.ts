import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectModule } from '../projects/project.module';
import { PreviewController } from './preview.controller';

// Модуль превью сценария без Socket.IO-шлюза (UC-A-20…A-23, спринт 3)
@Module({
  imports: [AuthModule, ProjectModule],
  controllers: [PreviewController],
})
export class PreviewModule {}
