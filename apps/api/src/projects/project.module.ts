import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EnvironmentService } from '../common/environment.service';
import { ProjectController } from './project.controller';
import { ProjectService } from './project.service';
import { ScenarioEditor } from './scenario-editor';

// Модуль управления проектами и редактирования сценариев
@Module({
  imports: [AuthModule],
  controllers: [ProjectController],
  providers: [ProjectService, ScenarioEditor, EnvironmentService],
  exports: [ProjectService, ScenarioEditor, EnvironmentService],
})
export class ProjectModule {}
