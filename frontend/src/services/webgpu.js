import { buildComprehensiveVlmPrompt } from './vlmVisionEngine.js';

let cachedPipeline = null;
let isInitializing = false;

export async function checkWebGPUCompatibility() {
  if (typeof navigator === 'undefined' || !('gpu' in navigator) || !navigator.gpu) {
    return { isCompatible: false, reason: "WebGPU is not supported by your browser or OS. Please use Google Chrome, Microsoft Edge, or a WebGPU-enabled browser." };
  }
  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) {
      return { isCompatible: false, reason: "No compatible GPU adapter found. Hardware graphics acceleration may be disabled in your browser settings (Settings > System > Use graphics acceleration when available)." };
    }
    if (adapter.isFallbackAdapter) {
      return { isCompatible: false, reason: "A software fallback adapter was detected instead of a physical hardware GPU. SatQuery AI requires a dedicated or integrated hardware GPU." };
    }
    let info = { vendor: 'Detected GPU', architecture: 'Hardware Accelerated', device: 'WebGPU Device', description: '' };
    if (adapter.info) {
      info = { vendor: adapter.info.vendor || 'Detected GPU', architecture: adapter.info.architecture || '', device: adapter.info.device || 'Hardware Accelerator', description: adapter.info.description || '' };
    } else if (typeof adapter.requestAdapterInfo === 'function') {
      const raw = await adapter.requestAdapterInfo();
      info = { vendor: raw.vendor || 'Detected GPU', architecture: raw.architecture || '', device: raw.device || 'Hardware Accelerator', description: raw.description || '' };
    }
    const device = await adapter.requestDevice();
    if (!device) {
      return { isCompatible: false, reason: "Failed to allocate WebGPU device context on your GPU." };
    }
    device.destroy();
    return { isCompatible: true, gpuInfo: info };
  } catch (err) {
    return { isCompatible: false, reason: "GPU initialization check failed: " + (err?.message || String(err)) };
  }
}

export async function getClientGPUPipeline(onProgress) {
  if (cachedPipeline) return cachedPipeline;
  if (isInitializing) {
    while (isInitializing) {
      await new Promise(r => setTimeout(r, 200));
    }
    if (cachedPipeline) return cachedPipeline;
  }
  isInitializing = true;
  try {
    const { pipeline, env } = await import('@huggingface/transformers');
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    cachedPipeline = await pipeline('text-generation', 'onnx-community/Qwen2.5-0.5B-Instruct', {
      device: 'webgpu',
      dtype: 'q4',
      progress_callback: onProgress
    });
    return cachedPipeline;
  } finally {
    isInitializing = false;
  }
}

export async function generateOnClientGPU(systemPrompt, userPrompt, onProgress) {
  const generator = await getClientGPUPipeline(onProgress);
  const prompt = `<|im_start|>system\n${systemPrompt}<|im_end|>\n<|im_start|>user\n${userPrompt}<|im_end|>\n<|im_start|>assistant\n`;
  const output = await generator(prompt, {
    max_new_tokens: 280,
    temperature: 0.15,
    do_sample: false,
    repetition_penalty: 1.15,
    return_full_text: false
  });
  let text = '';
  if (Array.isArray(output) && output[0]?.generated_text) {
    text = output[0].generated_text;
  } else if (typeof output === 'string') {
    text = output;
  }
  return text.replace(/<\|im_end\|>/g, '').trim();
}

export async function runVlmInference({ geoContext, opticalAnalysis, sarAnalysis, opticalScene, sarScene, bbox, userQuery, onProgress }) {
  const { systemPrompt, city, state, country, bboxStr, marineTruth, floodRisk, optDesc, sarDesc } = buildComprehensiveVlmPrompt(
    geoContext,
    opticalAnalysis,
    sarAnalysis,
    opticalScene,
    sarScene,
    bbox,
    userQuery
  );

  try {
    const response = await generateOnClientGPU(systemPrompt, userQuery, onProgress);
    if (response && response.length > 15) {
      return { text: response, source: 'webgpu_vlm' };
    }
  } catch (err) {
    console.warn('WebGPU inference fallback:', err);
  }

  const q = userQuery.toLowerCase();
  let fallback = '';
  if (q.includes('city') || q.includes('location') || q.includes('where') || q.includes('select')) {
    fallback = `You have selected ${city}, ${state} (${country}) at coordinates ${bboxStr}. The terrain lies at an elevation of ~${Math.round(geoContext?.elevation_meters || 0)}m above sea level. ${marineTruth} Both Sentinel-2 optical imagery and Sentinel-1 SAR radio wave radar passes have been fused for this bounding box.`;
  } else if (q.includes('ocean') || q.includes('sea') || q.includes('coast') || q.includes('beach') || q.includes('marine')) {
    fallback = `${marineTruth} Elevation for this bounding box is ~${Math.round(geoContext?.elevation_meters || 0)} meters.`;
  } else if (q.includes('flood') || q.includes('water') || q.includes('rain') || q.includes('drain')) {
    fallback = `Inundation assessment for ${city}, ${state}: Current radar flood risk is evaluated as ${floodRisk}. Sentinel-1 C-band SAR radar backscatter indicates specular smooth water reflectance across ${sarAnalysis?.specularPct ?? 0}% of the scene, while Sentinel-2 optical bands show ${optDesc}.`;
  } else if (q.includes('vegetation') || q.includes('crop') || q.includes('forest') || q.includes('green') || q.includes('tree')) {
    fallback = `Vegetation analysis for ${city}, ${state}: Optical bands (B04 Red, B03 Green, B02 Blue) detect approximately ${opticalAnalysis?.vegPct ?? 0}% active vegetative canopy cover. Sentinel-1 SAR cross-polarization (VH) confirms volumetric microwave scattering consistent with ${geoContext?.terrain_profile || 'local topography'}.`;
  } else {
    fallback = `Analysis for ${city}, ${state} (${bboxStr}): ${marineTruth} Optical Sentinel-2 sensors observe: ${optDesc} Sentinel-1 C-band radar reveals: ${sarDesc}`;
  }

  return { text: fallback, source: 'geospatial_sensor_synthesis' };
}
