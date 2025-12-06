import { Router, Request, Response } from 'express';
import * as tracesService from '../db/traces-service';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  const {
    projectId,
    systemType,
    startLat,
    startLng,
    endLat,
    endLng,
    pathPoints,
    doubleLine,
    spacingMeters,
    buildingId,
    mainlineId,
    transformerStationId,
    validateDistances = true,
  } = req.body;

  if (
    projectId === undefined ||
    !systemType ||
    startLat === undefined ||
    startLng === undefined ||
    endLat === undefined ||
    endLng === undefined ||
    !pathPoints
  ) {
    res.status(400).json({
      error: 'Missing required fields: projectId, systemType, startLat, startLng, endLat, endLng, pathPoints',
    });
    return;
  }

  try {
    const result = await tracesService.createTrace(
      projectId,
      systemType,
      startLat,
      startLng,
      endLat,
      endLng,
      pathPoints,
      doubleLine || false,
      spacingMeters || 0,
      buildingId,
      mainlineId,
      transformerStationId,
      validateDistances,
    );

    if (result.validationErrors.length > 0) {
      res.status(400).json({
        error: 'Distance validation failed',
        validationErrors: result.validationErrors,
        trace: result.trace,
      });
      return;
    }

    res.json(result.trace);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    res.status(500).json({ error: 'Failed to create trace' });
  }
});

router.get('/project/:projectId', async (req: Request, res: Response) => {
  const projectId = Number(req.params.projectId);

  if (Number.isNaN(projectId)) {
    res.status(400).json({ error: 'Invalid project ID' });
    return;
  }

  try {
    const traces = await tracesService.getTracesByProject(projectId);
    res.json(traces);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching traces for project', projectId, ':', error);
    // eslint-disable-next-line no-console
    if (error instanceof Error) {
      // eslint-disable-next-line no-console
      console.error('Error message:', error.message);
      // eslint-disable-next-line no-console
      console.error('Error stack:', error.stack);
    }
    res.status(500).json({ 
      error: 'Failed to fetch traces',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);

  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'Invalid trace ID' });
    return;
  }

  try {
    const deleted = await tracesService.deleteTrace(id);

    if (!deleted) {
      res.status(404).json({ error: 'Trace not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    res.status(500).json({ error: 'Failed to delete trace' });
  }
});

export default router;

