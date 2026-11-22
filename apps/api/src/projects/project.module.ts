import { type DynamicModule, Module, type ModuleMetadata } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EnvironmentService } from '../common/environment.service';
import { ProjectController } from './project.controller';
import { ProjectService } from './project.service';
import { ScenarioEditor } from './scenario-editor';

// Модуль управления проектами и редактирования сценариев
// Зависит только от порта MessengerAdminPort; адаптер мессенджера подключается в AppModule
@Module({})
export class ProjectModule {
  static register(options: { imports?: ModuleMetadata['imports'] } = {}): DynamicModule {
    return {
      global: true,
      module: ProjectModule,
      imports: [AuthModule, ...(options.imports ?? [])],
      controllers: [ProjectController],
      providers: [ProjectService, ScenarioEditor, EnvironmentService],
      exports: [ProjectService, ScenarioEditor, EnvironmentService],
    };
  }
}
