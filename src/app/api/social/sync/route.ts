import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { syncAllSocialConnections } from '@/lib/social-sync';

export const dynamic='force-dynamic';
export const maxDuration=60;

export async function GET(req:NextRequest){
  const secret=process.env.CRON_SECRET;
  const supplied=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'')||'';
  if(!secret)return NextResponse.json({error:'unavailable'},{status:503});
  const a=Buffer.from(supplied),b=Buffer.from(secret);
  if(a.length!==b.length||!timingSafeEqual(a,b)){
    return NextResponse.json({error:'unauthorized'},{status:401});
  }
  try{
    const result=await syncAllSocialConnections();
    return NextResponse.json(result,{status:result.failed?207:200});
  }catch{
    return NextResponse.json({ok:false,error:'sync_failed'},{status:500});
  }
}
