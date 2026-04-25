// Simplified Block Matching Optical Flow in WebGPU

@group(0) @binding(0) var currentFrame: texture_2d<f32>;
@group(0) @binding(1) var previousFrame: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@location(0) pos: vec3<f32>, @location(1) uv: vec2<f32>) -> VertexOutput {
    var out: VertexOutput;
    out.position = vec4<f32>(pos, 1.0);
    out.uv = uv;
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(currentFrame));
    let texelSize = 1.0 / texSize;

    // Convert current pixel to luminance
    let currColor = textureSampleLevel(currentFrame, smp, in.uv, 0.0).rgb;
    let currLuma = dot(currColor, vec3<f32>(0.299, 0.587, 0.114));

    // Simple search window for optical flow (e.g., 3x3 block)
    var bestOffset = vec2<f32>(0.0, 0.0);
    var minDiff = 9999.0;

    let searchRadius = 2; // small radius for real-time performance

    for (var y = -searchRadius; y <= searchRadius; y++) {
        for (var x = -searchRadius; x <= searchRadius; x++) {
            let offset = vec2<f32>(f32(x), f32(y)) * texelSize;
            let sampleUV = in.uv + offset;

            // Bounds check
            if (sampleUV.x >= 0.0 && sampleUV.x <= 1.0 && sampleUV.y >= 0.0 && sampleUV.y <= 1.0) {
                let prevColor = textureSampleLevel(previousFrame, smp, sampleUV, 0.0).rgb;
                let prevLuma = dot(prevColor, vec3<f32>(0.299, 0.587, 0.114));

                let diff = abs(currLuma - prevLuma);
                if (diff < minDiff) {
                    minDiff = diff;
                    bestOffset = offset;
                }
            }
        }
    }

    // bestOffset is the vector pointing from previous frame to current frame
    // We encode this as an RG format (Motion Vector)
    // Map from [-1, 1] (screen space) to [0, 1] for texture storage
    return vec4<f32>(bestOffset.x * 0.5 + 0.5, bestOffset.y * 0.5 + 0.5, 0.0, 1.0);
}
