import { Module } from '@nestjs/common';

/**
 * Bee integration (decision 0012): the caregiver's own Bee voice notes become proposed
 * care-plan changes the caregiver approves; approved items become Bee todos. Filled in
 * by the Bee workstream.
 */
@Module({
  providers: [],
  exports: [],
})
export class BeeModule {}
