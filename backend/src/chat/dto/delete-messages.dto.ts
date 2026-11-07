import { ArrayMinSize, ArrayMaxSize, IsArray, IsString } from 'class-validator';

export class DeleteMessagesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  ids: string[];
}
