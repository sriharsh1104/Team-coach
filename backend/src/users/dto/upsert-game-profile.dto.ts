import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { GAME_IDS } from '../game-profiles';

export class UpsertGameProfileDto {
  @IsString()
  @IsIn(GAME_IDS)
  game!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  inGameName?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsString()
  @MaxLength(50)
  inGameUid?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  role?: string | null;
}
