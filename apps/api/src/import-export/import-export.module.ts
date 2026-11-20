import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectModule } from '../projects/project.module';
import { ImportExportController } from './import-export.controller';
import { ImportExportService } from './import-export.service';

// Модуль экспорта и импорта сценариев (UC-A-29…A-31)
@Module({
  imports: [AuthModule, ProjectModule],
  controllers: [ImportExportController],
  providers: [ImportExportService],
  exports: [ImportExportService],
})
export class ImportExportModule {}
