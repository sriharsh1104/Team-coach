import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

const ExtractedStatsSchema = z.object({
  players: z.array(
    z.object({
      name: z.string(),
      kills: z.number().int().min(0),
      deaths: z.number().int().min(0),
      assists: z.number().int().min(0),
    }),
  ),
});

export type ExtractedPlayerStat = z.infer<
  typeof ExtractedStatsSchema
>['players'][number];

const EXTRACTION_PROMPT = `This is a screenshot of a scrim or tournament match scoreboard from a tactical shooter game.
Read every player row you can find and report their name exactly as spelled on screen, along with
their kills, deaths, and assists (K/D/A). If a stat isn't visible for a player, use 0. Ignore rows
that aren't player stat rows (headers, team names, etc).`;

@Injectable()
export class StatsAiService {
  constructor(private readonly configService: ConfigService) {}

  async extractFromImage(
    base64Data: string,
    mediaType: string,
  ): Promise<ExtractedPlayerStat[]> {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'AI stats extraction is not configured — set ANTHROPIC_API_KEY on the backend.',
      );
    }

    const client = new Anthropic({ apiKey });
    const model = this.configService.get<string>(
      'ANTHROPIC_MODEL',
      'claude-opus-5',
    );

    const response = await client.messages.parse({
      model,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType as
                  | 'image/jpeg'
                  | 'image/png'
                  | 'image/gif'
                  | 'image/webp',
                data: base64Data,
              },
            },
            { type: 'text', text: EXTRACTION_PROMPT },
          ],
        },
      ],
      output_config: {
        format: zodOutputFormat(ExtractedStatsSchema),
      },
    });

    if (!response.parsed_output) {
      throw new ServiceUnavailableException(
        'The AI could not read stats from this image. Try a clearer screenshot.',
      );
    }

    return response.parsed_output.players;
  }
}
