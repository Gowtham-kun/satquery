import { runVlmInference, getClientGPUPipeline } from '../services/webgpu.js';

self.onmessage = async (e) => {
  const { id, type, payload } = e.data || {};
  if (type === 'init') {
    try {
      await getClientGPUPipeline((progress) => {
        self.postMessage({ id, type: 'progress', progress });
      });
      self.postMessage({ id, type: 'init_done', success: true });
    } catch (err) {
      self.postMessage({ id, type: 'init_done', success: false, error: err.message });
    }
  } else if (type === 'infer') {
    try {
      const res = await runVlmInference({
        ...payload,
        onProgress: (progress) => {
          self.postMessage({ id, type: 'progress', progress });
        }
      });
      self.postMessage({ id, type: 'result', data: res });
    } catch (err) {
      self.postMessage({ id, type: 'error', error: err.message });
    }
  }
};
