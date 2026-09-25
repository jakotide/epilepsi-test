const sharp=require('sharp'),fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'..'),input=path.join(root,'assets/mug/lit-orbit'),output=path.join(root,'public/models/mug/lit-orbit');
const linear=value=>{value/=255;return value<=.04045?value/12.92:((value+.055)/1.055)**2.4};
(async()=>{
  await fs.mkdir(output,{recursive:true});
  const baseline=await sharp(path.join(input,'floor-baseline.png')).ensureAlpha().raw().toBuffer();let bytes=0;
  for(let index=0;index<Number(process.env.FRAME_END||72);index++){
    const suffix=String(index).padStart(2,'0');
    const {data:floor,info}=await sharp(path.join(input,`floor-${suffix}.png`)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const object=await sharp(path.join(input,`object-${suffix}.png`)).ensureAlpha().raw().toBuffer();
    const shadow=Buffer.alloc(object.length);
    for(let i=0;i<shadow.length;i+=4){
      const lit=linear(floor[i])+linear(floor[i+1])+linear(floor[i+2]);
      const base=linear(baseline[i])+linear(baseline[i+1])+linear(baseline[i+2]);
      const density=base>.01?Math.max(0,1-lit/base):0;
      const pixel=i/4,x=pixel%info.width,y=Math.floor(pixel/info.width);
      const radius=Math.hypot((x-info.width*.55)/(info.width*.42),(y-info.height*.68)/(info.height*.17));
      const falloff=Math.max(0,Math.min(1,(1.1-radius)/.45));
      shadow[i]=101;shadow[i+1]=119;shadow[i+2]=132;
      shadow[i+3]=Math.round(255*Math.min(.62,density*.78)*falloff*falloff*(3-2*falloff)*(1-object[i+3]/255));
    }
    const png=await sharp(shadow,{raw:{width:info.width,height:info.height,channels:4}})
      .composite([{input:object,raw:{width:info.width,height:info.height,channels:4}}]).png().toBuffer();
    const result=await sharp(png).webp({quality:92,alphaQuality:100,effort:5}).toFile(path.join(output,`mug-${suffix}.webp`));bytes+=result.size;
    if(index===0)await fs.writeFile(path.join(input,'shadow-study.png'),png);
  }
  console.log({bytes});
})().catch(e=>{console.error(e);process.exitCode=1});
