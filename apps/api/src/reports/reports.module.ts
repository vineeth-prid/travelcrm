import { Module } from '@nestjs/common';

import { ExpensesModule } from '../expenses/expenses.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  // The expense figures on the dashboard come from the expense summary rather
  // than being recalculated here, so the two can never disagree.
  imports: [ExpensesModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
