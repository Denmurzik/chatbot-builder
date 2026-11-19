import { Module } from '@nestjs/common';
import { HttpModule } from '../http/http.module';
import { MessengerModule } from '../messenger/messenger.module';
import { ContextRepository } from './context.repository';
import { DialogService } from './dialog.service';

@Module({
  imports: [MessengerModule, HttpModule],
  providers: [ContextRepository, DialogService],
  exports: [DialogService],
})
export class DialogModule {}
