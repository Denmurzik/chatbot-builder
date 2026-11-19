import { Module } from '@nestjs/common';
import { DispatcherModule } from './dispatcher/dispatcher.module';
import { HttpModule } from './http/http.module';
import { InfraModule } from './infra/infra.module';
import { PreviewModule } from './preview/preview.module';

// Корневой модуль приложения engine (воркеры очереди, HTTP-исполнитель, превью)
@Module({
  imports: [InfraModule, DispatcherModule, HttpModule, PreviewModule],
})
export class AppModule {}
