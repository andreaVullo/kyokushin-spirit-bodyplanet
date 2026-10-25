import { env } from 'cloudflare:workers';
import { handleOnline } from '@/lib/online.mjs';

export const dynamic = 'force-dynamic';
export function POST(request: Request) { return handleOnline(request, env); }
export function OPTIONS(request: Request) { return handleOnline(request, env); }
