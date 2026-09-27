const sharp=require('sharp'),fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'..');
(async()=>{
  const output=path.join(root,'public/models/bouquet/orbit-airy');
  await fs.mkdir(output,{recursive:true});
  let bytes=0;
  for(let index=0;index<144;index++){
    const name=`view-${String(index).padStart(2,'0')}`;
    const info=await sharp(path.join(root,'assets/bouquet/orbit-airy',name+'.png'))
      .webp({quality:92,alphaQuality:100,effort:5}).toFile(path.join(output,name+'.webp'));
    bytes+=info.size;
  }
  console.log({frames:144,bytes});
})().catch(e=>{console.error(e);process.exitCode=1});
