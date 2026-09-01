import { useWindowDimensions } from 'react-native';
import { layout } from '@/constants/layout';

export function useResponsiveLayout() {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= layout.tabletBreakpoint;
  const horizontalPadding = isTablet
    ? layout.tabletHorizontalPadding
    : layout.phoneHorizontalPadding;
  const maxContentWidth = isTablet
    ? layout.tabletMaxContentWidth
    : layout.phoneMaxContentWidth;
  const contentWidth = Math.min(
    width - horizontalPadding * 2,
    maxContentWidth,
  );
  const numColumns =
    width >= layout.wideTabletBreakpoint ? 4 : isTablet ? 3 : 2;

  return {
    width,
    height,
    isTablet,
    horizontalPadding,
    maxContentWidth,
    contentWidth,
    numColumns,
  };
}