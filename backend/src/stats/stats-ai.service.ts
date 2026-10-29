import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GoogleGenerativeAI,
  SchemaType,
  type ResponseSchema,
} from '@google/generative-ai';
import { z } from 'zod';

const ExtractedStatsSchema = z.object({
  players: z.array(
    z.object({
      name: z.string(),
      kills: z.number().int().min(0),
      deaths: z.number().int().min(0),
      assists: z.number().int().min(0),
      damage: z.number().int().min(0),
    }),
  ),
});

export type ExtractedPlayerStat = z.infer<
  typeof ExtractedStatsSchema
>['players'][number];

const EXTRACTION_PROMPT = `This is a Free Fire post-match scoreboard (BR-Ranked, Clash Squad, scrim, or tournament).
Use OCR on the player table. Columns are typically: RATING, NAME, K (kills), A (assists), DMG, REVIVAL, SURVIVAL TIME.
There may be 1 to 4 players in the squad list (solo / duo / trio / squad).

For each player row report:
- name: the main in-game name only (e.g. "ANNIE~GAMING" or "SES-SRI"). Ignore clan/guild subtitles under the name (e.g. ignore "SACRED-ESP").
- kills: the K column integer
- assists: the A column integer
- deaths: if a deaths / D column is visible use it; otherwise 0
- damage: the DMG column integer; if not visible, 0

Ignore headers, medals, map name, rank (#1/25), match UID, and non-player UI.
Return JSON only matching the schema. Cap at 4 players.`;

const RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    players: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: { type: SchemaType.STRING },
          kills: { type: SchemaType.INTEGER },
          deaths: { type: SchemaType.INTEGER },
          assists: { type: SchemaType.INTEGER },
          damage: { type: SchemaType.INTEGER },
        },
        required: ['name', 'kills', 'deaths', 'assists', 'damage'],
      },
    },
  },
  required: ['players'],
};

@Injectable()
export class StatsAiService {
  constructor(private readonly configService: ConfigService) {}

  async extractFromImage(
    base64Data: string,
    mediaType: string,
  ): Promise<ExtractedPlayerStat[]> {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'AI stats extraction is not configured — set GEMINI_API_KEY on the backend.',
      );
    }

    const modelName = this.configService.get<string>(
      'GEMINI_MODEL',
      'gemini-3.8-flash',
    );

    const client = new GoogleGenerativeAI(apiKey);
    const model = client.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    });

    let rawText: string;
    try {
      const result = await model.generateContent([
        {
          inlineData: {
            data: base64Data,
            mimeType: mediaType,
          },
        },
        { text: EXTRACTION_PROMPT },
      ]);
      rawText = result.response.text();
    } catch (err) {
      throw new ServiceUnavailableException(
        `Gemini could not read this image: ${(err as Error).message}`,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new ServiceUnavailableException(
        'The AI returned invalid JSON. Try a clearer screenshot.',
      );
    }

    const validated = ExtractedStatsSchema.safeParse(parsed);
    if (!validated.success) {
      throw new ServiceUnavailableException(
        'The AI could not read stats from this image. Try a clearer screenshot.',
      );
    }

    // Free Fire squads are at most 4 — drop extras if the model over-reads.
    return validated.data.players.slice(0, 4);
  }
}
