import { prisma } from '../lib/prisma.js';

interface RunBackupOptions {
  actorId?: string | null;
  initiatedBy: 'manual' | 'scheduler';
}

export interface BackupRunResult {
  backupPath: string;
  startedAt: string;
  finishedAt: string;
  restoreVerifiedAt: string;
  steps: Array<{ name: string; status: 'completed'; detail: string; durationMs: number }>;
}

export const runBackupSimulation = async ({ actorId, initiatedBy }: RunBackupOptions): Promise<BackupRunResult> => {
  const startedAt = new Date();
  const backupPath = `s3://mock-backups/wa-pos-${startedAt.getTime()}.sql.gz`;

  const steps: BackupRunResult['steps'] = [
    {
      name: 'Backup pangkalan data',
      status: 'completed',
      detail: `Salinan disimpan ke ${backupPath}.`,
      durationMs: 1500,
    },
    {
      name: 'Verifikasi fail',
      status: 'completed',
      detail: 'Checksum diverifikasi dan metadata disemak.',
      durationMs: 600,
    },
    {
      name: 'Ujian pemulihan pantas',
      status: 'completed',
      detail: 'Dump dipulihkan ke instance sementara dan ujian integriti diluluskan.',
      durationMs: 1800,
    },
  ];

  const finishedAt = new Date(startedAt.getTime() + steps.reduce((sum, step) => sum + step.durationMs, 0));
  const restoreVerifiedAt = new Date(finishedAt.getTime() + 500);

  await prisma.setting.upsert({
    where: { key: 'system.backup.lastRun' },
    update: {
      value: {
        backupPath,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        restoreVerifiedAt: restoreVerifiedAt.toISOString(),
        initiatedBy,
      },
    },
    create: {
      key: 'system.backup.lastRun',
      value: {
        backupPath,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        restoreVerifiedAt: restoreVerifiedAt.toISOString(),
        initiatedBy,
      },
    },
  });

  await prisma.auditLog.create({
    data: {
      entity: 'system.backup',
      entity_id: backupPath,
      action: 'backup-run',
      diff: {
        initiatedBy,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        restoreVerifiedAt: restoreVerifiedAt.toISOString(),
      },
      metadata: { steps },
      actor_id: actorId ?? null,
    },
  });

  return {
    backupPath,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    restoreVerifiedAt: restoreVerifiedAt.toISOString(),
    steps,
  };
};
