// Builds the self-contained HTML for the file-checking station from the
// analyser's /render payload. Rendered inside a same-origin <iframe srcDoc>
// on /check, so the whole viewer (zoom, pan, rotate, measure, per-ink recolour,
// single + separations grid) is one dependency-free document.
//
// Payload shape (from the ink-analyser /render endpoint):
//   { page_width_mm, page_height_mm, image_width_px, image_height_px,
//     composite_jpg_base64,
//     separations: [ { name, coverage_pct, default_hex, mask_png_base64 } ] }

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildCheckViewerHtml(payload, fileName) {
  const seps = Array.isArray(payload && payload.separations)
    ? payload.separations
    : [];
  const IMG_W = Number(payload.image_width_px) || 1000;
  const IMG_H = Number(payload.image_height_px) || 1000;
  const DOC_W_MM = Number(payload.page_width_mm) || 0;
  const DOC_H_MM = Number(payload.page_height_mm) || 0;
  const N = seps.length;
  const label = esc(fileName || (payload.source && payload.source.filename) || "Your file");

  const covTxt = (c) => (typeof c === "number" ? c.toFixed(1) + "%" : "—");

  // Ink list rows (with per-ink colour picker)
  const rows = seps
    .map(
      (p, i) =>
        '<div class="ink" data-i="' + i + '">' +
        '<button class="eye" title="Show / hide this plate">&#128065;</button>' +
        '<input type="color" class="cpick" data-i="' + i + '" value="' + esc(p.default_hex || "#888888") + '" title="Change this separation colour">' +
        '<span class="nm">' + esc(p.name) + '</span>' +
        '<span class="cov">' + covTxt(p.coverage_pct) + '</span></div>'
    )
    .join("");

  // Single-view stacked plate layers (mask + colour assigned in JS)
  const plateDivs = seps
    .map((p, i) => '<div class="plate plate-src" data-i="' + i + '"></div>')
    .join("\n");

  // Separations grid tiles: composite first, then each plate
  let gridTiles =
    '<div class="tile"><div class="tlabel"><span class="tnm">Composite</span></div>' +
    '<div class="tstage"><div class="tcanvas"><img class="timg" data-comp></div></div></div>';
  gridTiles += seps
    .map(
      (p, i) =>
        '<div class="tile" data-i="' + i + '"><div class="tlabel">' +
        '<span class="tsw" data-i="' + i + '" style="background:' + esc(p.default_hex || "#888888") + '"></span>' +
        '<span class="tnm">' + esc(p.name) + '</span>' +
        '<span class="tcov">' + covTxt(p.coverage_pct) + '</span></div>' +
        '<div class="tstage"><div class="tcanvas"><div class="tmask plate-src" data-i="' + i + '"></div></div></div></div>'
    )
    .join("");

  const masksJson = JSON.stringify(
    seps.map((p) => "data:image/png;base64," + (p.mask_png_base64 || ""))
  );
  const colsJson = JSON.stringify(seps.map((p) => p.default_hex || "#888888"));
  const compUri = "data:image/jpeg;base64," + (payload.composite_jpg_base64 || "");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>File check — ${label}</title>
<style>
  :root{--bg:#0f1720;--panel:#1c2531;--line:#2c3a49;--txt:#e8eef4;--mut:#93a3b4;--accent:#e11d2a;--good:#16a34a}
  *{box-sizing:border-box} html,body{margin:0;height:100%;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:var(--bg);color:var(--txt)}
  .app{display:flex;flex-direction:column;height:100vh}
  header{display:flex;align-items:center;gap:14px;padding:10px 16px;background:#0b1219;border-bottom:1px solid var(--line)}
  header .logo{font-weight:800;letter-spacing:.3px} header .logo span{color:var(--accent)}
  header .file{color:var(--mut);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  header .close{margin-left:auto;font-size:12px;color:var(--mut);text-decoration:none;border:1px solid var(--line);border-radius:8px;padding:6px 10px}
  .toolbar{display:flex;align-items:center;gap:6px;padding:8px 12px;background:var(--panel);border-bottom:1px solid var(--line);flex-wrap:wrap}
  .toolbar button{background:#26303d;color:var(--txt);border:1px solid var(--line);border-radius:8px;padding:7px 11px;font-size:13px;cursor:pointer}
  .toolbar button:hover{background:#31404f} .toolbar button.on{background:var(--accent);border-color:var(--accent)}
  .seg{display:flex;border:1px solid var(--line);border-radius:8px;overflow:hidden}
  .seg button{border:0;border-radius:0;border-right:1px solid var(--line)} .seg button:last-child{border-right:0}
  .toolbar .sep{width:1px;height:22px;background:var(--line);margin:0 4px}
  .toolbar .zoomval{min-width:52px;text-align:center;color:var(--mut);font-variant-numeric:tabular-nums}
  .main{flex:1;display:flex;min-height:0}
  .stagewrap{flex:1;position:relative;overflow:hidden;background:#0a0f15;cursor:grab}
  .stagewrap.grabbing{cursor:grabbing} .stagewrap.measure{cursor:crosshair}
  #canvas{position:absolute;left:0;top:0;transform-origin:0 0}
  #paper{position:relative;background:#fff;box-shadow:0 0 0 1px #000, 0 10px 40px rgba(0,0,0,.5);width:${IMG_W}px;height:${IMG_H}px}
  #composite{position:absolute;left:0;top:0;width:${IMG_W}px;height:${IMG_H}px;user-select:none;-webkit-user-drag:none;z-index:1}
  .plate{position:absolute;left:0;top:0;width:${IMG_W}px;height:${IMG_H}px;z-index:2;mix-blend-mode:multiply;display:none;
         -webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat}
  #measureSvg{position:absolute;left:0;top:0;z-index:5;overflow:visible;pointer-events:none}
  #measureSvg line{stroke:var(--accent);stroke-width:2;vector-effect:non-scaling-stroke}
  #measureSvg circle{fill:var(--accent)}
  #gridwrap{flex:1;display:grid;grid-template-columns:repeat(3,1fr);grid-auto-rows:calc((100vh - 118px)/3);gap:2px;background:#060a0f;overflow:hidden}
  .tile{position:relative;display:flex;flex-direction:column;min-height:0;background:#060a0f}
  .tlabel{display:flex;align-items:center;gap:8px;font-size:12px;color:#d4dde6;padding:5px 9px;background:#0b1219;border-bottom:1px solid var(--line)}
  .tlabel .tsw{width:13px;height:13px;border-radius:3px;border:1px solid rgba(255,255,255,.35);cursor:pointer}
  .tlabel .tnm{font-weight:600} .tlabel .tcov{margin-left:auto;color:var(--mut);font-variant-numeric:tabular-nums}
  .tstage{flex:1;position:relative;overflow:hidden;background:#fff;cursor:grab}
  #gridwrap.grabbing .tstage{cursor:grabbing}
  .tcanvas{position:absolute;left:0;top:0;transform-origin:0 0}
  .timg{position:absolute;left:0;top:0;width:${IMG_W}px;height:${IMG_H}px;user-select:none;-webkit-user-drag:none}
  .tmask{position:absolute;left:0;top:0;width:${IMG_W}px;height:${IMG_H}px;
         -webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat}
  .panel{width:300px;background:var(--panel);border-left:1px solid var(--line);display:flex;flex-direction:column;overflow:auto}
  .panel h3{margin:0;padding:12px 14px;font-size:12px;letter-spacing:.6px;text-transform:uppercase;color:var(--mut);border-bottom:1px solid var(--line)}
  .allrow{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--line)}
  .allrow button{background:#26303d;border:1px solid var(--line);color:var(--txt);border-radius:8px;padding:6px 10px;cursor:pointer;font-size:12px}
  .ink{display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid #202a36}
  .ink .eye{width:30px;height:26px;border-radius:7px;border:1px solid var(--line);background:#26303d;color:var(--txt);cursor:pointer;font-size:13px}
  .ink.off{opacity:.5} .ink.off .eye{background:#161d26}
  .cpick{width:24px;height:24px;padding:0;border:1px solid rgba(255,255,255,.3);border-radius:6px;background:none;cursor:pointer;-webkit-appearance:none;appearance:none;flex:0 0 auto}
  .cpick::-webkit-color-swatch-wrapper{padding:0} .cpick::-webkit-color-swatch{border:none;border-radius:5px}
  .cpick::-moz-color-swatch{border:none;border-radius:5px}
  .ink .nm{flex:1;font-size:13px} .ink .cov{font-size:12px;color:var(--mut);font-variant-numeric:tabular-nums}
  .gridmode .ink .eye{display:none}
  .info{padding:12px 14px;font-size:13px;color:var(--mut);border-top:1px solid var(--line)}
  .info b{color:var(--txt)} .info .big{font-size:15px;color:var(--txt);font-weight:600}
  #measelbl{margin-top:8px;color:var(--accent);font-weight:700}
  .hint{padding:10px 14px;font-size:12px;color:var(--mut);line-height:1.5}
  .single-only.hidden{display:none}
</style></head>
<body><div class="app">
  <header>
    <div class="logo">FLEXO <span>AFRICA</span></div>
    <div class="file">${label}</div>
    <a class="close" href="#" onclick="window.close();return false;">Close</a>
  </header>
  <div class="toolbar">
    <div class="seg"><button id="btnSingle" class="on">Single view</button><button id="btnGrid">Separations</button></div>
    <div class="sep"></div>
    <button id="zout">&minus;</button><span class="zoomval" id="zval">100%</span><button id="zin">+</button>
    <button id="fit">Fit</button>
    <div class="sep"></div>
    <button id="rotbtn">&#8635; Rotate</button>
    <span class="zoomval" id="rotval" style="min-width:44px">0&deg;</span>
    <div class="sep"></div>
    <button id="measbtn">&#128207; Measure</button>
    <span class="zoomval" id="meas2" style="min-width:auto;color:var(--accent)"></span>
    <div class="sep"></div>
    <span style="color:var(--mut);font-size:12px">Scroll to zoom &middot; drag to move</span>
  </div>
  <div class="main">
    <div class="stagewrap" id="stagewrap">
      <div id="canvas"><div id="paper">
        <img id="composite" data-comp>
        ${plateDivs}
        <svg id="measureSvg" width="${IMG_W}" height="${IMG_H}"></svg>
      </div></div>
    </div>
    <div id="gridwrap" style="display:none">${gridTiles}</div>
    <div class="panel">
      <h3>Inks / plates</h3>
      <div class="allrow single-only"><button id="allon">Show all</button><button id="alloff">Hide all</button>
        <span style="color:var(--mut);font-size:12px;margin-left:auto">${N} plates</span></div>
      <div id="inks">${rows}</div>
      <div class="info">
        <div>Overall size</div>
        <div class="big">${DOC_W_MM} &times; ${DOC_H_MM} mm</div>
        <div style="margin-top:6px">(${(DOC_W_MM / 10).toFixed(1)} &times; ${(DOC_H_MM / 10).toFixed(1)} cm)</div>
        <div id="measelbl"></div>
      </div>
      <div class="hint" id="hintSingle">Tip: click the little colour square next to any ink to change how it shows &mdash; handy for <b>Varnish</b> or white, which are almost invisible on white. Turn plates off with the eye to inspect one ink. Click <b>Measure</b>, then two points, to check a distance.</div>
      <div class="hint" id="hintGrid" style="display:none">Separations view: every ink side by side, like a proof sheet. Scroll to zoom and drag to move &mdash; all panes stay locked to the same spot. Click a colour square to recolour a separation so light inks like Varnish are easy to see.</div>
    </div>
  </div>
</div>
<script>
var IMG_W=${IMG_W}, IMG_H=${IMG_H}, DOC_W_MM=${DOC_W_MM};
var MM_PER_PX = DOC_W_MM / IMG_W;
var N=${N};
var MASKS=${masksJson};
var COMP="${compUri}";
var colours=${colsJson}.slice();

document.querySelectorAll('[data-comp]').forEach(function(img){img.src=COMP;});
function paintPlate(i){
  document.querySelectorAll('.plate-src[data-i="'+i+'"]').forEach(function(el){ el.style.backgroundColor=colours[i]; });
}
document.querySelectorAll('.plate-src').forEach(function(el){ var i=+el.dataset.i;
  el.style.webkitMaskImage='url('+MASKS[i]+')'; el.style.maskImage='url('+MASKS[i]+')'; el.style.backgroundColor=colours[i]; });

function setInkColour(i,css){
  colours[i]=css; paintPlate(i);
  var pick=document.querySelector('.cpick[data-i="'+i+'"]'); if(pick) pick.value=css;
  var tsw=document.querySelector('.tsw[data-i="'+i+'"]'); if(tsw) tsw.style.background=css;
}
document.querySelectorAll('.cpick').forEach(function(inp){inp.addEventListener('input',function(e){setInkColour(+inp.dataset.i, e.target.value);});});
document.querySelectorAll('.tsw').forEach(function(sw){sw.addEventListener('click',function(){
  var p=document.querySelector('.cpick[data-i="'+sw.dataset.i+'"]'); if(p) p.click();
});});

var enabled=new Set(); for(var _i=0;_i<N;_i++) enabled.add(_i);
var composite=document.getElementById('composite');
var plateEls=[].slice.call(document.querySelectorAll('.plate'));
var inkRows=[].slice.call(document.querySelectorAll('.ink'));
function renderInks(){
  var all = enabled.size===N;
  composite.style.display = all ? 'block':'none';
  plateEls.forEach(function(el){ var i=+el.dataset.i; el.style.display = (!all && enabled.has(i))?'block':'none'; });
  inkRows.forEach(function(row){ var i=+row.dataset.i; var on=enabled.has(i);
    row.classList.toggle('off',!on); row.querySelector('.eye').innerHTML = on?'&#128065;':'&mdash;'; });
}
inkRows.forEach(function(row){row.querySelector('.eye').addEventListener('click',function(){
  var i=+row.dataset.i; if(enabled.has(i)){enabled.delete(i);}else{enabled.add(i);} renderInks();
});});
document.getElementById('allon').onclick=function(){enabled=new Set();for(var i=0;i<N;i++)enabled.add(i);renderInks();};
document.getElementById('alloff').onclick=function(){enabled=new Set();renderInks();};

function bbUnit(rot){
  var rad=rot*Math.PI/180, c=Math.cos(rad), s=Math.sin(rad);
  var cs=[[0,0],[IMG_W,0],[IMG_W,IMG_H],[0,IMG_H]].map(function(p){return [c*p[0]-s*p[1], s*p[0]+c*p[1]];});
  var xs=cs.map(function(p){return p[0];}), ys=cs.map(function(p){return p[1];});
  return {minx:Math.min.apply(null,xs),maxx:Math.max.apply(null,xs),miny:Math.min.apply(null,ys),maxy:Math.max.apply(null,ys)};
}

var wrap=document.getElementById('stagewrap'), canvas=document.getElementById('canvas');
var scale=1, tx=0, ty=0, rot=0;
function applyS(){
  canvas.style.transform='translate('+tx+'px,'+ty+'px) rotate('+rot+'deg) scale('+scale+')';
  document.getElementById('zval').textContent=Math.round(scale*100)+'%';
  document.getElementById('rotval').innerHTML=rot+'&deg;';
}
function fitS(){
  var r=wrap.getBoundingClientRect(); var pad=40;
  var bb=bbUnit(rot); var bw=bb.maxx-bb.minx, bh=bb.maxy-bb.miny;
  scale=Math.min((r.width-pad)/bw,(r.height-pad)/bh);
  tx=(r.width - bw*scale)/2 - bb.minx*scale;
  ty=(r.height - bh*scale)/2 - bb.miny*scale; applyS();
}
function toImgS(px,py){
  var dx=px-tx, dy=py-ty;
  var rad=rot*Math.PI/180, c=Math.cos(rad), s=Math.sin(rad);
  var ux=dx/scale, uy=dy/scale;
  return [c*ux + s*uy, -s*ux + c*uy];
}
function zoomAtS(f,mx,my){
  var rpx=(mx-tx)/scale, rpy=(my-ty)/scale;
  scale*=f; tx=mx-rpx*scale; ty=my-rpy*scale; applyS();
}
wrap.addEventListener('wheel',function(e){e.preventDefault(); var r=wrap.getBoundingClientRect();
  zoomAtS(e.deltaY<0?1.12:1/1.12, e.clientX-r.left, e.clientY-r.top); },{passive:false});
var panning=false,sx,sy;
wrap.addEventListener('mousedown',function(e){ if(measure){onMeasureClick(e);return;} panning=true;sx=e.clientX-tx;sy=e.clientY-ty;wrap.classList.add('grabbing'); });
window.addEventListener('mousemove',function(e){ if(panning){tx=e.clientX-sx;ty=e.clientY-sy;applyS();} });
window.addEventListener('mouseup',function(){panning=false;wrap.classList.remove('grabbing');});

var gridwrap=document.getElementById('gridwrap');
var gscale=1, gtx=0, gty=0, grot=0;
function applyG(){
  var t='translate('+gtx+'px,'+gty+'px) rotate('+grot+'deg) scale('+gscale+')';
  document.querySelectorAll('.tcanvas').forEach(function(c){c.style.transform=t;});
  document.getElementById('zval').textContent=Math.round(gscale*100)+'%';
  document.getElementById('rotval').innerHTML=grot+'&deg;';
}
function tileRect(){ return document.querySelector('.tstage').getBoundingClientRect(); }
function fitG(){
  var r=tileRect(); var pad=12;
  var bb=bbUnit(grot); var bw=bb.maxx-bb.minx, bh=bb.maxy-bb.miny;
  gscale=Math.min((r.width-pad)/bw,(r.height-pad)/bh);
  gtx=(r.width - bw*gscale)/2 - bb.minx*gscale;
  gty=(r.height - bh*gscale)/2 - bb.miny*gscale; applyG();
}
function toImgG(px,py){
  var dx=px-gtx, dy=py-gty;
  var rad=grot*Math.PI/180, c=Math.cos(rad), s=Math.sin(rad);
  var ux=dx/gscale, uy=dy/gscale;
  return [c*ux + s*uy, -s*ux + c*uy];
}
function zoomAtG(f,mx,my){
  var rpx=(mx-gtx)/gscale, rpy=(my-gty)/gscale;
  gscale*=f; gtx=mx-rpx*gscale; gty=my-rpy*gscale; applyG();
}
gridwrap.addEventListener('wheel',function(e){ var st=e.target.closest('.tstage'); if(!st)return; e.preventDefault();
  var r=st.getBoundingClientRect(); zoomAtG(e.deltaY<0?1.12:1/1.12, e.clientX-r.left, e.clientY-r.top); },{passive:false});
var gpan=false,gsx,gsy;
gridwrap.addEventListener('mousedown',function(e){ var st=e.target.closest('.tstage'); if(!st)return; gpan=true;gsx=e.clientX-gtx;gsy=e.clientY-gty;gridwrap.classList.add('grabbing'); });
window.addEventListener('mousemove',function(e){ if(gpan){gtx=e.clientX-gsx;gty=e.clientY-gsy;applyG();} });
window.addEventListener('mouseup',function(){gpan=false;gridwrap.classList.remove('grabbing');});

var mode='single';
function isGrid(){ return mode==='grid'; }
function setMode(m){
  if(measure && m!=='single'){ toggleMeasure(); }
  mode=m;
  document.body.classList.toggle('gridmode', m==='grid');
  document.getElementById('stagewrap').style.display = m==='single'?'':'none';
  gridwrap.style.display = m==='grid'?'grid':'none';
  document.getElementById('btnSingle').classList.toggle('on',m==='single');
  document.getElementById('btnGrid').classList.toggle('on',m==='grid');
  document.querySelectorAll('.single-only').forEach(function(el){el.classList.toggle('hidden',m!=='single');});
  document.getElementById('measbtn').style.display = m==='single'?'':'none';
  document.getElementById('hintSingle').style.display = m==='single'?'':'none';
  document.getElementById('hintGrid').style.display = m==='grid'?'':'none';
  if(m==='single') fitS(); else fitG();
}
document.getElementById('btnSingle').onclick=function(){setMode('single');};
document.getElementById('btnGrid').onclick=function(){setMode('grid');};

function zoomBtn(f){ if(isGrid()){var r=tileRect();zoomAtG(f,r.width/2,r.height/2);} else {var r=wrap.getBoundingClientRect();zoomAtS(f,r.width/2,r.height/2);} }
document.getElementById('zin').onclick=function(){zoomBtn(1.25);};
document.getElementById('zout').onclick=function(){zoomBtn(1/1.25);};
document.getElementById('fit').onclick=function(){ if(isGrid()){fitG();}else{fitS();} };
document.getElementById('rotbtn').onclick=function(){
  if(isGrid()){
    var r=tileRect(); var cx=r.width/2, cy=r.height/2; var pI=toImgG(cx,cy); var ix=pI[0], iy=pI[1];
    grot=(grot+90)%360; var rad=grot*Math.PI/180, c=Math.cos(rad), s=Math.sin(rad);
    gtx=cx-gscale*(c*ix - s*iy); gty=cy-gscale*(s*ix + c*iy); applyG();
  } else {
    var r2=wrap.getBoundingClientRect(); var cx2=r2.width/2, cy2=r2.height/2; var pI2=toImgS(cx2,cy2); var ix2=pI2[0], iy2=pI2[1];
    rot=(rot+90)%360; var rad2=rot*Math.PI/180, c2=Math.cos(rad2), s2=Math.sin(rad2);
    tx=cx2-scale*(c2*ix2 - s2*iy2); ty=cy2-scale*(s2*ix2 + c2*iy2); applyS();
  }
};

var measure=false, pts=[];
var svg=document.getElementById('measureSvg');
var measbtn=document.getElementById('measbtn');
function toggleMeasure(){ measure=!measure; pts=[]; svg.innerHTML=''; document.getElementById('meas2').textContent=''; document.getElementById('measelbl').textContent='';
  measbtn.classList.toggle('on',measure); wrap.classList.toggle('measure',measure); }
measbtn.onclick=toggleMeasure;
function onMeasureClick(e){ var r=wrap.getBoundingClientRect(); var p=toImgS(e.clientX-r.left,e.clientY-r.top); var x=p[0], y=p[1];
  pts.push([x,y]); if(pts.length>2){pts=[[x,y]];}
  var out='';
  if(pts.length===2){ var x0=pts[0][0], y0=pts[0][1]; out='<line x1="'+x0+'" y1="'+y0+'" x2="'+x+'" y2="'+y+'"/><circle cx="'+x0+'" cy="'+y0+'" r="5"/><circle cx="'+x+'" cy="'+y+'" r="5"/>';
    var dpx=Math.hypot(x-x0,y-y0); var mm=dpx*MM_PER_PX; var lbl=mm.toFixed(1)+' mm  ('+(mm/10).toFixed(2)+' cm)';
    document.getElementById('meas2').textContent=lbl; document.getElementById('measelbl').textContent='Distance: '+lbl; }
  else { out='<circle cx="'+x+'" cy="'+y+'" r="5"/>'; }
  svg.innerHTML=out; }

renderInks(); window.addEventListener('load',fitS); setTimeout(fitS,60);
</script></body></html>`;
}
