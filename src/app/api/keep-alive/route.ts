import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Lightweight query on purchase_orders which has an allow_all_anon policy
    const { error } = await supabase
      .from('purchase_orders')
      .select('id')
      .limit(1);

    if (error) {
      console.error('Keep-alive query error:', error);
      return NextResponse.json({ ok: false }, { status: 500 });
    }

    return NextResponse.json({ 
      ok: true, 
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    console.error('Keep-alive unexpected error:', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
