import { PartialType } from '@nestjs/mapped-types';
import { CreateScrimEventDto } from './create-scrim-event.dto';

export class UpdateScrimEventDto extends PartialType(CreateScrimEventDto) {}
