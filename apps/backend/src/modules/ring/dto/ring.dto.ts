import { IsIn, IsString, Matches, MaxLength } from 'class-validator';
import { RING_PLACEMENTS, type RingPlacement } from '../ring.entity';

export class UpdateRingCameraDto {
  @IsIn(RING_PLACEMENTS)
  placement!: RingPlacement;
}

export class StartRingLiveDto {
  // An SDP offer always starts with the version line. Capped so it stays signalling-sized.
  @IsString()
  @MaxLength(32_000)
  @Matches(/^v=0\r?\n/)
  sdpOffer!: string;
}
