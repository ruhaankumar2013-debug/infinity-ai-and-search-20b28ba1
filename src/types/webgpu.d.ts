// WebGPU type definitions for browser AI support
interface Navigator {
  gpu: GPU;
}

interface GPU {
  requestAdapter(options?: GPURequestAdapterOptions): Promise<GPUAdapter | null>;
}

interface GPURequestAdapterOptions {
  powerPreference?: 'low-power' | 'high-performance';
}

interface GPUAdapter {
  readonly features: any;
  readonly limits: any;
  readonly isFallbackAdapter: boolean;
}
