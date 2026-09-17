import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const rows = await p.attendance.findMany({ where: { session_id: 'f2c6654d-f33e-4bd6-ae41-e1cbb8cc4ffa' }, include: { student: { include: { user: true } } } });
