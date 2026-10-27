import { IsString } from 'class-validator';

export class RequestExtractionDto {
  @IsString()
  mediaPostId: string;
}
