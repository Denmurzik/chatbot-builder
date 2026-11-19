import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectModule } from '../projects/project.module';
import { ValidatorModule } from '../validation/validator.module';
import { PublicationController } from './publication.controller';

// Модуль управления ботами, подключениями и публикацией (UC-A-25…A-28, UC-A-32, SD-6; спринты 2–3)
@Module({
  imports: [AuthModule, ProjectModule, ValidatorModule],
  controllers: [PublicationController],
})
export class PublicationModule {}
