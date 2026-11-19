import { Module } from '@nestjs/common';
import { ScenarioValidator } from './scenario-validator';

// Модуль проверки сценария (UC-A-24, UC-A-27, спринт 2)
@Module({
  providers: [ScenarioValidator],
  exports: [ScenarioValidator],
})
export class ValidatorModule {}
