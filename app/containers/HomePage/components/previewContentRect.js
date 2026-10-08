// Encoder block alignment can add a few pixels around the captured display.
// Only remove a narrow alignment strip when the device aspect ratio is known.
export default function previewContentRect(width, height, display) {
  const full = { x: 0, y: 0, width, height };

  if (!display?.width || !display?.height) return full;
  const ratio = display.width / display.height;
  const contentWidth = Math.floor(height * ratio);
  const contentHeight = Math.floor(width / ratio);
  const horizontal = width - contentWidth;
  const vertical = height - contentHeight;

  if (horizontal > 0 && horizontal <= 16 && contentWidth > 0)
    return { x: Math.floor(horizontal / 2), y: 0, width: contentWidth, height };
  if (vertical > 0 && vertical <= 16 && contentHeight > 0)
    return { x: 0, y: Math.floor(vertical / 2), width, height: contentHeight };

  return full;
}
