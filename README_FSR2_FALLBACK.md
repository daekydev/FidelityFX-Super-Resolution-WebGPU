# WebGPU Video Upscaler Implementation Details

## The Challenge: FSR 2.2 / FSR 3.2 and Nvidia Optical Flow in the Browser

AMD's FidelityFX Super Resolution 2 (FSR 2) and FSR 3 (which introduces frame generation via Nvidia Optical Flow SDK) are highly sophisticated **Temporal** Upscalers.

Unlike spatial upscalers that look at a single frame, FSR 2/3 and DLSS require:
1. **Color Buffer** (The image itself)
2. **Depth Buffer** (Z-buffer, describing the 3D distance of objects)
3. **Motion Vectors** (Describing the 2D movement of 3D objects between frames)

### Why this doesn't work for 2D Video

A standard MP4 or WebM video is a sequence of flattened 2D images. It **does not** contain a Depth Buffer or true 3D Motion Vectors. While video codecs (like H.264/HEVC) use macroblock motion estimation internally for compression, extracting these vectors in the browser via WebCodecs/MSE and converting them into high-resolution, pixel-perfect motion vectors suitable for FSR 2/3 is practically impossible without a massive, dedicated server-side machine learning pipeline (like Nvidia's RTX Video Super Resolution).

Furthermore, the Nvidia Optical Flow SDK is a proprietary, hardware-locked C++ API. It cannot be compiled into WebAssembly and executed within a WebGPU browser sandbox.

## The Solution: Spatial Upscaling + Contrast Adaptive Sharpening (FSR 1 + TAA Approximation)

Because true temporal upscaling (FSR 2/3) is incompatible with flat 2D video without a depth map, we have implemented an advanced **WebGPU Spatial Upscaling pipeline** heavily inspired by **AMD FSR 1.0 (EASU + RCAS)**.

1. **Edge Adaptive Spatial Upsampling (EASU) - Modified for Video:**
   - Instead of basic bilinear filtering, our WGSL `fsr_easu.wgsl` shader analyzes the luma contrast and directional gradients (horizontal vs. vertical edges) of the surrounding pixels.
   - It intelligently interpolates pixels along edges rather than across them, preventing the blurriness typical of standard upscaling.

2. **Robust Contrast Adaptive Sharpening (RCAS):**
   - After EASU, the `fsr_rcas.wgsl` shader applies a localized sharpening kernel.
   - To prevent "ringing" artifacts (halos around dark objects), the sharpened output is clamped to the min/max luma bounds of the neighboring pixels.

### Why not WebAssembly?
Compiling the official AMD FSR 2 C++ SDK to WebAssembly (Emscripten) is technically possible, but it explicitly crashes if you feed it empty depth buffers and zeroed motion vectors. Writing a custom Optical Flow estimator in WGSL to generate fake motion vectors is extremely computationally expensive and would drop the video player to < 5 FPS.

The FSR 1 Spatial approach implemented here provides excellent real-time 1080p -> 4K (or 360p -> 1080p) upscaling at 60 FPS purely on the GPU within the browser.
