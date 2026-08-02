import { Module } from '@nestjs/common';

import { IntegrationsModule } from '../integrations/integrations.module';
import { HealthController } from './health.controller';

@Module({
  imports: [IntegrationsModule],
  controllers: [HealthController],
})
export class HealthModule {}
