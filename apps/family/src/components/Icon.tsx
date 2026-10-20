import type { ComponentType } from 'react';
import Svg, { Circle, Ellipse, Line, Path, Polygon, Polyline, Rect } from 'react-native-svg';
import { color as palette } from '../theme/tokens';
import { iconPaths, type IconName } from './icon-paths';

export type { IconName } from './icon-paths';

const ELEMENTS = {
  path: Path,
  circle: Circle,
  rect: Rect,
  line: Line,
  polyline: Polyline,
  polygon: Polygon,
  ellipse: Ellipse,
} as const;

/** A Lucide line icon (NestHome's icon set): 24px grid, round 2px strokes. Decorative by
 * default; give the surrounding control the accessible label. */
export function Icon({
  name,
  size = 22,
  color = palette.textPrimary,
  strokeWidth = 2,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {iconPaths[name].map(([tag, attrs], i) => {
        const El = ELEMENTS[tag] as ComponentType<Record<string, unknown>>;
        return <El key={i} {...attrs} />;
      })}
    </Svg>
  );
}
