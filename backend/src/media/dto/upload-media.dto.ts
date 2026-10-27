import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadMediaDto {
  @IsIn(['IMAGE', 'VIDEO'])
  type: 'IMAGE' | 'VIDEO';

  @IsOptional()
  @IsString()
  @MaxLength(280)
  caption?: string;
}
