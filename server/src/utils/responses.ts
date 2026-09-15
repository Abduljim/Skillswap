import { Response } from 'express';

export const ok = <T>(res: Response, data: T) => {
  res.json({ success: true, data });
};

export const created = <T>(res: Response, data: T) => {
  res.status(201).json({ success: true, data });
};

export const noContent = (res: Response) => {
  res.status(204).send();
};