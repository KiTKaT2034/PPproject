import { Router, Request, Response } from 'express';
import * as projectsService from '../db/projects-service';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  const { name, centerLat, centerLng, zoomLevel, description } = req.body;

  if (!name || centerLat === undefined || centerLng === undefined) {
    res.status(400).json({ error: 'Missing required fields: name, centerLat, centerLng' });
    return;
  }

  try {
    const project = await projectsService.createProject(
      name,
      centerLat,
      centerLng,
      zoomLevel,
      description,
    );
    res.json(project);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

router.get('/', async (_req: Request, res: Response) => {
  try {
    const projects = await projectsService.getAllProjects();
    res.json(projects);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);

  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'Invalid project ID' });
    return;
  }

  try {
    const project = await projectsService.getProject(id);

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.json(project);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);

  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'Invalid project ID' });
    return;
  }

  const { name, description, centerLat, centerLng, zoomLevel } = req.body;

  try {
    const project = await projectsService.updateProject(
      id,
      name,
      description,
      centerLat,
      centerLng,
      zoomLevel,
    );

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.json(project);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);

  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'Invalid project ID' });
    return;
  }

  try {
    const deleted = await projectsService.deleteProject(id);

    if (!deleted) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

export default router;







