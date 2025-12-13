import { Router, Request, Response } from 'express';
import * as buildingsService from '../db/buildings-service';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  const { projectId, name, lat, lng, widthMeters, heightMeters, footprintPoints, description } = req.body;

  if (projectId === undefined || !name || lat === undefined || lng === undefined) {
    res.status(400).json({ error: 'Missing required fields: projectId, name, lat, lng' });
    return;
  }

  try {
    const building = await buildingsService.createBuilding(
      projectId,
      name,
      lat,
      lng,
      widthMeters,
      heightMeters,
      Array.isArray(footprintPoints) ? footprintPoints : undefined,
      description,
    );
    res.json(building);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    res.status(500).json({ error: 'Failed to create building' });
  }
});

router.get('/project/:projectId', async (req: Request, res: Response) => {
  const projectId = Number(req.params.projectId);

  if (Number.isNaN(projectId)) {
    res.status(400).json({ error: 'Invalid project ID' });
    return;
  }

  try {
    const buildings = await buildingsService.getBuildingsByProject(projectId);
    res.json(buildings);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch buildings' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);

  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'Invalid building ID' });
    return;
  }

  try {
    const deleted = await buildingsService.deleteBuilding(id);

    if (!deleted) {
      res.status(404).json({ error: 'Building not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    res.status(500).json({ error: 'Failed to delete building' });
  }
});

export default router;
