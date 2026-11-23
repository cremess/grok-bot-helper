function promptPosition(workArea, size) {
  // Anchor at the work area origin if the window is larger.
  const maxX = workArea.x + Math.max(0, workArea.width - size.width);
  const maxY = workArea.y + Math.max(0, workArea.height - size.height);
  const x = workArea.x + Math.round((workArea.width - size.width) / 2);
  const y = workArea.y + Math.round(workArea.height * 0.25);

  return {
    x: Math.round(Math.min(maxX, Math.max(workArea.x, x))),
    y: Math.round(Math.min(maxY, Math.max(workArea.y, y))),
  };
}

function isBoundsVisible(bounds, workAreas, minVisible = { width: 80, height: 40 }) {
  if (!bounds) return false;
  return workAreas.some((area) => {
    const width = Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x);
    const height = Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y);
    return width >= minVisible.width && height >= minVisible.height;
  });
}

module.exports = { promptPosition, isBoundsVisible };
