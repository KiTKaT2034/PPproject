import { Router, Request, Response } from 'express';
import * as mainlinesService from '../db/mainlines-service';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  const { projectId, systemType, name, startLat, startLng, endLat, endLng, description } =
    req.body;

  if (
    projectId === undefined ||
    !systemType ||
    !name ||
    startLat === undefined ||
    startLng === undefined ||
    endLat === undefined ||
    endLng === undefined
  ) {
    res.status(400).json({
      error: 'Missing required fields: projectId, systemType, name, startLat, startLng, endLat, endLng',
    });
    return;
  }

  try {
    const mainline = await mainlinesService.createMainline(
      projectId,
      systemType,
      name,
      startLat,
      startLng,
      endLat,
      endLng,
      description,
    );
    res.json(mainline);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    res.status(500).json({ error: 'Failed to create mainline' });
  }
});

router.get('/project/:projectId', async (req: Request, res: Response) => {
  const projectId = Number(req.params.projectId);

  if (Number.isNaN(projectId)) {
    res.status(400).json({ error: 'Invalid project ID' });
    return;
  }

  try {
    const mainlines = await mainlinesService.getMainlinesByProject(projectId);
    res.json(mainlines);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch mainlines' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);

  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'Invalid mainline ID' });
    return;
  }

  try {
    const deleted = await mainlinesService.deleteMainline(id);

    if (!deleted) {
      res.status(404).json({ error: 'Mainline not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    res.status(500).json({ error: 'Failed to delete mainline' });
  }
});

export default router;



