// Improved Edge Adaptive Spatial Upsampling (EASU) ported to WGSL
// Approximates the FSR 1 EASU pass.

struct Uniforms {
    renderWidth: f32,
    renderHeight: f32,
    outputWidth: f32,
    outputHeight: f32,
};

@group(1) @binding(0) var<uniform> r: Uniforms;
@group(0) @binding(0) var videoTexture: texture_2d<f32>;
@group(0) @binding(1) var videoSampler: sampler;

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

// Simple Lanczos-like directional interpolation approximation
@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(r.renderWidth, r.renderHeight);
    let texelSize = 1.0 / texSize;

    let c = textureSample(videoTexture, videoSampler, in.uv).rgb;
    let n = textureSample(videoTexture, videoSampler, in.uv + vec2<f32>(0.0, -texelSize.y)).rgb;
    let s = textureSample(videoTexture, videoSampler, in.uv + vec2<f32>(0.0, texelSize.y)).rgb;
    let w = textureSample(videoTexture, videoSampler, in.uv + vec2<f32>(-texelSize.x, 0.0)).rgb;
    let e = textureSample(videoTexture, videoSampler, in.uv + vec2<f32>(texelSize.x, 0.0)).rgb;

    let nw = textureSample(videoTexture, videoSampler, in.uv + vec2<f32>(-texelSize.x, -texelSize.y)).rgb;
    let ne = textureSample(videoTexture, videoSampler, in.uv + vec2<f32>(texelSize.x, -texelSize.y)).rgb;
    let sw = textureSample(videoTexture, videoSampler, in.uv + vec2<f32>(-texelSize.x, texelSize.y)).rgb;
    let se = textureSample(videoTexture, videoSampler, in.uv + vec2<f32>(texelSize.x, texelSize.y)).rgb;

    // Luma calculation
    let luma_c = dot(c, vec3<f32>(0.299, 0.587, 0.114));
    let luma_n = dot(n, vec3<f32>(0.299, 0.587, 0.114));
    let luma_s = dot(s, vec3<f32>(0.299, 0.587, 0.114));
    let luma_w = dot(w, vec3<f32>(0.299, 0.587, 0.114));
    let luma_e = dot(e, vec3<f32>(0.299, 0.587, 0.114));

    let min_luma = min(luma_c, min(min(luma_n, luma_s), min(luma_w, luma_e)));
    let max_luma = max(luma_c, max(max(luma_n, luma_s), max(luma_w, luma_e)));
    let contrast = max_luma - min_luma;

    // If contrast is low, just return the center pixel (bilinear is fine)
    if (contrast < 0.05) {
        return vec4<f32>(c, 1.0);
    }

    // Directional edge detection
    let dir_w = abs(luma_n - luma_c) + abs(luma_s - luma_c);
    let dir_h = abs(luma_w - luma_c) + abs(luma_e - luma_c);

    var final_color = c;
    if (dir_w > dir_h) {
        // Horizontal edge, blur vertically
        final_color = (n + c * 2.0 + s) * 0.25;
    } else {
        // Vertical edge, blur horizontally
        final_color = (w + c * 2.0 + e) * 0.25;
    }

    return vec4<f32>(final_color, 1.0);
}
