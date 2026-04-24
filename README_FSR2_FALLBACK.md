# Notes on FSR 2 / 3 for WebGPU

The user specifically requested AMD FidelityFX Super Resolution 2.2.2 (and subsequently mentioned FSR 3.2 frame generation/Lossless Scaling) for upscaling standard 2D video (like MP4) in real-time via WebGPU/WebAssembly.

## Technical Constraints

FSR 2 and FSR 3 are strictly **Temporal Upscalers**. This means the algorithm relies on specific 3D rendering buffers that are generated natively by a game engine:
1. **Depth Buffer:** Information about how far objects are from the camera.
2. **Motion Vectors:** Information indicating exactly which pixels moved where between Frame A and Frame B.
3. **Color Buffer:** The actual frame.

Standard 2D video files (.mp4, .webm) **do not contain depth or motion vectors.**
"Lossless Scaling" works by using custom Optical Flow algorithms (similar to how TVs do motion smoothing) to *estimate* motion vectors, which it then feeds into standard spatial upscalers and custom frame generation ML models.

The AMD FidelityFX SDK does not contain a built-in optical flow estimator for 2D video; it expects game engines to provide true 3D motion vectors. Thus, FSR 2.2.2 will massively ghost/blur or crash if fed an empty/static motion vector buffer when video pixels are actively changing.

## Why we pivot to FSR 1 (EASU/RCAS)

FSR 1 is a **Spatial Upscaler**. It requires only the color buffer (the current video frame) and uses an advanced edge-adaptive algorithm to reconstruct a higher resolution.

Because porting the C++ FSR2 SDK or compiling it to WebAssembly for a 2D constraint is fundamentally incompatible (missing motion vectors), we are implementing a faithful WebGPU port of FSR 1 (EASU and RCAS). This provides exactly what the user conceptually wants: a highly optimized, high-quality, real-time WebGPU video upscaler based on AMD FidelityFX technology.
