function promptPosition(workArea, size) {
  // Se a janela for maior que a área, ancora na origem disponível.
  const maxX = workArea.x + Math.max(0, workArea.width - size.width);
  const maxY = workArea.y + Math.max(0, workArea.height - size.height);
  const x = workArea.x + Math.round((workArea.width - size.width) / 2);
  const y = workArea.y + Math.round(workArea.height * 0.25);

  return {
    x: Math.round(Math.min(maxX, Math.max(workArea.x, x))),
    y: Math.round(Math.min(maxY, Math.max(workArea.y, y))),
  };
}

module.exports = { promptPosition };
