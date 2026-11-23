import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { DomainError } from '../../../packages/shared/src/index.js';

export const MAX_UPLOAD_BYTES=5*1024*1024;
const signatures=[['image/jpeg',[0xff,0xd8,0xff]],['image/png',[0x89,0x50,0x4e,0x47]],['image/webp',[0x52,0x49,0x46,0x46]]];
// Uploads are identified by their bytes, not the declared type, then re-encoded so metadata and any embedded payload are discarded.
export async function processImage(buffer){
 if(!Buffer.isBuffer(buffer)||!buffer.length)throw new DomainError('Choose an image to upload');
 if(buffer.length>MAX_UPLOAD_BYTES)throw new DomainError('Images must be 5 MB or smaller',413);
 if(!signatures.some(([,sig])=>sig.every((b,i)=>buffer[i]===b)))throw new DomainError('Upload a JPEG, PNG or WebP image',415);
 let image;
 try{image=sharp(buffer,{limitInputPixels:40_000_000}).rotate();const meta=await image.metadata();if((meta.width||0)<300||(meta.height||0)<300)throw new DomainError('Product photos must be at least 300 × 300 pixels');}
 catch(error){if(error instanceof DomainError)throw error;throw new DomainError('This image could not be read',415);}
 const {data,info}=await image.resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality:84}).toBuffer({resolveWithObject:true});
 return {data,width:info.width,height:info.height};
}
// Local-disk storage. A production adapter (S3-compatible) implements the same put/get/remove methods.
export function localStorage(dir){
 const root=resolve(dir);
 return {
  async put(data){await mkdir(root,{recursive:true});const file=`${randomUUID()}.webp`;await writeFile(join(root,file),data);return {file,url:`/api/media/${file}`};},
  async remove(file){if(/^[0-9a-f-]{36}\.webp$/.test(file))await unlink(join(root,file)).catch(()=>{});},
  async get(file){if(!/^[0-9a-f-]{36}\.webp$/.test(file))return null;try{return await readFile(join(root,file));}catch{return null;}},
 };
}
