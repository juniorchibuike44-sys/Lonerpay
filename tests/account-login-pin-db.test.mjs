import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFile} from 'node:fs/promises';
const user='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const id1='11111111-1111-1111-1111-111111111111',id2='22222222-2222-2222-2222-222222222222',id3='33333333-3333-3333-3333-333333333333',lease='44444444-4444-4444-4444-444444444444';
const proof='a'.repeat(64),wrong='b'.repeat(64),hash='c'.repeat(64),legacy='d'.repeat(64);const deviceHash=id=>id===id1?hash:id===id2?'e'.repeat(64):'f'.repeat(64);
test('one permanent account PIN survives device expiry, links devices, shares attempt limits, resets explicitly and isolates users',async()=>{
 const db=new PGlite();await db.exec('create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role;');await db.query('insert into auth.users values($1),($2)',[user,other]);await db.exec(await readFile(new URL('../supabase/login-pin-setup.sql',import.meta.url),'utf8'));const sql=await readFile(new URL('../supabase/account-login-pin.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
 const config=async(mode,id=id1,p=proof,who=user,old=[])=>(await db.query('select configure_account_login_pin($1,$2,$3,$4,$5,$6,$7) as r',[who,p,mode,id,deviceHash(id),legacy,JSON.stringify(old)])).rows[0].r;
 const context=async(who=user,id=null)=>(await db.query('select login_pin_account_context($1,$2,$3) as r',[who,id,id?deviceHash(id):null])).rows[0].r;
 const check=async(id=id1,p=proof)=>(await db.query('select check_account_login_pin($1,$2,$3,$4,$5) as r',[id,deviceHash(id),p,legacy,lease])).rows[0].r;
 assert.equal((await context()).has_pin,false);assert.equal((await config('enroll')).status,'ok');assert.equal((await context()).has_pin,true);assert.equal((await config('enroll',id2,wrong)).status,'already_set');assert.equal((await config('attach',id2)).status,'ok');assert.equal((await context(user,id2)).device_ready,true);assert.equal((await context(other)).has_pin,false);
 assert.equal((await check()).status,'ok');assert.equal((await check()).status,'busy');await db.query('select finish_login_pin($1,$2)',[id1,lease]);
 for(let n=0;n<4;n++)assert.equal((await check(n%2?id1:id2,wrong)).status,'incorrect');assert.equal((await check(id2,wrong)).status,'locked');assert.equal((await check(id1)).status,'locked');
 await db.exec("update login_pin_accounts set locked_until=now()-interval '1 minute';update login_pin_devices set expires_at=now()-interval '1 minute'");assert.equal((await check()).status,'expired');let c=await context();assert.equal(c.has_pin,true);assert.equal(c.device_ready,false);assert.equal((await config('attach',id3)).status,'ok');
 assert.equal((await config('reset',id1,wrong)).status,'ok');assert.equal((await context(user,id3)).device_ready,false);assert.equal((await check(id1,proof)).status,'incorrect');assert.equal((await check(id1,wrong)).status,'ok');
 await db.query('select forget_login_pin_device($1,$2)',[id1,hash]);assert.equal((await context()).has_pin,true);assert.equal((await context(user,id1)).device_ready,false);
 await db.exec('set role authenticated');await assert.rejects(()=>config('reset'),/permission denied/);await db.exec('reset role;set role anon');await assert.rejects(()=>context(),/permission denied/);await db.close();
});
test('legacy PIN migrates unchanged on an approved device or after password login on another device',async()=>{
 const db=new PGlite();await db.exec('create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role;');await db.query('insert into auth.users values($1),($2)',[user,other]);await db.exec(await readFile(new URL('../supabase/login-pin-setup.sql',import.meta.url),'utf8'));await db.exec(await readFile(new URL('../supabase/account-login-pin.sql',import.meta.url),'utf8'));
 await db.query("insert into login_pin_devices(id,user_id,device_hash,pin_proof,expires_at) values($1,$2,$3,$4,now()-interval '1 year'),($5,$6,$3,$4,now()+interval '1 day')",[id1,user,hash,legacy,id2,other]);
 assert.equal((await db.query('select login_pin_account_context($1,null,null) as r',[user])).rows[0].r.has_pin,true);
 let r=(await db.query("select configure_account_login_pin($1,$2,'attach',$3,$4,$5,$6) as r",[user,proof,id3,deviceHash(id3),legacy,JSON.stringify([{id:id1,proof:legacy}])])).rows[0].r;assert.equal(r.status,'ok');
 r=(await db.query('select check_account_login_pin($1,$2,$3,$4,$5) as r',[id2,hash,proof,legacy,lease])).rows[0].r;assert.equal(r.status,'ok');assert.equal((await db.query('select count(*)::int as n from login_pin_accounts where pin_proof=$1',[proof])).rows[0].n,2);await db.close();
});
