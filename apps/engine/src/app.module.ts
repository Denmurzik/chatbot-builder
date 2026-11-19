import { Module } from '@nestjs/common';
import { DialogModule } from './dialog/dialog.module';
import { DispatcherModule } from './dispatcher/dispatcher.module';
import { HttpModule } from './http/http.module';
import { InfraModule } from './infra/infra.module';
import { MessengerModule } from './messenger/messenger.module';
import { PreviewModule } from './preview/preview.module';

// Корневой модуль приложения engine: связывает порты DialogModule с адаптерами MessengerModule и HttpModule
@Module({
  imports: [
    InfraModule,
    MessengerModule,
    HttpModule,
    DialogModule.register({ imports: [MessengerModule, HttpModule] }),
    DispatcherModule,
    PreviewModule,
  ],
})
export class AppModule {}
