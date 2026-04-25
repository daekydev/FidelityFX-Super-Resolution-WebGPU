// FSR 3 Temporal Upscaling Simulation using Optical Flow Vectors

@group(0) @binding(0) var currentFrame: texture_2d<f32>;
@group(0) @binding(1) var historyFrame: texture_2d<f32>;
@group(0) @binding(2) var motionVectors: texture_2d<f32>;
@group(0) @binding(3) var smp: sampler;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@location(0) pos: vec3<f32>, @location(1) uv: vec2<f32>) -> VertexOutput {
    var out: VertexOutput;
    out.position = vec4<f32>(pos, 1.0);
    out.uv = vec2<f32>(uv.x, uv.y);
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // 1. Sample current frame
    let currColor = textureSampleLevel(currentFrame, smp, in.uv, 0.0).rgb;

    // 2. Get motion vector for this pixel
    let encodedMV = textureSampleLevel(motionVectors, smp, in.uv, 0.0).xy;

    // Decode from [0, 1] to [-1, 1] screen space offset
    let mv = (encodedMV - vec2<f32>(0.5, 0.5)) * 2.0;

    // 3. Reproject history frame
    let historyUV = in.uv - mv; // Where was this pixel in the previous frame?
    var historyColor = vec3<f32>(0.0);
    var temporalBlend = 0.9; // 90% history, 10% new frame by default

    // Check if reprojected UV is out of bounds
    if (historyUV.x < 0.0 || historyUV.x > 1.0 || historyUV.y < 0.0 || historyUV.y > 1.0) {
        historyColor = currColor; // Discard history
        temporalBlend = 0.0;
    } else {
        historyColor = textureSampleLevel(historyFrame, smp, historyUV, 0.0).rgb;

        // Neighborhood clamping to prevent ghosting
        let texSize = vec2<f32>(textureDimensions(currentFrame));
        let texelSize = 1.0 / texSize;
        let c = currColor;
        let n = textureSampleLevel(currentFrame, smp, in.uv + vec2<f32>(0.0, -texelSize.y), 0.0).rgb;
        let s = textureSampleLevel(currentFrame, smp, in.uv + vec2<f32>(0.0, texelSize.y), 0.0).rgb;
        let e = textureSampleLevel(currentFrame, smp, in.uv + vec2<f32>(texelSize.x, 0.0), 0.0).rgb;
        let w = textureSampleLevel(currentFrame, smp, in.uv + vec2<f32>(-texelSize.x, 0.0), 0.0).rgb;

        let min_color = min(c, min(min(n, s), min(w, e)));
        let max_color = max(c, max(max(n, s), max(w, e)));

        historyColor = clamp(historyColor, min_color, max_color);
    }

    // 4. Temporal Accumulation
    let finalColor = mix(currColor, historyColor, temporalBlend);

    return vec4<f32>(finalColor, 1.0);
}
