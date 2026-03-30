const G=__GRID_DATA__;
const LN=__LANE_NUMBERS__;
const RL=__RESERVED_LANES__;
const WC=__WAVE_COLORS__;
const OG=JSON.parse(JSON.stringify(G));
let H=[],sel=new Set(),sm=false,pm=null,ds=null,zm=100,st='',lci=null,showOrig=false;
let notes={};
let scenarios=JSON.parse(localStorage.getItem('tcy5-scenarios')||'{}');
const KS=['f','adv','fl','rt','cat','ro'];
const $=id=>document.getElementById(id);
function K(r,c){return r+','+c}
function gc(r,c){return G[r].cells[c]}
function oc(r,c){return OG[r].cells[c]}
function E(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function T(s,n){return !s?'':s.length>n?s.slice(0,n-1)+'…':s}
function clr(cell){if(RL.includes(cell.ln)&&(cell.cat==='EMPTY'||cell.cat==='DYNAMIC'))return WC.FPD||WC.EMPTY;return WC[cell.cat]||WC.EMPTY}
function isChanged(r,c){const a=gc(r,c),b=oc(r,c);return a.f!==b.f||a.adv!==b.adv||a.fl!==b.fl||a.rt!==b.rt}


function render(){
  const src=showOrig?OG:G;
  let h='<table class="fg" style="transform:scale('+(zm/100)+')"><thead><tr><th></th>';
  for(let i=0;i<LN.length;i++){const l=LN[i];h+='<th>'+(RL.includes(l)?'L'+l+'<br><span style="font-size:5px;opacity:.3">FPD</span>':'L'+l)+'</th>'}
  h+='</tr></thead><tbody>';
  for(let r=0;r<src.length;r++){const row=src[r];
    h+='<tr><td class="rl">R'+row.rn;
    if(row.wg)h+='<br><span style="font-size:6px;opacity:.4">W'+E(row.wg)+'</span>';
    h+='</td>';
    for(let c=0;c<row.cells.length;c++){const cell=row.cells[c],co=clr(cell),iS=sel.has(K(r,c)),iH=st&&cell.f.toLowerCase().includes(st);
      const chg=!showOrig&&isChanged(r,c),hasN=!!notes[K(r,c)];
      let cl='c';if(iS)cl+=' sel';if(iH)cl+=' hit';if(pm)cl+=' pt';if(chg)cl+=' changed';if(hasN)cl+=' has-note';
      h+='<td class="'+cl+'" draggable="'+(pm||showOrig?'false':'true')+'" data-r="'+r+'" data-c="'+c+'" style="background:'+co.b+';color:'+co.t+'">';
      h+='<span class="tb2 '+(cell.fl?'fl':'ml')+'">'+(cell.fl?'F':'M')+'</span>';
      h+='<div class="ci">'+E(cell.id)+'</div><div class="fn">'+E(T(cell.f,9))+'</div>';
      if(cell.adv!=null)h+='<div class="av">'+cell.adv+'</div>';
      h+='</td>'}h+='</tr>'}
  h+='</tbody></table>';$('gw').innerHTML=h;bindAll();upSt();upChg();upImp()}


function upSt(){
  $('sc').textContent=H.length+' op'+(H.length!==1?'s':'');$('bu').disabled=!H.length;
  let n=sel.size,adv=0;sel.forEach(k=>{const[r,c]=k.split(',').map(Number);if(gc(r,c).adv)adv+=gc(r,c).adv});
  $('ssi').textContent=n?n+' sel · ADV:'+adv.toLocaleString():'';
  $('bcl').disabled=!n;$('bsf').disabled=!n;$('btt').disabled=!n;
  $('bsm').classList.toggle('on',sm);$('zl').textContent=zm+'%';$('btv').classList.toggle('on',showOrig)}
function upIns(){
  const ie=$('ie'),ic=$('ic');
  if(sel.size!==1){ie.style.display='block';ic.style.display='none';ie.textContent=sel.size>1?sel.size+' cells':'Click a cell';$('ne').style.display='block';$('nc2').style.display='none';return}
  ie.style.display='none';ic.style.display='block';$('ne').style.display='none';$('nc2').style.display='block';
  const[r,c]=[...sel][0].split(',').map(Number),cell=gc(r,c),row=G[r],orig=oc(r,c),chg=isChanged(r,c);
  let ih='<div class="f"><label>Chute</label><div class="v">'+E(cell.id)+'</div></div>'+
    '<div class="f"><label>Position</label><div class="v">Row '+row.rn+' · Lane '+cell.ln+'</div></div>'+
    '<div class="f"><label>Wave</label><div class="v">'+(row.wg||'—')+'</div></div>'+
    '<div class="f"><label>Filter</label><div class="v" style="color:var(--accent)">'+E(cell.f||'(empty)')+'</div></div>'+
    '<div class="f"><label>ADV</label><div class="v" style="font-size:14px;font-weight:bold">'+(cell.adv!=null?cell.adv.toLocaleString():'—')+'</div></div>'+
    '<div class="f"><label>Type</label><div class="v">'+cell.rt+(cell.fl?' (FLAT)':' (Multi)')+'</div></div>';
  if(chg)ih+='<div style="margin-top:6px;padding:4px;background:rgba(255,153,0,.1);border:1px solid rgba(255,153,0,.3);border-radius:3px;font-size:9px"><span style="color:var(--accent)">⚡ Changed</span><br>Was: '+E(orig.f||'empty')+' · ADV:'+(orig.adv??'—')+'</div>';
  ic.innerHTML=ih;$('nt2').value=notes[K(r,c)]||'';$('nsv').style.display='none'}


function upChg(){
  const changes=[];
  for(let r=0;r<G.length;r++)for(let c=0;c<G[r].cells.length;c++){
    if(isChanged(r,c)){const cur=gc(r,c),orig=oc(r,c);
      changes.push({id:cur.id,row:G[r].rn,lane:cur.ln,wave:G[r].wg,oldF:orig.f,newF:cur.f,oldAdv:orig.adv,newAdv:cur.adv,oldRt:orig.rt,newRt:cur.rt,note:notes[K(r,c)]||''})}}
  if(!changes.length){$('chg-content').innerHTML='<p style="color:#444;font-style:italic">No changes yet. Drag cells to build your proposal.</p>';return}
  let h='<p style="color:#888;margin:0 0 4px;font-size:9px">'+changes.length+' proposed change'+(changes.length>1?'s':'')+'</p>';
  h+='<table><thead><tr><th>Chute</th><th>Row</th><th>Lane</th><th>Was</th><th>→ Proposed</th><th>ADV Δ</th><th>Type</th><th>Note</th></tr></thead><tbody>';
  for(const ch of changes){const d=(ch.newAdv||0)-(ch.oldAdv||0);
    h+='<tr><td>'+E(ch.id)+'</td><td>R'+ch.row+'</td><td>L'+ch.lane+'</td><td class="chg-rem">'+E(ch.oldF||'empty')+'</td><td class="chg-add">'+E(ch.newF||'empty')+'</td><td class="'+(d>0?'chg-add':d<0?'chg-rem':'')+'">'+(d>0?'+':'')+d+'</td><td>'+(ch.oldRt!==ch.newRt?'<span class="chg-mod">'+ch.oldRt+'→'+ch.newRt+'</span>':ch.newRt)+'</td><td style="color:#666;max-width:100px;overflow:hidden;text-overflow:ellipsis">'+E(ch.note||'—')+'</td></tr>'}
  h+='</tbody></table>';$('chg-content').innerHTML=h}


function upImp(){
  let tO=0,tN=0,chgC=0,flips=0;const lO={},lN={};
  for(let r=0;r<G.length;r++)for(let c=0;c<G[r].cells.length;c++){
    const cur=gc(r,c),orig=oc(r,c);tO+=(orig.adv||0);tN+=(cur.adv||0);
    lO[cur.ln]=(lO[cur.ln]||0)+(orig.adv||0);lN[cur.ln]=(lN[cur.ln]||0)+(cur.adv||0);
    if(isChanged(r,c)){chgC++;if(orig.fl!==cur.fl)flips++}}
  const d=tN-tO;
  let h='<div class="imp-grid"><div class="imp-card"><div class="imp-label">Changed</div><div class="imp-val">'+chgC+'</div></div>';
  h+='<div class="imp-card"><div class="imp-label">Total ADV</div><div class="imp-val">'+tN.toLocaleString()+'</div><div class="imp-delta '+(d>=0?'pos':'neg')+'">'+(d>=0?'+':'')+d.toLocaleString()+'</div></div>';
  h+='<div class="imp-card"><div class="imp-label">Type Flips</div><div class="imp-val">'+flips+'</div></div></div>';
  const lanes=[...new Set([...Object.keys(lO),...Object.keys(lN)])].sort((a,b)=>a-b);
  h+='<table><thead><tr><th>Lane</th><th>Original</th><th>Proposed</th><th>Delta</th></tr></thead><tbody>';
  for(const ln of lanes){const o=lO[ln]||0,n=lN[ln]||0,dd=n-o;if(!dd)continue;
    h+='<tr><td>L'+ln+'</td><td>'+o.toLocaleString()+'</td><td>'+n.toLocaleString()+'</td><td class="'+(dd>0?'chg-add':'chg-rem')+'">'+(dd>0?'+':'')+dd.toLocaleString()+'</td></tr>'}
  h+='</tbody></table>';$('imp-content').innerHTML=h}


function bindAll(){document.querySelectorAll('.c').forEach(el=>{
  el.addEventListener('mousedown',onClick);el.addEventListener('dragstart',onDS);
  el.addEventListener('dragover',e=>{e.preventDefault()});
  el.addEventListener('dragenter',e=>{e.preventDefault();e.currentTarget.classList.add('dov')});
  el.addEventListener('dragleave',e=>e.currentTarget.classList.remove('dov'));
  el.addEventListener('drop',onDr);
  el.addEventListener('dragend',e=>{e.currentTarget.classList.remove('drg');document.querySelectorAll('.dov').forEach(x=>x.classList.remove('dov'));ds=null});
  el.addEventListener('contextmenu',onCM)})}
function onClick(e){if(showOrig)return;if(pm){doPl(e);return}if(e.button!==0)return;
  const r=+e.currentTarget.dataset.r,c=+e.currentTarget.dataset.c,key=K(r,c);
  if(e.shiftKey&&lci){const[lr,lc]=lci.split(',').map(Number);for(let ri=Math.min(r,lr);ri<=Math.max(r,lr);ri++)for(let ci=Math.min(c,lc);ci<=Math.max(c,lc);ci++)sel.add(K(ri,ci))}
  else if(e.ctrlKey||e.metaKey||sm){sel.has(key)?sel.delete(key):sel.add(key)}else{sel.clear();sel.add(key)}
  lci=key;rSV();upSt();upIns()}
function rSV(){document.querySelectorAll('.c').forEach(el=>el.classList.toggle('sel',sel.has(K(+el.dataset.r,+el.dataset.c))))}
function onDS(e){if(pm||showOrig){e.preventDefault();return}ds={r:+e.currentTarget.dataset.r,c:+e.currentTarget.dataset.c};e.currentTarget.classList.add('drg');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain','')}
function onDr(e){e.preventDefault();e.currentTarget.classList.remove('dov');const r=+e.currentTarget.dataset.r,c=+e.currentTarget.dataset.c;if(!ds||(ds.r===r&&ds.c===c))return;doSw(ds.r,ds.c,r,c);ds=null}


function doSw(r1,c1,r2,c2){const a=gc(r1,c1),b=gc(r2,c2);
  H.push({t:'sw',r1,c1,r2,c2,a:JSON.parse(JSON.stringify(a)),b:JSON.parse(JSON.stringify(b))});
  const tA={},tB={};for(const k of KS){tA[k]=a[k];tB[k]=b[k]}for(const k of KS){a[k]=tB[k];b[k]=tA[k]}
  lg('<span class="fr">'+E(a.id)+'('+E(tA.f||'—')+')</span> ⇄ <span class="to">'+E(b.id)+'('+E(tB.f||'—')+')</span>');render()}
function doPl(e){if(!pm)return;const r=+e.currentTarget.dataset.r,c=+e.currentTarget.dataset.c,cell=gc(r,c);
  H.push({t:'pl',r,c,prev:JSON.parse(JSON.stringify(cell))});lg('🆕 '+E(pm.f)+' → '+E(cell.id));
  for(const k of KS)cell[k]=pm[k];exitPM()}
function exitPM(){pm=null;$('pb').classList.remove('on');render()}
function bCl(){if(!sel.size)return;const b=[];sel.forEach(k=>{const[r,c]=k.split(',').map(Number);b.push({r,c,p:JSON.parse(JSON.stringify(gc(r,c)))})});
  H.push({t:'bk',b});b.forEach(({r,c})=>{const cell=gc(r,c);cell.f='';cell.adv=null;cell.fl=false;cell.rt='Multi';cell.cat='EMPTY';cell.ro=''});lg('🗑 Cleared '+b.length);render()}
function bTg(){if(!sel.size)return;const b=[];sel.forEach(k=>{const[r,c]=k.split(',').map(Number);b.push({r,c,p:JSON.parse(JSON.stringify(gc(r,c)))})});
  H.push({t:'bk',b});b.forEach(({r,c})=>{const cell=gc(r,c);cell.fl=!cell.fl;cell.rt=cell.fl?'D2C':'Multi'});lg('🔄 Toggled '+b.length);render()}
function undo(){if(!H.length)return;const last=H.pop();const log=$('bp-log');if(log.firstChild)log.removeChild(log.firstChild);
  if(last.t==='sw'){for(const k of KS){G[last.r1].cells[last.c1][k]=last.a[k];G[last.r2].cells[last.c2][k]=last.b[k]}}
  else if(last.t==='pl'){const cell=gc(last.r,last.c);for(const k of KS)cell[k]=last.prev[k]}
  else if(last.t==='bk'){last.b.forEach(({r,c,p})=>{const cell=gc(r,c);for(const k of KS)cell[k]=p[k]})}render()}
function lg(h){const d=document.createElement('div');d.className='e';d.innerHTML=h;$('bp-log').insertBefore(d,$('bp-log').firstChild)}


function onCM(e){e.preventDefault();if(showOrig)return;const r=+e.currentTarget.dataset.r,c=+e.currentTarget.dataset.c,key=K(r,c);
  if(!sel.has(key)){sel.clear();sel.add(key);rSV();upSt();upIns()}
  const m=$('cm'),cell=gc(r,c);
  m.innerHTML='<div class="ci2" data-a="ins">🔍 Inspect</div><div class="ci2" data-a="sr">Select Row '+G[r].rn+'</div><div class="ci2" data-a="sl">Select Lane '+cell.ln+'</div><div class="ci2" data-a="sf">Select Same Filter</div><div class="cs"></div><div class="ci2" data-a="cl">Clear</div><div class="ci2" data-a="tg">Toggle Type</div><div class="ci2" data-a="st">Set Filter…</div><div class="cs"></div><div class="ci2" data-a="cp">Copy Filter</div><div class="ci2" data-a="an">Add Note…</div>';
  m.style.left=Math.min(e.clientX,innerWidth-180)+'px';m.style.top=Math.min(e.clientY,innerHeight-220)+'px';m.style.display='block';
  m.querySelectorAll('.ci2').forEach(i=>i.addEventListener('click',()=>{m.style.display='none';cAct(i.dataset.a,r,c)}))}
document.addEventListener('click',e=>{if(!e.target.closest('.cm'))$('cm').style.display='none'});
function cAct(a,r,c){const cell=gc(r,c);
  if(a==='ins'){sel.clear();sel.add(K(r,c));upIns();upSt();rSV();switchRP('inspect')}
  else if(a==='sr'){G[r].cells.forEach((_,ci)=>sel.add(K(r,ci)));rSV();upSt()}
  else if(a==='sl'){const l=cell.ln;G.forEach((row,ri)=>row.cells.forEach((cc,ci)=>{if(cc.ln===l)sel.add(K(ri,ci))}));rSV();upSt()}
  else if(a==='sf'){const f=cell.f;G.forEach((row,ri)=>row.cells.forEach((cc,ci)=>{if(cc.f===f)sel.add(K(ri,ci))}));rSV();upSt()}
  else if(a==='cl')bCl();else if(a==='tg')bTg();else if(a==='st')$('m2').classList.add('open');
  else if(a==='cp')navigator.clipboard.writeText(cell.f).catch(()=>{});
  else if(a==='an'){sel.clear();sel.add(K(r,c));rSV();upSt();upIns();switchRP('notes')}}
function switchRP(name){document.querySelectorAll('.rp-tab').forEach(t=>t.classList.toggle('on',t.dataset.rp===name));$('rp-inspect').style.display=name==='inspect'?'block':'none';$('rp-notes').style.display=name==='notes'?'block':'none'}
document.querySelectorAll('.rp-tab').forEach(t=>t.addEventListener('click',()=>switchRP(t.dataset.rp)));
document.querySelectorAll('.tabs .tab').forEach(t=>t.addEventListener('click',()=>{document.querySelectorAll('.tabs .tab').forEach(x=>x.classList.remove('on'));t.classList.add('on');document.querySelectorAll('.bp').forEach(p=>p.classList.remove('on'));$('bp-'+t.dataset.bp).classList.add('on')}));


$('ns2').addEventListener('click',()=>{if(sel.size!==1)return;const[r,c]=[...sel][0].split(',').map(Number);const val=$('nt2').value.trim();if(val)notes[K(r,c)]=val;else delete notes[K(r,c)];$('nsv').style.display='inline';setTimeout(()=>$('nsv').style.display='none',1500);render()});
$('btv').addEventListener('click',()=>{showOrig=!showOrig;render()});
function refreshScn(){const s=$('scn-sel');const cur=s.value;s.innerHTML='<option value="default">Current Draft</option>';for(const name of Object.keys(scenarios))s.innerHTML+='<option value="'+E(name)+'">'+E(name)+'</option>';s.value=cur}
refreshScn();
$('scn-save').addEventListener('click',()=>{$('sn').value='';$('m3').classList.add('open')});
$('sc1').addEventListener('click',()=>$('m3').classList.remove('open'));
$('sc2').addEventListener('click',()=>{const name=$('sn').value.trim();if(!name){alert('Enter name');return}scenarios[name]={grid:JSON.parse(JSON.stringify(G)),notes:JSON.parse(JSON.stringify(notes))};localStorage.setItem('tcy5-scenarios',JSON.stringify(scenarios));refreshScn();$('scn-sel').value=name;$('m3').classList.remove('open')});
$('scn-sel').addEventListener('change',()=>{const v=$('scn-sel').value;if(v==='default'){for(let r=0;r<OG.length;r++)for(let c=0;c<OG[r].cells.length;c++)Object.assign(G[r].cells[c],OG[r].cells[c]);notes={}}else if(scenarios[v]){for(let r=0;r<scenarios[v].grid.length;r++)for(let c=0;c<scenarios[v].grid[r].cells.length;c++)Object.assign(G[r].cells[c],scenarios[v].grid[r].cells[c]);notes=JSON.parse(JSON.stringify(scenarios[v].notes||{}))}H=[];sel.clear();render();upIns()});
$('scn-del').addEventListener('click',()=>{const v=$('scn-sel').value;if(v==='default')return;if(!confirm('Delete "'+v+'"?'))return;delete scenarios[v];localStorage.setItem('tcy5-scenarios',JSON.stringify(scenarios));$('scn-sel').value='default';refreshScn()});


$('bu').addEventListener('click',undo);
$('br2').addEventListener('click',()=>{if(!confirm('Reset?'))return;for(let r=0;r<OG.length;r++)for(let c=0;c<OG[r].cells.length;c++)Object.assign(G[r].cells[c],OG[r].cells[c]);H=[];sel.clear();notes={};$('bp-log').innerHTML='';render();upIns()});
$('bsm').addEventListener('click',()=>{sm=!sm;upSt()});
$('bsa').addEventListener('click',()=>{G.forEach((row,r)=>row.cells.forEach((_,c)=>sel.add(K(r,c))));rSV();upSt();upIns()});
$('bds').addEventListener('click',()=>{sel.clear();rSV();upSt();upIns()});
$('bcl').addEventListener('click',bCl);
$('btt').addEventListener('click',bTg);
$('bsf').addEventListener('click',()=>$('m2').classList.add('open'));
$('bzi').addEventListener('click',()=>{zm=Math.min(200,zm+10);render()});
$('bzo').addEventListener('click',()=>{zm=Math.max(50,zm-10);render()});
$('bex').addEventListener('click',()=>{const rows=[['Row','Lane','Chute','Filter','Type','ADV','Wave','Note','Changed']];G.forEach((row,ri)=>row.cells.forEach((cell,ci)=>rows.push([row.rn,cell.ln,cell.id,cell.f,cell.rt,cell.adv??'',row.wg,notes[K(ri,ci)]||'',isChanged(ri,ci)?'YES':''])));const csv=rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');const blob=new Blob([csv],{type:'text/csv'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='tcy5-layout-'+new Date().toISOString().slice(0,10)+'.csv';a.click()});
$('bal').addEventListener('click',()=>{$('nf').value='';$('na').value='';$('nty').value='Multi';$('nca').value='AMZL_NEW';$('m1').classList.add('open')});
$('mc1').addEventListener('click',()=>$('m1').classList.remove('open'));
$('mc2').addEventListener('click',()=>{const f=$('nf').value.trim();if(!f){alert('Enter filter');return}const adv=parseInt($('na').value)||0;const t=$('nty').value;const cat=$('nca').value;pm={f,adv,fl:t==='D2C',rt:t,cat,ro:f};$('m1').classList.remove('open');$('pb').classList.add('on');render()});
$('pb').addEventListener('click',exitPM);
$('bc1').addEventListener('click',()=>$('m2').classList.remove('open'));
$('bc2').addEventListener('click',()=>{const f=$('bf').value.trim();if(!f){alert('Enter filter');return}const adv=parseInt($('ba').value)||null;const cat=$('bc').value;const b=[];sel.forEach(k=>{const[r,c]=k.split(',').map(Number);b.push({r,c,p:JSON.parse(JSON.stringify(gc(r,c)))})});H.push({t:'bk',b});b.forEach(({r,c})=>{const cell=gc(r,c);cell.f=f;if(adv!=null)cell.adv=adv;cell.cat=cat;cell.ro=f});lg('✏️ Set "'+E(f)+'" on '+b.length);$('m2').classList.remove('open');render()});
$('si').addEventListener('input',e=>{st=e.target.value.trim().toLowerCase();render()});
document.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();undo()}else if((e.ctrlKey||e.metaKey)&&e.key==='a'){e.preventDefault();G.forEach((row,r)=>row.cells.forEach((_,c)=>sel.add(K(r,c))));rSV();upSt();upIns()}else if(e.key==='Escape'){sel.clear();exitPM();document.querySelectorAll('.mo').forEach(m=>m.classList.remove('open'));rSV();upSt();upIns()}else if(e.key==='Delete'||e.key==='Backspace'){if(sel.size)bCl()}else if(e.key==='s'&&!e.ctrlKey){sm=!sm;upSt()}});
render();
