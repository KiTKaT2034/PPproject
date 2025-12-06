import { Router, Request, Response } from 'express';
import * as transformerStationsService from '../db/transformer-stations-service';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  const { projectId, name, centerLat, centerLng, sizeMeters, description } = req.body;

  if (projectId === undefined || !name || centerLat === undefined || centerLng === undefined) {
    res.status(400).json({ error: 'Missing required fields: projectId, name, centerLat, centerLng' });
    return;
  }

  try {
    const station = await transformerStationsService.createTransformerStation(
      projectId,
      name,
      centerLat,
      centerLng,
      sizeMeters,
      description,
    );
    res.json(station);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    res.status(500).json({ error: 'Failed to create transformer station' });
  }
});

router.get('/project/:projectId', async (req: Request, res: Response) => {
  const projectId = Number(req.params.projectId);

  if (Number.isNaN(projectId)) {
    res.status(400).json({ error: 'Invalid project ID' });
    return;
  }

  try {
    const stations = await transformerStationsService.getTransformerStationsByProject(projectId);
    res.json(stations);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch transformer stations' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);

  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'Invalid station ID' });
    return;
  }

  try {
    const deleted = await transformerStationsService.deleteTransformerStation(id);

    if (!deleted) {
      res.status(404).json({ error: 'Transformer station not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    res.status(500).json({ error: 'Failed to delete transformer station' });
  }
});

export default router;



