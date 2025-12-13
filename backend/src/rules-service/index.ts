import express, { Request, Response } from 'express';
import cors from 'cors';

type SystemType =
  | 'water'
  | 'sewerage'
  | 'storm'
  | 'heating'
  | 'power'
  | 'telecom';

type RulesResponse = {
  system: SystemType;
  minAngleDeg: number;
  doubleLine: boolean;
  spacingMeters: number;
};

const app = express();

app.use(cors());
app.use(express.json());

const PORT = Number(process.env.RULES_PORT) || 4002;

const SYSTEM_RULES: Record<SystemType, RulesResponse> = {
  water: {
    system: 'water',
    minAngleDeg: 90,
    doubleLine: true,
    spacingMeters: 1.8,
  },
  sewerage: {
    system: 'sewerage',
    minAngleDeg: 90,
    doubleLine: false,
    spacingMeters: 0,
  },
  storm: {
    system: 'storm',
    minAngleDeg: 90,
    doubleLine: false,
    spacingMeters: 0,
  },
  heating: {
    system: 'heating',
    minAngleDeg: 90,
    doubleLine: true,
    spacingMeters: 1,
  },
  power: {
    system: 'power',
    minAngleDeg: 90,
    doubleLine: false,
    spacingMeters: 0,
  },
  telecom: {
    system: 'telecom',
    minAngleDeg: 90,
    doubleLine: false,
    spacingMeters: 0,
  },
};

app.get('/rules/:system', (req: Request, res: Response) => {
  const system = req.params.system as SystemType;

  if (!SYSTEM_RULES[system]) {
    res.status(404).json({ error: 'Unknown system type' });
    return;
  }

  res.json(SYSTEM_RULES[system]);
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Rules service listening on port ${PORT}`);
});