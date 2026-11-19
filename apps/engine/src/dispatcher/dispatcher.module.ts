import { Module } from '@nestjs/common';
import { DialogModule } from '../dialog/dialog.module';
import { EventDispatcher } from './event-dispatcher';

@Module({
  imports: [DialogModule],
  providers: [EventDispatcher],
})
export class DispatcherModule {}
