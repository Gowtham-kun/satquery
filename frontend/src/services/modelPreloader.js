import { getClientGPUPipeline } from './webgpu.js';

let state = {
  status: 'idle',
  progress: 0,
  stage: 'Standby',
  error: null
};

let pipelinePromise = null;
const listeners = new Set();

function notify() {
  const snapshot = { ...state };
  listeners.forEach(cb => {
    try { cb(snapshot); } catch (_) {}
  });
}

export function getModelPreloadState() {
  return { ...state };
}

export function subscribeModelPreload(cb) {
  listeners.add(cb);
  cb({ ...state });
  return () => listeners.delete(cb);
}

export function startPreload() {
  if (pipelinePromise || state.status === 'ready' || state.status === 'loading') {
    return pipelinePromise;
  }

  state = { status: 'loading', progress: 0, stage: 'Initializing WebGPU shader compiler...', error: null };
  notify();

  pipelinePromise = (async () => {
    try {
      const pipeline = await getClientGPUPipeline((p) => {
        if (!p) return;
        if (p.status === 'initiate') {
          state.stage = `Connecting model weights (${p.file || 'ONNX'})...`;
          notify();
        } else if (p.status === 'progress' && p.total) {
          const pct = Math.min(99, Math.round((p.loaded / p.total) * 100));
          state.progress = pct;
          state.stage = `Downloading WebGPU Q4 weights: ${pct}%`;
          notify();
        } else if (p.status === 'done') {
          state.stage = 'Validating neural tensor graph...';
          notify();
        } else if (p.status === 'ready') {
          state.progress = 100;
          state.stage = 'Compiling WebGPU pipeline...';
          notify();
        }
      });

      state = {
        status: 'ready',
        progress: 100,
        stage: 'VLM Ready (WebGPU)',
        error: null
      };
      notify();
      return pipeline;
    } catch (err) {
      console.error('Model eager preload error:', err);
      state = {
        status: 'error',
        progress: 0,
        stage: 'Model Preload Failed',
        error: err?.message || String(err)
      };
      notify();
      pipelinePromise = null;
      throw err;
    }
  })();

  return pipelinePromise;
}

export async function waitForModel() {
  if (state.status === 'ready') return true;
  if (!pipelinePromise) {
    startPreload();
  }
  try {
    await pipelinePromise;
    return true;
  } catch (err) {
    return false;
  }
}
