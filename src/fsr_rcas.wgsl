// Robust Contrast Adaptive Sharpening (RCAS) ported to WGSL
// Enhances the sharpness of the upscaled image.

struct Uniforms {
    renderWidth: f32,
    renderHeight: f32,
    outputWidth: f32,
    outputHeight: f32,
};

@group(1) @binding(0) var<uniform> r: Uniforms;
@group(0) @binding(0) var easuTexture: texture_2d<f32>;
@group(0) @binding(1) var easuSampler: sampler;

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
    let texSize = vec2<f32>(r.outputWidth, r.outputHeight);
    let texelSize = 1.0 / texSize;

    let c = textureSample(easuTexture, easuSampler, in.uv).rgb;
    let n = textureSample(easuTexture, easuSampler, in.uv + vec2<f32>(0.0, -texelSize.y)).rgb;
    let s = textureSample(easuTexture, easuSampler, in.uv + vec2<f32>(0.0, texelSize.y)).rgb;
    let w = textureSample(easuTexture, easuSampler, in.uv + vec2<f32>(-texelSize.x, 0.0)).rgb;
    let e = textureSample(easuTexture, easuSampler, in.uv + vec2<f32>(texelSize.x, 0.0)).rgb;

    // RCAS logic: find min/max
    let min_color = min(c, min(min(n, s), min(w, e)));
    let max_color = max(c, max(max(n, s), max(w, e)));

    // Luma contrast
    let luma_c = dot(c, vec3<f32>(0.299, 0.587, 0.114));
    let luma_max = dot(max_color, vec3<f32>(0.299, 0.587, 0.114));

    // Determine sharpening amount based on local contrast
    // Less contrast = more sharpening allowed
    var sharpness = 0.5; // Base sharpness parameter (0.0 to 1.0)

    // Simple laplacian kernel to sharpen
    let sharpened = c * 5.0 - (n + s + w + e);

    // Clamp sharpened value to avoid ringing artifacts
    let finalColor = clamp(mix(c, sharpened, sharpness), min_color, max_color);

    return vec4<f32>(finalColor, 1.0);
}
