import { Router } from 'express';
import { z } from 'zod';

import { authorize, getAuthenticatedUser, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../utils/async-handler.js';
import { AppError } from '../utils/app-error.js';
import { runBackupSimulation } from '../services/backup-service.js';

const router = Router();

const RELEASE_NOTES = [
  {
    version: '1.4.2',
    tag: 'wa-pos:v1.4.2',
    releasedAt: '2024-05-20T04:00:00.000Z',
    highlights: [
      'Tambah modul tetapan global termasuk panel kemas kini.',
      'Optimasi caching POS offline dan sinkronisasi semula.',
    ],
  },
  {
    version: '1.4.1',
    tag: 'wa-pos:v1.4.1',
    releasedAt: '2024-05-05T06:30:00.000Z',
    highlights: [
      'Pembaikan kecil modul kempen dan statistik opt-out.',
      'Penambahbaikan antaramuka borang pelanggan mudah alih.',
    ],
  },
  {
    version: '1.4.0',
    tag: 'wa-pos:v1.4.0',
    releasedAt: '2024-04-28T02:15:00.000Z',
    highlights: [
      'Sokongan penuh e-Invois MyInvois (portal & API stub).',
      'Kemaskini paparan POS termasuk resit QR.',
    ],
  },
];

const parseImageSetting = (value: unknown): { tag: string; updatedAt?: string } => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { tag: 'wa-pos:latest' };
  }

  const record = value as Record<string, unknown>;
  const tagValue = record.tag;
  const updatedAt = record.updatedAt;

  return {
    tag: typeof tagValue === 'string' && tagValue.trim() ? tagValue : 'wa-pos:latest',
    updatedAt: typeof updatedAt === 'string' ? updatedAt : undefined,
  };
};

const settingSchema = z.object({
  value: z.any(),
});

router.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const settings = await prisma.setting.findMany({
      where: { deleted_at: null },
      orderBy: { key: 'asc' },
    });
    res.json({ data: settings });
  }),
);

router.get(
  '/:key',
  requireAuth,
  asyncHandler(async (req, res) => {
    const setting = await prisma.setting.findFirst({
      where: { key: req.params.key, deleted_at: null },
    });

    if (!setting) {
      throw new AppError(404, 'Setting not found');
    }

    res.json({ data: setting });
  }),
);

router.put(
  '/:key',
  requireAuth,
  authorize(['admin']),
  validateBody(settingSchema),
  asyncHandler(async (req, res) => {
    const { key } = req.params;
    const payload = req.body as z.infer<typeof settingSchema>;

    const setting = await prisma.setting.upsert({
      where: { key },
      update: { value: payload.value },
      create: { key, value: payload.value },
    });

    res.json({ data: setting });
  }),
);

router.get(
  '/update-panel/status',
  requireAuth,
  authorize(['admin']),
  asyncHandler(async (_req, res) => {
    const current = await prisma.setting.findFirst({
      where: { key: 'system.imageTag', deleted_at: null },
    });

    const parsed = parseImageSetting(current?.value);
    const recommended = RELEASE_NOTES[0];

    const updatedAtIso = current?.updated_at ? current.updated_at.toISOString() : undefined;

    res.json({
      data: {
        currentTag: parsed.tag,
        updatedAt: parsed.updatedAt ?? updatedAtIso,
        recommendedTag: recommended?.tag ?? parsed.tag,
        releases: RELEASE_NOTES,
        lastCheckedAt: new Date().toISOString(),
      },
    });
  }),
);

const updatePanelSchema = z.object({
  targetTag: z.string().min(1, 'Target tag diperlukan'),
});

router.post(
  '/update-panel/simulate',
  requireAuth,
  authorize(['admin']),
  validateBody(updatePanelSchema),
  asyncHandler(async (req, res) => {
    const { targetTag } = req.body as z.infer<typeof updatePanelSchema>;

    const startedAt = new Date();
    const backupPath = `s3://mock-backups/wa-pos-${startedAt.getTime()}.sql.gz`;

    const steps = [
      {
        name: 'Backup pangkalan data',
        status: 'completed' as const,
        detail: `Salinan keselamatan disimpan ke ${backupPath}.`,
        durationMs: 1200,
      },
      {
        name: 'Muat turun imej & apply patch',
        status: 'completed' as const,
        detail: `Imej ${targetTag} dimuat turun, migrasi disemak (tiada perubahan).`,
        durationMs: 950,
      },
      {
        name: 'Rolling restart',
        status: 'completed' as const,
        detail: 'Setiap servis dimulakan semula secara berperingkat tanpa downtime.',
        durationMs: 1800,
      },
    ];

    const finishedAt = new Date(startedAt.getTime() + steps.reduce((sum, step) => sum + step.durationMs, 0));

    await prisma.setting.upsert({
      where: { key: 'system.imageTag' },
      update: { value: { tag: targetTag, updatedAt: finishedAt.toISOString() } },
      create: { key: 'system.imageTag', value: { tag: targetTag, updatedAt: finishedAt.toISOString() } },
    });

    res.json({
      data: {
        targetTag,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        steps,
      },
    });
  }),
);

router.post(
  '/backup/run',
  requireAuth,
  authorize(['admin']),
  asyncHandler(async (req, res) => {
    const user = getAuthenticatedUser(req);
    const result = await runBackupSimulation({ actorId: user?.id, initiatedBy: 'manual' });
    res.json({ data: result });
  }),
);

export default router;
