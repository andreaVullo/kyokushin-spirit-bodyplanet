import { env } from 'cloudflare:workers';
import { handleRecord, readRecords } from '@/lib/service.mjs';

export const dynamic = 'force-dynamic';
export function POST(request: Request) { return handleRecord(request, env); }
export function OPTIONS(request: Request) { return handleRecord(request, env); }

export function GET(request: Request) { return readRecords(request, env); }
