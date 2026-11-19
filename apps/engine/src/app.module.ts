import { Module } from '@nestjs/common';
import { DispatcherModule } from './dispatcher/dispatcher.module';
import { InfraModule } from './infra/infra.module';

@Module({
  imports: [InfraModule, DispatcherModule],
})
export class AppModule {}
