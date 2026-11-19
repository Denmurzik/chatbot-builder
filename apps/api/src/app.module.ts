import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config';
import { ImportExportModule } from './import-export/import-export.module';
import { PreviewModule } from './preview/preview.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectModule } from './projects/project.module';
import { PublicationModule } from './publication/publication.module';
import { QueueModule } from './queue/queue.module';
import { TelegramModule } from './telegram/telegram.module';
import { ValidatorModule } from './validation/validator.module';

// Корневой модуль HTTP API приложения
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuthModule,
    ProjectModule,
    QueueModule,
    TelegramModule,
    ValidatorModule,
    PublicationModule,
    ImportExportModule,
    PreviewModule,
  ],
})
export class AppModule {}
