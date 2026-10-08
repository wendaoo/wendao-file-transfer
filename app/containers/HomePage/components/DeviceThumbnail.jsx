import React, { useEffect, useRef, useState } from 'react';
import { ipcRenderer } from 'electron';
import CircularProgress from '@material-ui/core/CircularProgress';

export default function DeviceThumbnail({
  item,
  device,
  src,
  className,
  thumbnailClassName,
  grid = false,
  ...props
}) {
  const element = useRef(null);
  const [visible, setVisible] = useState(false);
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const serial =
    device?.info?.usbDeviceInfo?.SerialNumber ||
    device?.info?.mtpDeviceInfo?.SerialNumber;
  const transport = device?.info?.transport;
  const isPhoto = transport === 'ios' && item.isPhoto;
  const isHarmonyPhoto = transport === 'hdc' && device?.info?.mediaOnly && grid;
  const enabled =
    device?.isAvailable && (transport === 'adb' || isPhoto || isHarmonyPhoto);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: '100px' }
    );

    if (element.current) observer.observe(element.current);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let disposed = false;

    setImage(null);
    setLoading(false);
    if (
      enabled &&
      visible &&
      serial &&
      (isPhoto || /\.(png|jpe?g|gif|webp|bmp|heic|heif|avif)$/i.test(item.name))
    ) {
      setLoading(true);
      ipcRenderer
        .invoke(
          isPhoto
            ? 'ios-files:request'
            : isHarmonyPhoto
            ? 'hdc-files:request'
            : 'adb-files:request',
          {
            operation: 'thumbnail',
            storageId: isPhoto ? 65538 : 65537,
            serial,
            filePath: item.path,
            size: item.size,
            dateAdded: item.dateAdded,
          }
        )
        .then((result) => {
          if (!disposed && result.data) setImage(result.data);

          return null;
        })
        .finally(() => {
          if (!disposed) setLoading(false);
        })
        .catch(() => null);
    }

    return () => {
      disposed = true;
    };
  }, [
    enabled,
    visible,
    isPhoto,
    isHarmonyPhoto,
    serial,
    item.path,
    item.name,
    item.size,
    item.dateAdded,
  ]);

  return (
    <>
      <img
        {...props}
        ref={element}
        alt={item.name}
        src={image || src}
        className={image ? thumbnailClassName : className}
        style={
          loading && grid ? { ...props.style, opacity: 0.35 } : props.style
        }
        onError={() => {
          if (image) setImage(null);
        }}
      />
      {loading && grid && (
        <CircularProgress
          size={18}
          thickness={4}
          aria-label="正在加载缩略图"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
          }}
        />
      )}
    </>
  );
}
