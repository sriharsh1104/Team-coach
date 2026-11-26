import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { GAME_IDS } from '../game-profiles';

export class GameProfileVisibilityDto {
  @IsString()
  @IsIn(GAME_IDS)
  game!: string;

  @IsOptional()
  @IsBoolean()
  showNameToMembers?: boolean;

  @IsOptional()
  @IsBoolean()
  showUidToMembers?: boolean;
}
