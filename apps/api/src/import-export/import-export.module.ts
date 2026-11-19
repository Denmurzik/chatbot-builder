import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectModule } from '../projects/project.module';
import { ValidatorModule } from '../validation/validator.module';
import { ImportExportController } from './import-export.controller';

// Модуль экспорта и импорта сценариев (UC-A-29…A-31, спринт 3)
@Module({
  imports: [AuthModule, ProjectModule, ValidatorModule],
  controllers: [ImportExportController],
})
export class ImportExportModule {}
