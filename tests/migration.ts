import assert from 'node:assert/strict'
import { mkdtemp,mkdir,writeFile,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import { pool } from '../server/db/index.js'
import { deleteObject } from '../server/storage.js'
const run=promisify(execFile),owner=randomUUID(),document=randomUUID(),file=randomUUID()
const dir=await mkdtemp(path.join(tmpdir(),'open-kyc-migration-'))
try{
 await pool.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,false,now(),now())',[owner,'Migration test',`migration-${owner}@example.com`])
 await mkdir(path.join(dir,'documents'));await mkdir(path.join(dir,'storage'))
 await writeFile(path.join(dir,'storage','example.pdf'),'%PDF-1.4\nMigration fixture\n%%EOF')
 await writeFile(path.join(dir,'documents','documents.jsonl'),JSON.stringify({_id:document,_creationTime:Date.now(),name:'Legacy PDF',fileId:file}))
 const map=path.join(dir,'map.json')
 await writeFile(map,JSON.stringify({users:{},records:{},files:{[file]:'storage/example.pdf'}}))
 const execute=(apply=false)=>run(process.execPath,['--import','tsx','scripts/import-convex.ts',dir,map,...(apply?['--apply']:[])],{cwd:process.cwd()})
 await assert.rejects(execute(),/Explicit ownership missing/)
 await writeFile(map,JSON.stringify({users:{},records:{[document]:owner},files:{[file]:'storage/example.pdf'}}))
 await execute();assert.equal((await pool.query('SELECT id FROM entities WHERE id=$1',[document])).rowCount,0)
 await execute(true);await execute(true)
 assert.equal((await pool.query('SELECT id FROM entities WHERE id=$1',[document])).rowCount,1)
 assert.equal((await pool.query('SELECT id FROM files WHERE id=$1',[file])).rowCount,1)
 console.log('Migration checks passed: missing ownership rejected, dry-run is read-only, repeated apply is idempotent')
}finally{
 const rows=await pool.query('SELECT provider,bucket,object_key AS "objectKey" FROM files WHERE id=$1',[file]);for(const ref of rows.rows)await deleteObject(ref)
 await pool.query('DELETE FROM files WHERE id=$1',[file]);await pool.query('DELETE FROM entities WHERE owner_id=$1',[owner]);await pool.query('DELETE FROM "user" WHERE id=$1',[owner]);await pool.end();await rm(dir,{recursive:true,force:true})
}
