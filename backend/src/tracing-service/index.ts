import express, { Request, Response } from 'express';
import cors from 'cors';
import axios from 'axios';

type SystemType =
  | 'water'
  | 'sewerage'
  | 'storm'
  | 'heating'
  | 'power'
  | 'telecom';

type Point = {
  x: number;
  y: number;
};

type TraceRequestBody = {
  system: SystemType;
  start: Point;
  end: Point;
};

type RulesResponse = {
  system: SystemType;
  minAngleDeg: number;
  doubleLine: boolean;
  spacingMeters: number;
};

type TraceResponse = {
  system: SystemType;
  basePath: Point[];
  doubleLine: boolean;
  spacingPixels: number;
};

const app = express();

app.use(cors());
app.use(express.json());

const PORT = Number(process.env.TRACING_PORT) || 4001;
const RULES_URL =
  process.env.RULES_URL || 'http://localhost:4002/rules';

const buildOrthogonalPath = (start: Point, end: Point): Point[] => [
  start,
  { x: start.x, y: end.y },
  end,
];

app.post(
  '/trace',
  async (req: Request<unknown, unknown, TraceRequestBody>, res: Response) => {
    const { system, start, end } = req.body;

    if (!system || !start || !end) {
      res.status(400).json({ error: 'Invalid payload' });
      return;
    }

    try {
      const rulesResponse = await axios.get<RulesResponse>(
        `${RULES_URL}/${system}`,
      );
      const rules = rulesResponse.data;

      const basePath = buildOrthogonalPath(start, end);

      const spacingMeters =
        rules.doubleLine && rules.spacingMeters > 0
          ? rules.spacingMeters
          : 0;

      const PIXELS_PER_METER = 10;

      const response: TraceResponse = {
        system,
        basePath,
        doubleLine: rules.doubleLine,
        spacingPixels: spacingMeters * PIXELS_PER_METER,
      };

      res.json(response);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch rules' });
    }
  },
);

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Tracing service listening on port ${PORT}`);
});