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
      url: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',
      muted: true,
      autoplay: true,
      loop: true,
      controls: [
        {
          position: 'right',
          html: 'FSR 2 Upscaling',
          tooltip: 'Toggle Upscaling',
          click: function (...args) {
            console.log('Toggle FSR2');
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

    art.on('ready', () => {
       initWebGPU();
    });

    return () => {
      if (art && art.destroy) {
        art.destroy(false);
      }
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <h1 className="text-3xl font-bold mb-4">WebGPU FSR 2.2 Video Upscaler</h1>

      {error && (
        <div className="bg-red-500 text-white p-4 rounded mb-4 max-w-2xl">
          Error: {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-6xl">
        <div className="flex flex-col">
          <h2 className="text-xl mb-2">Original (360p)</h2>
          <div
            ref={artRef}
            style={{ width: '100%', aspectRatio: '16/9', backgroundColor: '#000' }}
          ></div>
        </div>

        <div className="flex flex-col">
          <h2 className="text-xl mb-2">Upscaled (WebGPU FSR 2)</h2>
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
        Note: FSR 2 is a temporal upscaler that requires depth and motion vectors. For 2D video, we supply dummy vectors. This will likely result in ghosting, as requested.
      </div>
    </div>
  );
}

export default App;
