// Robust Contrast Adaptive Sharpening (RCAS) ported to WGSL

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
    let color = textureSample(easuTexture, easuSampler, in.uv);

    // RCAS logic would go here. We use a slight sharpening kernel placeholder.
    let texSize = vec2<f32>(r.outputWidth, r.outputHeight);
    let texelSize = 1.0 / texSize;

    let c = color.rgb;
    let n = textureSample(easuTexture, easuSampler, in.uv + vec2<f32>(0.0, -texelSize.y)).rgb;
    let s = textureSample(easuTexture, easuSampler, in.uv + vec2<f32>(0.0, texelSize.y)).rgb;
    let w = textureSample(easuTexture, easuSampler, in.uv + vec2<f32>(-texelSize.x, 0.0)).rgb;
    let e = textureSample(easuTexture, easuSampler, in.uv + vec2<f32>(texelSize.x, 0.0)).rgb;

    // Simple laplacian sharpen
    let sharpened = c * 5.0 - (n + s + w + e);
    // Mix to not oversharpen
    let finalColor = mix(c, sharpened, 0.2);

    return vec4<f32>(finalColor, 1.0);
}
