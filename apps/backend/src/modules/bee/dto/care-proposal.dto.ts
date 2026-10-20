import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsUUID } from 'class-validator';

export class ListCareProposalsQueryDto {
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected'])
  status?: 'pending' | 'approved' | 'rejected';
}

export class ApproveCareProposalDto {
  /** The items to apply. Omit to approve every item in the proposal. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  itemIds?: string[];
}
