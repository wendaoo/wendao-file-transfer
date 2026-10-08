import { useEffect, useRef, useState } from 'react';
import { ipcRenderer } from 'electron';
import previewContentRect from './previewContentRect';

export default function useDevicePreview(
  enabled,
  serial,
  onStop,
  quality = 'eco',
  display = null,
  transport = 'adb'
) {
  const displayRef = useRef(display);

  displayRef.current = display;
  const canvas = useRef(null);
  const snapshot = useRef(null);
  const nativeTransition = useRef(false);
  const paintGeneration = useRef(0);
  const freeze = () => {
    const source = canvas.current;
    const target = snapshot.current;

    if (
      !source ||
      !target ||
      displayedFrame.current?.target !== source ||
      displayedFrame.current?.serial !== serial
    )
      return;
    paintGeneration.current += 1;
    target.width = source.width;
    target.height = source.height;
    target.getContext('2d').drawImage(source, 0, 0);
    target.style.visibility = 'visible';
  };
  const thaw = () => {
    const generation = paintGeneration.current;

    // Keep a painted fallback until the resized live surface has been composited.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (
          generation === paintGeneration.current &&
          !nativeTransition.current &&
          snapshot.current
        )
          snapshot.current.style.visibility = 'hidden';
      });
    });
  };
  const [frameSize, setFrameSize] = useState(null);
  const [message, setMessage] = useState('');
  const stopRef = useRef(onStop);
  const displayedFrame = useRef(null);

  useEffect(() => {
    const transition = (_, active) => {
      nativeTransition.current = active;
      if (active) freeze();
      else thaw();
    };

    ipcRenderer.on('preview:transition', transition);

    return () => {
      paintGeneration.current += 1;
      ipcRenderer.removeListener('preview:transition', transition);
    };
  }, [serial]);

  stopRef.current = onStop;
  useEffect(() => {
    setFrameSize(null);
  }, [serial]);
  useEffect(() => {
    if (!enabled) return undefined;
    freeze();
    let disposed = false;
    let decoder;
    let hasKey = false;
    let codecConfig;
    let firstFrame = true;
    const fail = (error) => {
      if (disposed) return;
      setMessage(error);
      stopRef.current();
    };
    const paint = (frame) => {
      try {
        if (disposed || !canvas.current) return;
        const target = canvas.current;
        const content =
          transport === 'hdc'
            ? {
                x: 0,
                y: 0,
                width: frame.width,
                height: frame.height,
              }
            : previewContentRect(
                frame.displayWidth || frame.width,
                frame.displayHeight || frame.height,
                displayRef.current
              );

        if (
          target.width !== content.width ||
          target.height !== content.height
        ) {
          freeze();
          setFrameSize({
            width: content.width,
            height: content.height,
          });
          target.width = content.width;
          target.height = content.height;
        }

        target
          .getContext('2d')
          .drawImage(
            frame,
            content.x,
            content.y,
            content.width,
            content.height,
            0,
            0,
            content.width,
            content.height
          );
        displayedFrame.current = { target, serial };
        if (snapshot.current?.style.visibility === 'visible') thaw();
        if (firstFrame) {
          firstFrame = false;
          setMessage('实时画面');
        }
      } finally {
        frame.close();
      }
    };
    const packet = (_, frame) => {
      ipcRenderer.send('preview:ack');
      if (disposed || !decoder) return;
      const data = new Uint8Array(frame.data);

      try {
        if (frame.config) {
          codecConfig = data;
          for (let i = 0; i + 6 < data.length; i += 1) {
            if (
              data[i] === 0 &&
              data[i + 1] === 0 &&
              data[i + 2] === 1 &&
              data[i + 3] % 32 === 7
            ) {
              const profile = Array.from(data.slice(i + 4, i + 7))
                .map((b) => b.toString(16).padStart(2, '0'))
                .join('');

              decoder.reset();
              decoder.configure({
                codec: `avc1.${profile}`,
                optimizeForLatency: true,
              });
              hasKey = false;
              break;
            }
          }

          return;
        }

        if (!hasKey && !frame.key) return;
        if (decoder.decodeQueueSize > 8) {
          fail('画面解码较慢，请重新开启预览');

          return;
        }

        hasKey = true;
        let encoded = data;

        if (frame.key && codecConfig) {
          encoded = new Uint8Array(codecConfig.length + data.length);
          encoded.set(codecConfig);
          encoded.set(data, codecConfig.length);
        }

        decoder.decode(
          new window.EncodedVideoChunk({
            type: frame.key ? 'key' : 'delta',
            timestamp: frame.timestamp,
            data: encoded,
          })
        );
      } catch (e) {
        fail('无法解码设备画面，请重新开启预览');
      }
    };
    const status = (_, result) => {
      if (result.error) fail(result.error);
    };

    // Keep the last frame visible while the encoder switches quality.
    // Reconnecting text would otherwise flash over an already live picture.
    if (
      displayedFrame.current?.target !== canvas.current ||
      displayedFrame.current?.serial !== serial
    )
      setMessage('正在连接实时画面…');
    if (transport === 'hdc') {
      const jpegFrame = async (_, bytes) => {
        if (disposed) return;
        try {
          const bitmap = await createImageBitmap(
            new Blob([new Uint8Array(bytes.data || bytes)], {
              type: 'image/jpeg',
            })
          );

          paint(bitmap);
        } catch (_) {
          fail('无法解码设备画面，请重新开启预览');
        }
      };

      ipcRenderer.on('preview:jpeg', jpegFrame);
      ipcRenderer.on('preview:status', status);
      setMessage('正在读取设备画面…');
      ipcRenderer
        .invoke('preview:start', serial || '', quality)
        .then((result) => {
          if (result.error) fail(result.error);

          return null;
        })
        .catch((error) => fail(error.message));

      return () => {
        disposed = true;
        ipcRenderer.removeListener('preview:jpeg', jpegFrame);
        ipcRenderer.removeListener('preview:status', status);
        ipcRenderer.invoke('preview:stop').catch(() => {});
      };
    }

    ipcRenderer.on('preview:packet', packet);
    ipcRenderer.on('preview:status', status);
    (async () => {
      try {
        if (!window.VideoDecoder)
          throw new Error('当前运行环境不支持实时视频解码');
        const config = { codec: 'avc1.42E01E', optimizeForLatency: true };
        const { supported } = await window.VideoDecoder.isConfigSupported(
          config
        );

        if (!supported) throw new Error('当前运行环境不支持 H.264 视频解码');
        if (disposed) return;
        decoder = new window.VideoDecoder({
          output: paint,
          error: () => fail('视频解码中断，请重新开启预览'),
        });
        decoder.configure(config);
        const result = await ipcRenderer.invoke(
          'preview:start',
          serial || '',
          quality
        );

        if (result.error) fail(result.error);
      } catch (e) {
        fail(e.message);
      }
    })();

    return () => {
      disposed = true;
      ipcRenderer.removeListener('preview:packet', packet);
      ipcRenderer.removeListener('preview:status', status);
      if (decoder && decoder.state !== 'closed') decoder.close();
      ipcRenderer.invoke('preview:stop').catch(() => {});
    };
  }, [enabled, serial, quality, transport]);

  return { canvas, snapshot, freeze, message, frameSize };
}
