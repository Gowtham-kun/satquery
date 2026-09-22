const{chromium}=require("playwright");

const WEST_COAST=[
[23.0,68.5],[22.5,69.5],[21.5,69.5],[20.8,70.4],[20.7,72.0],
[19.0,72.8],[18.5,73.0],[16.0,73.5],[15.5,73.8],[14.5,74.3],
[13.0,74.8],[11.5,75.8],[10.0,76.2],[8.5,76.9],[8.08,77.55]
];
const EAST_COAST=[
[8.08,77.55],[8.8,78.1],[9.3,79.1],[10.3,79.8],[10.8,79.85],
[11.9,79.8],[13.1,80.3],[14.5,80.1],[15.8,80.3],[16.2,81.2],
[16.95,82.25],[17.7,83.3],[18.3,84.0],[19.3,85.0],[19.8,85.8],
[20.3,86.7],[21.5,87.0],[21.8,88.2],[22.0,89.0]
];

function haversineKm(lat1,lon1,lat2,lon2){
const R=6371.0;
const dLat=(lat2-lat1)*Math.PI/180;
const dLon=(lon2-lon1)*Math.PI/180;
const a=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
return 2*R*Math.asin(Math.sqrt(a));
}

function analyzeMarineStatus(lat,lon,elev){
let minW=Infinity,minE=Infinity;
for(const[clat,clon]of WEST_COAST){
const d=haversineKm(lat,lon,clat,clon);
if(d<minW)minW=d;
}
for(const[clat,clon]of EAST_COAST){
const d=haversineKm(lat,lon,clat,clon);
if(d<minE)minE=d;
}
if(minW<=45&&(elev===null||elev<=60)){
return{is_coastal:true,sea:"Arabian Sea",summary:`Coastal area directly bordering the Arabian Sea (${Math.round(minW)} km from shoreline)`};
}
if(minE<=45&&(elev===null||elev<=60)){
return{is_coastal:true,sea:"Bay of Bengal",summary:`Coastal area directly bordering the Bay of Bengal (${Math.round(minE)} km from shoreline)`};
}
const nearestSea=minE<minW?"Bay of Bengal":"Arabian Sea";
const dist=Math.round(Math.min(minE,minW));
return{
is_coastal:false,
sea:null,
summary:`Inland landlocked region with NO oceans or seas (${dist} km from nearest ocean, ${nearestSea}; Bay of Bengal is ~${Math.round(minE)} km away, Arabian Sea is ~${Math.round(minW)} km away)`
};
}

async function scrapeGeographicContext(minLon,minLat,maxLon,maxLat){
const centerLat=(minLat+maxLat)/2;
const centerLon=(minLon+maxLon)/2;
let nominatimData=null;
let elevationData=null;

try{
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({userAgent:"SatQueryAI-GeospatialScraper/1.0"});
const page=await context.newPage();
try{
const geoUrl=`https://nominatim.openstreetmap.org/reverse?format=json&lat=${centerLat.toFixed(5)}&lon=${centerLon.toFixed(5)}&zoom=10&addressdetails=1`;
await page.goto(geoUrl,{waitUntil:"domcontentloaded",timeout:12000});
nominatimData=JSON.parse(await page.textContent("body"));
}catch(e){}
try{
const elevUrl=`https://api.open-meteo.com/v1/elevation?latitude=${centerLat.toFixed(4)}&longitude=${centerLon.toFixed(4)}`;
await page.goto(elevUrl,{waitUntil:"domcontentloaded",timeout:12000});
elevationData=JSON.parse(await page.textContent("body"));
}catch(e){}
await browser.close();
}catch(err){}

const address=nominatimData?.address||{};
const elevation=elevationData?.elevation?elevationData.elevation[0]:45.0;
const city=address.city||address.town||address.village||address.county||address.state_district||"Regional District";
const state=address.state||address.region||"Regional State";
const country=address.country||"India";
const displayName=nominatimData?.display_name||`${city}, ${state}, ${country}`;

const marine=analyzeMarineStatus(centerLat,centerLon,elevation);
const waterBodies=[];
if(marine.is_coastal){
waterBodies.push(marine.sea);
}else{
waterBodies.push(`Inland drainage networks (No oceans or seas in this inland location)`);
if(centerLat>=17.0&&centerLat<=17.6&&centerLon>=78.2&&centerLon<=78.7){
waterBodies.push("Musi River, Hussain Sagar Lake, Osman Sagar, Himayat Sagar");
}else if(centerLat>=15.5&&centerLat<=17.5&&centerLon>=78.0&&centerLon<=81.0){
waterBodies.push("Krishna River Basin inland drainage");
}else if(centerLat>=18.0&&centerLat<=20.0&&centerLon>=79.0&&centerLon<=81.0){
waterBodies.push("Godavari River Basin inland tributaries");
}
}

let terrainProfile="Lowland plain";
if(elevation<20){
terrainProfile=marine.is_coastal?"Coastal shoreline / estuarine delta (<20m elevation)":"Low-lying inland river plain (<20m elevation)";
}else if(elevation<200){
terrainProfile="Alluvial agricultural river valley (20m - 200m elevation)";
}else if(elevation<700){
terrainProfile="Elevated plateau / peninsular tableland (Deccan Plateau, 200m - 700m elevation)";
}else{
terrainProfile="Elevated mountainous / hilly terrain (>700m elevation)";
}

return{
bbox:[minLon,minLat,maxLon,maxLat],
center:[centerLon,centerLat],
city,
state,
country,
display_name:displayName,
elevation_meters:elevation,
is_coastal:marine.is_coastal,
coastal_sea:marine.sea,
coastal_summary:marine.summary,
terrain_profile:terrainProfile,
nearby_water_bodies:waterBodies,
osm_type:nominatimData?.osm_type||"N/A"
};
}

(async()=>{
const args=process.argv.slice(2);
const minLon=parseFloat(args[0])||81.5;
const minLat=parseFloat(args[1])||16.5;
const maxLon=parseFloat(args[2])||82.5;
const maxLat=parseFloat(args[3])||17.5;
const result=await scrapeGeographicContext(minLon,minLat,maxLon,maxLat);
process.stdout.write(JSON.stringify(result));
})();
