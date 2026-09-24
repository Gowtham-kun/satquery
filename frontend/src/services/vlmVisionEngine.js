export function analyzeOpticalCanvas(canvas) {
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const total = w * h;
  let vegCount = 0;
  let waterCount = 0;
  let urbanCount = 0;
  let cloudCount = 0;
  let rSum = 0, gSum = 0, bSum = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    rSum += r;
    gSum += g;
    bSum += b;
    const brightness = (r + g + b) / 3;
    if (g > r * 1.12 && g > b * 1.05 && brightness > 40 && brightness < 200) {
      vegCount++;
    } else if (r < 55 && g < 70 && b > r && brightness < 80) {
      waterCount++;
    } else if (brightness > 225 && Math.abs(r - g) < 20 && Math.abs(g - b) < 20) {
      cloudCount++;
    } else if (brightness > 110 && Math.abs(r - g) < 25 && Math.abs(g - b) < 25) {
      urbanCount++;
    }
  }

  const vegPct = Math.round((vegCount / total) * 100);
  const waterPct = Math.round((waterCount / total) * 100);
  const urbanPct = Math.round((urbanCount / total) * 100);
  const cloudPct = Math.round((cloudCount / total) * 100);
  const meanR = Math.round(rSum / total);
  const meanG = Math.round(gSum / total);
  const meanB = Math.round(bSum / total);

  let visualSummary = `Optical RGB composite indicates ${vegPct}% vegetation cover, ${urbanPct}% built-up/bare soil, and ${waterPct}% open water bodies.`;
  if (cloudPct > 15) visualSummary += ` Cloud obscuration is approximately ${cloudPct}%.`;
  if (vegPct > 45) visualSummary += ` Heavy agricultural/forest green reflectance dominates the scene.`;
  else if (urbanPct > 40) visualSummary += ` High density of urban built structures and impervious surfaces visible.`;

  return {
    vegPct,
    waterPct,
    urbanPct,
    cloudPct,
    meanR,
    meanG,
    meanB,
    visualSummary
  };
}

export function analyzeSarCanvas(canvas) {
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const total = w * h;
  let specularCount = 0;
  let doubleBounceCount = 0;
  let volumeCount = 0;
  let vvNormSum = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    vvNormSum += r;
    if (r < 50 && g < 50) {
      specularCount++;
    } else if (r > 190 || g > 180) {
      doubleBounceCount++;
    } else if (g > 90) {
      volumeCount++;
    }
  }

  const specularPct = Math.round((specularCount / total) * 100);
  const urbanRoughPct = Math.round((doubleBounceCount / total) * 100);
  const volumeScatteringPct = Math.round((volumeCount / total) * 100);
  const avgVVNorm = vvNormSum / (total * 255);
  const estimatedMeanDb = Math.round(-25.0 + (avgVVNorm * 25.0));

  let radarSummary = `Sentinel-1 C-band radar: Mean backscatter ~${estimatedMeanDb} dB. Specular reflection (smooth surfaces/standing water) covers ${specularPct}% of area. Double-bounce radar returns (structures/rough terrain) cover ${urbanRoughPct}%.`;
  let floodRisk = 'LOW';
  if (specularPct > 18) {
    floodRisk = 'HIGH';
    radarSummary += ` Significant low-backscatter dark radar patches suggest standing water inundation or extensive surface water retention.`;
  } else if (specularPct > 7) {
    floodRisk = 'MODERATE';
    radarSummary += ` Moderate surface water signatures detected in drainage corridors.`;
  } else {
    radarSummary += ` Low specular backscatter indicates dry to well-drained terrain with minimal active flooding.`;
  }

  return {
    specularPct,
    urbanRoughPct,
    volumeScatteringPct,
    estimatedMeanDb,
    floodRisk,
    radarSummary
  };
}

export function buildComprehensiveVlmPrompt(geoContext, opticalAnalysis, sarAnalysis, opticalScene, sarScene, bbox, userQuery) {
  const city = geoContext?.city || "Selected Location";
  const state = geoContext?.state || "";
  const country = geoContext?.country || "India";
  const elevation = Math.round(geoContext?.elevation_meters || 0);
  const isCoastal = Boolean(geoContext?.is_coastal);
  const coastalSea = geoContext?.coastal_sea || "None";
  const coastalSummary = geoContext?.coastal_summary || (isCoastal ? `Coastal region on ${coastalSea}` : "Inland landlocked region with NO oceans or seas");
  const waterBodies = geoContext?.nearby_water_bodies?.join(", ") || "Local drainage channels";
  const terrain = geoContext?.terrain_profile || "Plateau/Plains";

  const marineTruth = isCoastal
    ? `Yes, ${city} directly borders the ${coastalSea} (${coastalSummary}).`
    : `No, ${city} is an inland landlocked city and does NOT border any oceans or seas. It is located ${coastalSummary}.`;

  const optId = opticalScene?.scene_id || "Sentinel-2 MSI Level-2A";
  const optDate = opticalScene?.datetime ? opticalScene.datetime.split('T')[0] : "Recent Pass";
  const optCloud = opticalScene?.cloud_cover !== undefined ? opticalScene.cloud_cover.toFixed(1) : "0.0";
  const optDesc = opticalAnalysis?.visualSummary || "Optical multispectral reflectance data loaded.";

  const sarId = sarScene?.scene_id || "Sentinel-1 C-Band GRD";
  const sarDate = sarScene?.datetime ? sarScene.datetime.split('T')[0] : "Recent Pass";
  const sarPols = sarScene?.polarizations?.join(", ") || "VV, VH";
  const sarDesc = sarAnalysis?.radarSummary || "SAR microwave backscatter data loaded.";
  const floodRisk = sarAnalysis?.floodRisk || "LOW";

  const bboxStr = `[${bbox[0].toFixed(3)}°E, ${bbox[1].toFixed(3)}°N] to [${bbox[2].toFixed(3)}°E, ${bbox[3].toFixed(3)}°N]`;

  const systemPrompt = `You are SatQuery AI (SIH Problem Statement 167), an expert Earth Observation Vision-Language assistant combining real Sentinel-2 Optical satellite imagery and Sentinel-1 SAR radio wave radar.

GROUND TRUTH OF THE SELECTED REGION (MUST FOLLOW STRICTLY):
- Selected Place: ${city}, ${state} (${country})
- Bounding Box: ${bboxStr}
- Terrain & Elevation: ${terrain} (~${elevation} meters above sea level)
- Marine / Ocean / Coastal Reality: ${marineTruth}
- Nearby Water Bodies: ${waterBodies}

REAL SATELLITE VISION SENSOR DATA:
1. OPTICAL (Sentinel-2 L2A - True Color Bands B04/B03/B02, 10m res):
   - Scene: ${optId} (Acquired: ${optDate}, Cloud Cover: ${optCloud}%)
   - Live Pixel Analysis: ${optDesc}
   - Land Cover Composition: ${opticalAnalysis?.vegPct ?? 0}% vegetation, ${opticalAnalysis?.urbanPct ?? 0}% built-up, ${opticalAnalysis?.waterPct ?? 0}% water bodies.

2. SAR MICROWAVE RADAR (Sentinel-1 C-Band Synthetic Aperture Radar - ${sarPols}):
   - Scene: ${sarId} (Acquired: ${sarDate})
   - Live Backscatter Analysis: ${sarDesc}
   - Inundation / Flood Risk: ${floodRisk} (Specular water return: ${sarAnalysis?.specularPct ?? 0}%, Mean backscatter: ${sarAnalysis?.estimatedMeanDb ?? -15} dB).

STRICT DIRECTIVES:
1. If asked what city or area was selected, IMMEDIATELY state: "You have selected ${city}, ${state} (${country}) at coordinates ${bboxStr}."
2. If asked about oceans, seas, or coastlines, adhere to: "${marineTruth}". NEVER state that inland cities (like Hyderabad, Delhi, Bangalore) have an ocean.
3. Explicitly weave in both the Optical visual pixels (what is seen visually) and the SAR radio wave radar (surface roughness, microwave backscatter, all-weather penetration).
4. Speak conversationally, with technical geospatial accuracy. Do not output raw JSON.`;

  return {
    systemPrompt,
    city,
    state,
    country,
    bboxStr,
    elevation,
    isCoastal,
    marineTruth,
    floodRisk,
    optDesc,
    sarDesc
  };
}
