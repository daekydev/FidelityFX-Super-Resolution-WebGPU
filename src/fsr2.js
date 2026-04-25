import opticalFlowCode from './optical_flow.wgsl?raw';
import fsrTemporalCode from './fsr_temporal.wgsl?raw';
import easuCode from './fsr_easu.wgsl?raw';
import rcasCode from './fsr_rcas.wgsl?raw';


export async function setupFSR2WebGPU(videoElement, canvasElement) {
  if (!navigator.gpu) {
    throw new Error('WebGPU is not supported by your browser.');
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('Failed to get GPU adapter.');

  const device = await adapter.requestDevice();
  const context = canvasElement.getContext('webgpu');
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

  const renderWidth = 1920;
  const renderHeight = 1080;
  const outputWidth = 3840;
  const outputHeight = 2160;

  canvasElement.width = outputWidth;
  canvasElement.height = outputHeight;

  context.configure({
    device,
    format: presentationFormat,
    alphaMode: 'premultiplied',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST,
  });

  const opticalFlowShader = device.createShaderModule({ code: opticalFlowCode });
  const fsrTemporalShader = device.createShaderModule({ code: fsrTemporalCode });

  const samplerInfo = {
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  };
  const smp = device.createSampler(samplerInfo);

  // Textures for Optical Flow and Temporal Accumulation
  let previousFrameTex = device.createTexture({
    size: [renderWidth, renderHeight, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });

  const motionVectorTex = device.createTexture({
    size: [renderWidth, renderHeight, 1],
    format: 'rgba16float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });

  let intermediateUpscaledTex = device.createTexture({
    size: [outputWidth, outputHeight, 1],
    format: presentationFormat,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
  });

  let historyFrameTex = device.createTexture({
    size: [renderWidth, renderHeight, 1],
    format: presentationFormat,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC,
  });

  const vertices = new Float32Array([
    -1.0, -1.0, 0.0,         0.0, 1.0,
     1.0, -1.0, 0.0,         1.0, 1.0,
    -1.0,  1.0, 0.0,         0.0, 0.0,

     1.0, -1.0, 0.0,         1.0, 1.0,
     1.0,  1.0, 0.0,         1.0, 0.0,
    -1.0,  1.0, 0.0,         0.0, 0.0,
  ]);

  const vertexBuffer = device.createBuffer({
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(vertexBuffer, 0, vertices);

  const vertexBufferLayout = {
    arrayStride: 20,
    attributes: [
      { format: 'float32x3', offset: 0, shaderLocation: 0 },
      { format: 'float32x2', offset: 12, shaderLocation: 1 },
    ],
  };

  const opticalFlowPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: opticalFlowShader, entryPoint: 'vs_main', buffers: [vertexBufferLayout] },
    fragment: { module: opticalFlowShader, entryPoint: 'fs_main', targets: [{ format: 'rgba16float' }] },
    primitive: { topology: 'triangle-list' },
  });

  const fsrTemporalPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: fsrTemporalShader, entryPoint: 'vs_main', buffers: [vertexBufferLayout] },
    fragment: { module: fsrTemporalShader, entryPoint: 'fs_main', targets: [{ format: presentationFormat }] },
    primitive: { topology: 'triangle-list' },
  });

    const easuShader = device.createShaderModule({ code: easuCode });
  const rcasShader = device.createShaderModule({ code: rcasCode });

  const resolutionBuffer = device.createBuffer({
    size: 4 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  device.queue.writeBuffer(
    resolutionBuffer,
    0,
    new Float32Array([renderWidth, renderHeight, outputWidth, outputHeight])
  );

  const easuPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: easuShader, entryPoint: 'vs_main', buffers: [vertexBufferLayout] },
    fragment: { module: easuShader, entryPoint: 'fs_main', targets: [{ format: 'rgba16float' }] },
    primitive: { topology: 'triangle-list' },
  });

  const rcasPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: rcasShader, entryPoint: 'vs_main', buffers: [vertexBufferLayout] },
    fragment: { module: rcasShader, entryPoint: 'fs_main', targets: [{ format: presentationFormat }] },
    primitive: { topology: 'triangle-list' },
  });

  const easuUniformBindGroup = device.createBindGroup({
    layout: easuPipeline.getBindGroupLayout(1),
    entries: [{ binding: 0, resource: { buffer: resolutionBuffer } }],
  });

  const rcasUniformBindGroup = device.createBindGroup({
    layout: rcasPipeline.getBindGroupLayout(1),
    entries: [{ binding: 0, resource: { buffer: resolutionBuffer } }],
  });

  let easuOutputTex = device.createTexture({
    size: [outputWidth, outputHeight, 1],
    format: 'rgba16float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
  });

  let temporalOutputTex = device.createTexture({
    size: [renderWidth, renderHeight, 1],
    format: presentationFormat,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
  });

  let videoTexture = null;
  let isFirstFrame = true;

  const updateVideoTexture = () => {
    if (!videoElement.videoWidth || !videoElement.videoHeight) return null;

    if (!videoTexture) {
        videoTexture = device.createTexture({
        size: [videoElement.videoWidth, videoElement.videoHeight, 1],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC | GPUTextureUsage.RENDER_ATTACHMENT,
        });
    }

    device.queue.copyExternalImageToTexture(
      { source: videoElement },
      { texture: videoTexture },
      [videoElement.videoWidth, videoElement.videoHeight]
    );
    return videoTexture;
  }

  let animationFrameId;
  function render() {
    if (videoElement.readyState >= 2 && videoElement.videoWidth > 0) {
      const currentVideoTexture = updateVideoTexture();

      if (currentVideoTexture) {
        if (isFirstFrame) {
            // Initialize previous frame with current frame
            const commandEncoder = device.createCommandEncoder();
            commandEncoder.copyTextureToTexture(
                { texture: currentVideoTexture },
                { texture: previousFrameTex },
                [renderWidth, renderHeight, 1]
            );
            device.queue.submit([commandEncoder.finish()]);
            isFirstFrame = false;
        }

        const commandEncoder = device.createCommandEncoder();

        // 1. Optical Flow Pass
        const ofBindGroup = device.createBindGroup({
            layout: opticalFlowPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: currentVideoTexture.createView() },
                { binding: 1, resource: previousFrameTex.createView() },
                { binding: 2, resource: smp },
            ],
        });

        const ofPassEncoder = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: motionVectorTex.createView(),
                loadOp: 'clear',
                clearValue: { r: 0.5, g: 0.5, b: 0.0, a: 1.0 }, // 0.5 is zero motion
                storeOp: 'store',
            }],
        });
        ofPassEncoder.setPipeline(opticalFlowPipeline);
        ofPassEncoder.setVertexBuffer(0, vertexBuffer);
        ofPassEncoder.setBindGroup(0, ofBindGroup);
        ofPassEncoder.draw(6, 1, 0, 0);
        ofPassEncoder.end();

        // 2. FSR Temporal Upscaling Pass
        const fsrBindGroup = device.createBindGroup({
            layout: fsrTemporalPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: currentVideoTexture.createView() },
                { binding: 1, resource: historyFrameTex.createView() },
                { binding: 2, resource: motionVectorTex.createView() },
                { binding: 3, resource: smp },
            ],
        });


        const fsrPassEncoder = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: intermediateUpscaledTex.createView(),
                loadOp: 'clear',
                clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                storeOp: 'store',
            }],
        });
        fsrPassEncoder.setPipeline(fsrTemporalPipeline);
        fsrPassEncoder.setVertexBuffer(0, vertexBuffer);
        fsrPassEncoder.setBindGroup(0, fsrBindGroup);
        fsrPassEncoder.draw(6, 1, 0, 0);
        fsrPassEncoder.end();

        // 3. Update Textures for next frame
        commandEncoder.copyTextureToTexture(
            { texture: currentVideoTexture },
            { texture: previousFrameTex },
            [renderWidth, renderHeight, 1]
        );


        // Copy to Canvas
        const currentTexture = context.getCurrentTexture();
        commandEncoder.copyTextureToTexture(
            { texture: intermediateUpscaledTex },
            { texture: currentTexture },
            [outputWidth, outputHeight, 1]
        );

        // Copy to History
        commandEncoder.copyTextureToTexture(
            { texture: intermediateUpscaledTex },
            { texture: historyFrameTex },
            [outputWidth, outputHeight, 1]
        );


        device.queue.submit([commandEncoder.finish()]);
      }
    }
    animationFrameId = requestAnimationFrame(render);
  }

  render();

  return () => {
    cancelAnimationFrame(animationFrameId);
  };
}
