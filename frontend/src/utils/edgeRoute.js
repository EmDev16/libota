// A line that has to go around cards is a fixed list of points (a "route"). When a card is dragged,
// its end of the line has to follow it. This moves the first and last point to where the cards are
// now and keeps the first and last piece straight (a vertical piece stays vertical, a horizontal
// piece stays horizontal).
export const liveRoute = (route, sourceX, sourceY, targetX, targetY) => {
  if (!route || route.length < 2) return route;
  const last = route.length - 1;
  const points = route.map(p => ({ x: p.x, y: p.y }));
  const start = route[0];
  const end = route[last];

  points[0] = { x: sourceX, y: sourceY };
  points[last] = { x: targetX, y: targetY };

  if (last >= 2) {
    // first piece
    if (route[1].x === start.x) points[1].x = sourceX;
    else if (route[1].y === start.y) points[1].y = sourceY;
    // last piece
    if (route[last - 1].x === end.x) points[last - 1].x = targetX;
    else if (route[last - 1].y === end.y) points[last - 1].y = targetY;
  }
  return points;
};
