import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { stripLab } from '../../../scripts/astro-strip-lab.mjs';
const directories: string[] = [];
const original = process.env.INCLUDE_LAB;
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir,{recursive:true,force:true}); if(original===undefined)delete process.env.INCLUDE_LAB;else process.env.INCLUDE_LAB=original; });
function fixture(){
 const dir=mkdtempSync(path.join(tmpdir(),'placement-build-'));directories.push(dir);
 for(const folder of ['lab','models','config/locations'])mkdirSync(path.join(dir,folder),{recursive:true});
 writeFileSync(path.join(dir,'models/lab-chiiki2.glb'),'test model');
 writeFileSync(path.join(dir,'config/locations/heigawa-suimon.json'),JSON.stringify({debug:true,modelPath:'/models/watergate.glb'}));
 writeFileSync(path.join(dir,'config/locations/lab-chiiki2.json'),'{}');
 return dir;
}
describe('public placement build',()=>{
 it('removes test models and debug configuration without modifying source configs',()=>{
  delete process.env.INCLUDE_LAB;const dir=fixture();
  stripLab().hooks['astro:build:done']({dir:pathToFileURL(dir+'/'),logger:{info:()=>{}}});
  expect(existsSync(path.join(dir,'lab'))).toBe(false);
  expect(existsSync(path.join(dir,'models/lab-chiiki2.glb'))).toBe(false);
  expect(existsSync(path.join(dir,'config/locations/lab-chiiki2.json'))).toBe(false);
  expect(JSON.parse(readFileSync(path.join(dir,'config/locations/heigawa-suimon.json'),'utf8'))).toEqual({debug:false,modelPath:'/models/watergate.glb'});
 });
 it('retains models and correction settings in the explicit demo build',()=>{
  process.env.INCLUDE_LAB='1';const dir=fixture();
  stripLab().hooks['astro:build:done']({dir:pathToFileURL(dir+'/'),logger:{info:()=>{}}});
  expect(existsSync(path.join(dir,'models/lab-chiiki2.glb'))).toBe(true);
  expect(JSON.parse(readFileSync(path.join(dir,'config/locations/heigawa-suimon.json'),'utf8')).debug).toBe(true);
 });
});
