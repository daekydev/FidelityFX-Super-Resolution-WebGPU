import React, { useEffect, useRef, useState } from 'react';
import Artplayer from 'artplayer';
import { setupFSR2WebGPU } from './fsr2';

function App() {
  const artRef = useRef(null);
  const canvasRef = useRef(null);
  const [isWebGPUReady, setIsWebGPUReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let art = new Artplayer({
      container: artRef.current,
      url: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/c/c0/Big_Buck_Bunny_4K.webm/Big_Buck_Bunny_4K.webm.1080p.vp9.webm',
      muted: true,
      customType: {},
      moreVideoAttr: {
        crossOrigin: 'anonymous'
      },
      autoplay: true,
      loop: true,
      controls: [
        {
          position: 'right',
          html: 'FSR 1 Upscaling',
          tooltip: 'Toggle Upscaling',
          click: function (...args) {

            if (canvasRef.current) {
               const isHidden = canvasRef.current.style.display === 'none';
               canvasRef.current.style.display = isHidden ? 'block' : 'none';
            }

          },
        },
      ],
    });

    const initWebGPU = async () => {
      try {
        if (!navigator.gpu) {
          throw new Error('WebGPU is not supported in this browser.');
        }
        await setupFSR2WebGPU(art.video, canvasRef.current);
        setIsWebGPUReady(true);
      } catch (e) {
        console.error(e);
        setError(e.message);
      }
    };

    let cleanupFn = null;
    art.on('ready', () => {
       initWebGPU().then(cleanup => {
         if (cleanup) cleanupFn = cleanup;
       });
    });

    return () => {
      if (art && art.destroy) {
        art.destroy(false);
      }
      if (cleanupFn) cleanupFn();
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <h1 className="text-3xl font-bold mb-4">WebGPU FSR 1.0 (Spatial) Video Upscaler</h1>

      {error && (
        <div className="bg-red-500 text-white p-4 rounded mb-4 max-w-2xl">
          Error: {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-6xl">
        <div className="flex flex-col">
          <h2 className="text-xl mb-2">Original (1080p)</h2>
          <div
            ref={artRef}
            style={{ width: '100%', aspectRatio: '16/9', backgroundColor: '#000' }}
          ></div>
        </div>

        <div className="flex flex-col">
          <h2 className="text-xl mb-2">Upscaled (WebGPU FSR 1)</h2>
          <div style={{ width: '100%', aspectRatio: '16/9', backgroundColor: '#000', position: 'relative' }}>
            <canvas
              ref={canvasRef}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            ></canvas>
            {!isWebGPUReady && !error && (
              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
                <span>Initializing WebGPU...</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-8 text-sm text-gray-400 max-w-3xl text-center">
        Note: FSR 2/3 (Temporal) requires 3D engine motion vectors and depth buffers. Standard 2D video lacks this data. Therefore, we use an advanced FSR 1.0 (Spatial) implementation for real-time 60fps 4K upscaling via WebGPU.
      </div>
    </div>
  );
}

export default App;
