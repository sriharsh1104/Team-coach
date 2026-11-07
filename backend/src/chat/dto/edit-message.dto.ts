import { IsString, MaxLength, MinLength } from 'class-validator';

export class EditMessageDto {
  @IsString()
  @MaxLength(64)
  id: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text: string;
}
