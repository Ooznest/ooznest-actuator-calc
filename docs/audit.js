const page=document.body.dataset.page;
const definitions={
  motors:{file:'motors.json',title:'Motor data audit',description:'Electrical and holding-torque values used by the 24 V stepper-drive estimate.',source:'Ooznest Resources › System Control › Stepper Motors, then each motor product Specifications tab. Values were manually transcribed into motors.json.',fields:[['id','Data identifier'],['name','Customer-facing label'],['torque','Holding torque (kg-cm)'],['current','Rated phase current (A)'],['resistance','Phase resistance (Ω)'],['inductance','Phase inductance (mH)'],['voltage','Rated phase voltage (V)'],['steps','Full steps/rev']],caveat:'Holding torque is not running torque. The calculator derives running torque using its conservative, unmeasured torque-speed model.'},
  actuators:{file:'transmission.json',title:'Actuator / drive-system data audit',description:'Lead, mechanical efficiency and friction inputs used to convert motor torque into carriage force.',source:'Lead comes from actuator transmission geometry. Mechanical efficiency and friction are calculator assumptions recorded in transmission.json; no external test source is currently linked for them.',fields:[['id','Data identifier'],['name','Actuator product family'],['type','Drive type'],['lead','Travel per revolution (mm/rev)'],['efficiency','Mechanical efficiency'],['friction','Rolling / drive friction coefficient']],caveat:'Mechanical efficiency is an unverified model assumption: 0.95 for belt drives, 0.42 for standard TR8×8 screw drives and 0.38 for compact C-Beam screw drives. It should be replaced with measured or supplier-supported data when available.'},
  gantries:{file:'gantryplates.json',title:'Gantry plate data audit',description:'Published plate-assembly ratings and recovered pre-factor ratings used by the calculator. Wheel-level fields are not added because published plate ratings already include the wheel calculation.',source:'Ooznest gantry-plate specification tabs. Every entry records a direct product URL plus its website-published figure and recovered figure (published × 3).',fields:[['id','Data identifier'],['name','Plate'],['mass','Plate mass (kg)'],['publishedSafetyFactor','Published FOS'],['published.radialStaticN','Published radial static (N)'],['actual.radialStaticN','Recovered radial static (N)'],['published.axialStaticNByRailMm','Published axial static by rail width (N)'],['actual.axialStaticNByRailMm','Recovered axial static by rail width (N)'],['published.myStaticNm','Published My (Nm)'],['actual.myStaticNm','Recovered My (Nm)'],['published.mzStaticNm','Published Mz (Nm)'],['actual.mzStaticNm','Recovered Mz (Nm)'],['sourceUrl','Source page']],caveat:'The calculator divides recovered actual ratings by the user-selected FOS. Plate direction selects radial or axial capacity; axial values depend on the selected rail width.'},
  skus:{file:'sku-source.json',title:'Actuator SKU source audit',description:'One auditable product record per stock-system SKU, including display name, calculator mapping and starter requirements.',source:'Attached Plytix export: plytix_export (4).csv. The source records the export filename, retrieval date, row count and explicit per-SKU product records.',fields:[['sku','Stock SKU'],['displayName','Display name'],['family','Family'],['status','Calculator status'],['defaults.load','Default load (kg)'],['defaults.speed','Default speed (mm/min)']],caveat:'Calculator mappings and starter requirements are explicit per SKU. Users can override the starter load and speed; beam deflection remains outside the calculator.'}
};
const cfg=definitions[page];
const valueAt=(object,path)=>path.split('.').reduce((value,key)=>value?.[key],object);
const cell=(value,key)=>{if(value===undefined||value===null)return'—';if(key==='sourceUrl')return`<a href="${value}" target="_blank" rel="noreferrer">Source page</a>`;return typeof value==='object'?Object.entries(value).map(([width,rating])=>`${width} mm: ${rating}`).join('<br>'):String(value)};
async function render(){
  document.title=`Actuator Calculator — ${cfg.title}`;
  document.querySelector('h1').textContent=cfg.title;
  document.querySelector('#description').textContent=cfg.description;
  document.querySelector('#source').textContent=cfg.source;
  document.querySelector('#caveat').textContent=cfg.caveat;
  const rows=await fetch(`${cfg.file}?audit=1`,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(`${r.status} ${r.statusText}`);return r.json()});
  document.querySelector('#headers').innerHTML=cfg.fields.map(([,label])=>`<th>${label}</th>`).join('');
  if(page==='skus'){
    const products=Object.values(rows.products||{});
    document.querySelector('#count').textContent=`${products.length} product records loaded live from ${cfg.file}; source export row count: ${rows.source.rowCount}`;
    document.querySelector('#rows').innerHTML=products.map(row=>`<tr>${cfg.fields.map(([key])=>`<td>${cell(valueAt(row,key),key)}</td>`).join('')}</tr>`).join('');
    return;
  }
  document.querySelector('#count').textContent=`${rows.length} records loaded live from ${cfg.file}`;
  document.querySelector('#rows').innerHTML=rows.map(row=>`<tr>${cfg.fields.map(([key])=>`<td>${cell(valueAt(row,key),key)}</td>`).join('')}</tr>`).join('');
}
render().catch(error=>{document.querySelector('#count').textContent=`Could not load audit data: ${error.message}`;document.querySelector('#count').className='issue card'});
