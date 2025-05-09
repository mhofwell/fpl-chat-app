import { Router, Request, Response } from 'express';

const router = Router();

// Root route
router.get('/', (req: Request, res: Response) => {
    res.json({ message: 'Welcome to Express TypeScript API' });
});

// Health check route
router.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'OK' });
});

export default router;
