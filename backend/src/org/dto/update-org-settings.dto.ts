import { IsBoolean } from 'class-validator';

export class UpdateOrgSettingsDto {
  @IsBoolean()
  historyVisibleToNewMembers: boolean;
}
