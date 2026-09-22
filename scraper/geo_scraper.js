const { chromium } = require("playwright");

async function scrapeGeographicContext(minLon, minLat, maxLon, maxLat) {
  const centerLat = (minLat + maxLat) / 2;
  const centerLon = (minLon + maxLon) / 2;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "SatQueryAI-GeospatialScraper/1.0 (EarthObservation Research)"
  });
  const page = await context.newPage();

  let nominatimData = null;
  let elevationData = null;

  try {
    const geoUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${centerLat.toFixed(5)}&lon=${centerLon.toFixed(5)}&zoom=10&addressdetails=1`;
    await page.goto(geoUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    const content = await page.textContent("body");
    nominatimData = JSON.parse(content);
  } catch (err) {}

  try {
    const elevUrl = `https://api.open-meteo.com/v1/elevation?latitude=${centerLat.toFixed(4)}&longitude=${centerLon.toFixed(4)}`;
    await page.goto(elevUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    const elevContent = await page.textContent("body");
    elevationData = JSON.parse(elevContent);
  } catch (err) {}

  await browser.close();

  const address = nominatimData?.address || {};
  const elevation = elevationData?.elevation ? elevationData.elevation[0] : null;

  const city = address.city || address.town || address.village || address.county || "Unknown District";
  const state = address.state || address.region || "Unknown State";
  const country = address.country || "Unknown Country";
  const displayName = nominatimData?.display_name || `${city}, ${state}, ${country}`;

  const waterBodies = [];
  if (centerLon >= 79.5 && centerLon <= 95.0 && centerLat >= 5.0 && centerLat <= 22.5) {
    waterBodies.push("Bay of Bengal");
  }
  if (centerLon >= 65.0 && centerLon <= 78.0 && centerLat >= 7.0 && centerLat <= 25.0) {
    waterBodies.push("Arabian Sea");
  }
  if (centerLat <= 6.0 && centerLon >= 65.0 && centerLon <= 95.0) {
    waterBodies.push("Indian Ocean");
  }
  if (centerLat >= 16.0 && centerLat <= 19.5 && centerLon >= 79.0 && centerLon <= 83.0) {
    waterBodies.push("Godavari River Basin");
  }
  if (centerLat >= 15.0 && centerLat <= 17.5 && centerLon >= 78.0 && centerLon <= 81.5) {
    waterBodies.push("Krishna River Basin");
  }
  if (centerLat >= 24.0 && centerLat <= 27.5 && centerLon >= 78.0 && centerLon <= 90.0) {
    waterBodies.push("Ganges River Basin");
  }

  let terrainProfile = "Lowland coastal or riverine plain";
  if (elevation !== null) {
    if (elevation < 20) {
      terrainProfile = "Low-lying coastal wetland / delta (< 20m elevation, susceptible to storm surges and drainage congestion)";
    } else if (elevation < 200) {
      terrainProfile = "Flat alluvial agricultural plains (20m - 200m elevation)";
    } else if (elevation < 600) {
      terrainProfile = "Undulating plateau / peninsular tableland (200m - 600m elevation)";
    } else {
      terrainProfile = "Elevated hilly / mountainous terrain (> 600m elevation)";
    }
  }

  return {
    bbox: [minLon, minLat, maxLon, maxLat],
    center: [centerLon, centerLat],
    city,
    state,
    country,
    display_name: displayName,
    elevation_meters: elevation,
    terrain_profile: terrainProfile,
    nearby_water_bodies: waterBodies.length > 0 ? waterBodies : ["Local rivers and drainage channels"],
    osm_type: nominatimData?.osm_type || "N/A"
  };
}

(async () => {
  const args = process.argv.slice(2);
  const minLon = parseFloat(args[0]) || 81.5;
  const minLat = parseFloat(args[1]) || 16.5;
  const maxLon = parseFloat(args[2]) || 82.5;
  const maxLat = parseFloat(args[3]) || 17.5;
  const result = await scrapeGeographicContext(minLon, minLat, maxLon, maxLat);
  process.stdout.write(JSON.stringify(result));
})();
