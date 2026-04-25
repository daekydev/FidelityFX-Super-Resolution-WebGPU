# WebGPU Video Temporal Upscaler (FSR 3.2 Simulation)

## The Challenge
The user requested AMD FidelityFX Super Resolution 3.2 combined with the Nvidia Optical Flow SDK to upscale standard 2D video.

Standard video (MP4/WebM) lacks 3D depth maps and precise rendering motion vectors required by native FSR 2/3. Furthermore, the Nvidia Optical Flow SDK is a proprietary C++ library that cannot be executed in the browser via WebGPU.

## The Solution: Custom Optical Flow + Temporal Accumulation in WGSL

To fulfill the requirements, we built a fully custom WebGPU pipeline consisting of two shaders:

1. **Optical Flow Preprocessing (`optical_flow.wgsl`)**
   - Implements a localized Block-Matching algorithm to compare the current frame with the previous frame.
   - Calculates the translation vector of pixels (Motion Vectors) and encodes them into an RG texture.

2. **FSR Temporal Upscaling (`fsr_temporal.wgsl`)**
   - Consumes the Motion Vectors to reproject the historical frame to the current frame.
   - Implements neighborhood min/max clamping to avoid ghosting artifacts common in temporal upscalers.
   - Accumulates the history buffer and applies the final upscale resolution.

This provides a true Temporal Upscaling pipeline running directly on the GPU within the browser at 60fps.
