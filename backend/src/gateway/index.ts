import express from 'express';
import cors from 'cors';
import axios from 'axios';
import projectsRouter from './projects-api';
import tracesRouter from './traces-api';
import buildingsRouter from './buildings-api';
import mainlinesRouter from './mainlines-api';
import transformerStationsRouter from './transformer-stations-api';

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

type TraceServiceResponse = {
  system: SystemType;
  basePath: Point[];
  doubleLine: boolean;
  spacingPixels: number;
};

const app = express();

app.use(cors());
app.use(express.json());

const PORT = Number(process.env.GATEWAY_PORT) || 4000;
const TRACING_URL =
  process.env.TRACING_URL || 'http://localhost:4001/trace';

// API роуты
app.use('/api/projects', projectsRouter);
app.use('/api/traces', tracesRouter);
app.use('/api/buildings', buildingsRouter);
app.use('/api/mainlines', mainlinesRouter);
app.use('/api/transformer-stations', transformerStationsRouter);

// Старый endpoint для обратной совместимости (построение трассы без сохранения)
app.post('/api/trace', async (req, res) => {
  const { system, start, end } = req.body;

  if (!system || !start || !end) {
    res.status(400).json({ error: 'Invalid payload' });
    return;
  }

  try {
    const tracingResponse = await axios.post<TraceServiceResponse>(
      TRACING_URL,
      { system, start, end },
    );

    res.json(tracingResponse.data);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    res.status(500).json({ error: 'Failed to build trace' });
  }
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Gateway listening on port ${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`API endpoints:`);
  // eslint-disable-next-line no-console
  console.log(`  GET/POST /api/projects`);
  // eslint-disable-next-line no-console
  console.log(`  GET/POST /api/traces`);
  // eslint-disable-next-line no-console
  console.log(`  GET/POST /api/buildings`);
  // eslint-disable-next-line no-console
  console.log(`  GET/POST /api/mainlines`);
  // eslint-disable-next-line no-console
  console.log(`  GET/POST /api/transformer-stations`);
});
