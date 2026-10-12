import { Router } from 'express';

export const router = Router();

router.use((_req, res) => {
  res.status(501).json({
    error: 'Not Implemented',
    message: 'Single-user personal agent mode does not require enterprise SSO.',
  });
});
