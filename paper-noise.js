/* Paper-grain noise texture — generates a seamless tileable noise overlay.
   Pure grain — does NOT change paper color. */
(function(){
  var S=256,perm=new Uint8Array(512),p=new Uint8Array(256);
  for(var i=0;i<256;i++)p[i]=i;
  for(var i=255;i>0;i--){var j=Math.random()*i|0;var t=p[i];p[i]=p[j];p[j]=t;}
  for(var i=0;i<512;i++)perm[i]=p[i&255];
  function grad(h,x,y){var v=h&3;return(v===0?x+y:v===1?-x+y:v===2?x-y:-x-y);}
  function fade(t){return t*t*t*(t*(t*6-15)+10);}
  function lerp(a,b,t){return a+t*(b-a);}
  function noise2d(x,y){
    var xi=x|0,yi=y|0,xf=x-xi,yf=y-yi;xi&=255;yi&=255;
    var u=fade(xf),v=fade(yf);
    var aa=perm[perm[xi]+yi],ab=perm[perm[xi]+(yi+1&255)],
        ba=perm[perm[(xi+1&255)]+yi],bb=perm[perm[(xi+1&255)]+(yi+1&255)];
    return lerp(lerp(grad(aa,xf,yf),grad(ba,xf-1,yf),u),lerp(grad(ab,xf,yf-1),grad(bb,xf-1,yf-1),u),v);
  }
  function fbm(x,y){var val=0,amp=1,freq=1,total=0;for(var o=0;o<4;o++){val+=noise2d(x*freq,y*freq)*amp;total+=amp;amp*=0.5;freq*=2;}return val/total;}
  var c=document.createElement('canvas');c.width=c.height=S;
  var ctx=c.getContext('2d'),img=ctx.createImageData(S,S),d=img.data;
  for(var y=0;y<S;y++)for(var x=0;x<S;x++){
    var n=fbm(x/40,y/40),fine=fbm(x/12,y/12),v=(n*0.6+fine*0.4+1)*0.5;
    var lum=Math.round(v*255),idx=(y*S+x)*4;
    d[idx]=d[idx+1]=d[idx+2]=lum<128?0:255;
    d[idx+3]=Math.round(Math.abs(lum-128)/128*18);
  }
  ctx.putImageData(img,0,0);
  var url=c.toDataURL('image/png');
  var s=document.createElement('style');
  s.textContent='body{background-image:url('+url+') !important;background-size:256px 256px !important;background-repeat:repeat !important;}'
    +'#page-transition{background-image:url('+url+') !important;background-size:256px 256px !important;background-repeat:repeat !important;}'
    +'.hp-column{background-image:url('+url+') !important;background-size:256px 256px !important;background-repeat:repeat !important;}';
  document.head.appendChild(s);
})();
