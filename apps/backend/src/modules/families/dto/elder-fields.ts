import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import {
  ELDER_NAME_MAX_LENGTH,
  ELDER_NAME_PATTERN,
  ELDER_RELATIONS,
  trimElderName,
} from '../elder';

/**
 * The elder's display name: optional, trimmed, at most 60 characters, no control or bidi
 * override characters. Null (or a blank string) clears it: IsOptional skips the other
 * checks for null, and the service treats null as "clear".
 */
export function ElderNameField(): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }) => trimElderName(value)),
    IsOptional(),
    IsString(),
    MaxLength(ELDER_NAME_MAX_LENGTH),
    Matches(ELDER_NAME_PATTERN, { message: 'elderName must not contain control characters' }),
  );
}

/** The caregiver's relationship word for the elder. Null clears it. */
export function ElderRelationField(): PropertyDecorator {
  return applyDecorators(IsOptional(), IsIn(ELDER_RELATIONS));
}
