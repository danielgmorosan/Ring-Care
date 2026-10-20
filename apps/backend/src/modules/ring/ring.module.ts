import { Module } from '@nestjs/common';

/**
 * Ring integration (decision 0011): Ring Partner API client, signed webhook intake,
 * linked cameras, live-view signalling proxy. Ring video never reaches this backend;
 * only event labels and ids are recorded (rule #1). Filled in by the Ring workstream.
 */
@Module({
  providers: [],
  exports: [],
})
export class RingModule {}
