export async function setupFSR2WebGPU(videoElement, canvasElement) {
  if (!navigator.gpu) {
    throw new Error('WebGPU is not supported by your browser.');
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error('Failed to get GPU adapter.');
  }

  const device = await adapter.requestDevice();
  const context = canvasElement.getContext('webgpu');
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

  const renderWidth = 640;
  const renderHeight = 360;
  const outputWidth = 1280;
  const outputHeight = 720;

  canvasElement.width = outputWidth;
  canvasElement.height = outputHeight;

  context.configure({
    device,
    format: presentationFormat,
    alphaMode: 'premultiplied',
  });

  const easuCodeResponse = await fetch('/src/fsr_easu.wgsl');
  const easuCode = await easuCodeResponse.text();
  const rcasCodeResponse = await fetch('/src/fsr_rcas.wgsl');
  const rcasCode = await rcasCodeResponse.text();

  const resolutionBuffer = device.createBuffer({
    size: 4 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  device.queue.writeBuffer(
    resolutionBuffer,
    0,
    new Float32Array([renderWidth, renderHeight, outputWidth, outputHeight])
  );

  const easuShader = device.createShaderModule({ code: easuCode });
  const rcasShader = device.createShaderModule({ code: rcasCode });

  const samplerInfo = {
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  };
  const videoSampler = device.createSampler(samplerInfo);
  const easuSampler = device.createSampler(samplerInfo);

  const intermediateTexture = device.createTexture({
    size: { width: outputWidth, height: outputHeight, depthOrArrayLayers: 1 },
    format: 'rgba16float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
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

  const easuPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: easuShader,
      entryPoint: 'vs_main',
      buffers: [vertexBufferLayout]
    },
    fragment: {
      module: easuShader,
      entryPoint: 'fs_main',
      targets: [{ format: 'rgba16float' }],
    },
    primitive: { topology: 'triangle-list' },
  });

  const rcasPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: rcasShader,
      entryPoint: 'vs_main',
      buffers: [vertexBufferLayout]
    },
    fragment: {
      module: rcasShader,
      entryPoint: 'fs_main',
      targets: [{ format: presentationFormat }],
    },
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

  let videoTexture = null;
  const updateVideoTexture = () => {
    if (!videoElement.videoWidth || !videoElement.videoHeight) return null;

    if (!videoTexture) {
        videoTexture = device.createTexture({
        size: [videoElement.videoWidth, videoElement.videoHeight, 1],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
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
        const easuBindGroup0 = device.createBindGroup({
            layout: easuPipeline.getBindGroupLayout(0),
            entries: [
            { binding: 0, resource: currentVideoTexture.createView() },
            { binding: 1, resource: videoSampler },
            ],
        });

        const commandEncoder = device.createCommandEncoder();

        const easuPassEncoder = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: intermediateTexture.createView(),
                loadOp: 'clear',
                clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                storeOp: 'store',
            }],
        });
        easuPassEncoder.setPipeline(easuPipeline);
        easuPassEncoder.setVertexBuffer(0, vertexBuffer);
        easuPassEncoder.setBindGroup(0, easuBindGroup0);
        easuPassEncoder.setBindGroup(1, easuUniformBindGroup);
        easuPassEncoder.draw(6, 1, 0, 0);
        easuPassEncoder.end();

        const rcasBindGroup0 = device.createBindGroup({
            layout: rcasPipeline.getBindGroupLayout(0),
            entries: [
            { binding: 0, resource: intermediateTexture.createView() },
            { binding: 1, resource: easuSampler },
            ],
        });

        const rcasPassEncoder = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                loadOp: 'clear',
                clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                storeOp: 'store',
            }],
        });
        rcasPassEncoder.setPipeline(rcasPipeline);
        rcasPassEncoder.setVertexBuffer(0, vertexBuffer);
        rcasPassEncoder.setBindGroup(0, rcasBindGroup0);
        rcasPassEncoder.setBindGroup(1, rcasUniformBindGroup);
        rcasPassEncoder.draw(6, 1, 0, 0);
        rcasPassEncoder.end();

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
