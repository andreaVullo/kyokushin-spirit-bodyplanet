import { env } from 'cloudflare:workers';
import { status } from '@/lib/service.mjs';

export const dynamic = 'force-dynamic';
export function GET() {
  return Response.json(status(env), { headers: { 'Cache-Control': 'no-store' } });
}
