import { Module } from '@nestjs/common';
import { HttpModule } from '../http/http.module';
import { EventDispatcher } from './event-dispatcher';

// DialogService предоставляется глобально из DialogModule.register(...) в AppModule
@Module({
  imports: [HttpModule],
  providers: [EventDispatcher],
})
export class DispatcherModule {}
