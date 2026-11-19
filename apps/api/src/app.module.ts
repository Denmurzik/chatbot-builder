import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectModule } from './projects/project.module';

// Корневой модуль HTTP API приложения
@Module({
  imports: [ConfigModule, PrismaModule, AuthModule, ProjectModule],
})
export class AppModule {}
