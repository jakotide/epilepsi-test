const sharp=require('sharp'),fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'..');
(async()=>{
  let bytes=0;
  for(const tree of ['birch-ink','birch-blue','birch-gold']){
    const output=path.join(root,'public/models/grove/woodland/orbit',tree);
    await fs.mkdir(output,{recursive:true});
    for(let index=0;index<72;index++){
      const name=`view-${String(index).padStart(2,'0')}`;
      const info=await sharp(path.join(root,'assets/grove/woodland/orbit',tree,name+'.png'))
        .webp({quality:90,alphaQuality:100,effort:5}).toFile(path.join(output,name+'.webp'));
      bytes+=info.size;
    }
  }
  console.log({frames:216,bytes});
})().catch(e=>{console.error(e);process.exitCode=1});
