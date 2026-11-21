import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Skeleton, SkeletonGrid, SkeletonList } from '../Skeleton';

/** Blocks are hidden from accessibility, so queries must opt back in. */
const hidden = { includeHiddenElements: true } as const;

describe('Skeleton', () => {
  it('applies the requested dimensions to the block', () => {
    render(<Skeleton width={40} height={40} radius={20} />);
    expect(screen.getByTestId('skeleton-block', hidden)).toHaveStyle({
      width: 40,
      height: 40,
      borderRadius: 20,
    });
  });

  it('keeps placeholders out of the accessibility tree', () => {
    render(<Skeleton />);
    // Decoration only — a screen reader announcing rows of nothing while
    // the list loads is worse than the spinner this replaced. Default
    // (non-hidden) queries finding nothing is the assertion.
    expect(screen.queryByTestId('skeleton-block')).toBeNull();
    expect(screen.getByTestId('skeleton-block', hidden)).toBeTruthy();
  });

  it('renders the requested number of list rows', () => {
    render(<SkeletonList count={4} />);
    expect(screen.getByTestId('skeleton-list', hidden).children).toHaveLength(4);
  });

  it('renders a row without an avatar when asked', () => {
    render(<SkeletonList count={1} avatar={false} />);
    // Two text lines only, no leading circle.
    expect(screen.getAllByTestId('skeleton-block', hidden)).toHaveLength(2);
  });

  it('renders the requested number of grid tiles', () => {
    render(<SkeletonGrid count={6} columns={3} />);
    expect(screen.getByTestId('skeleton-grid', hidden).children).toHaveLength(6);
  });
});
