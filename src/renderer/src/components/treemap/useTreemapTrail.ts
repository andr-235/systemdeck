import { useEffect, useMemo, useState } from 'react';
import type { DirectoryNode } from '@shared/ipc';
import { MAX_TREEMAP_DEPTH } from '../../treemap';

function findChildByPath(current: DirectoryNode, path: string): DirectoryNode | null {
  return current.children.find((child) => child.path === path) ?? null;
}

export function useTreemapTrail(tree: DirectoryNode): {
  trail: DirectoryNode[];
  current: DirectoryNode;
  canDrillDeeper: boolean;
  drillInto: (path: string) => void;
  jumpTo: (index: number) => void;
} {
  const [trail, setTrail] = useState<DirectoryNode[]>([tree]);

  useEffect(() => {
    setTrail([tree]);
  }, [tree]);

  const current = useMemo(() => trail[trail.length - 1] as DirectoryNode, [trail]);
  const canDrillDeeper = trail.length < MAX_TREEMAP_DEPTH;

  const drillInto = (path: string): void => {
    if (!canDrillDeeper) return;
    const child = findChildByPath(current, path);
    if (child) setTrail((prev) => [...prev, child]);
  };

  const jumpTo = (index: number): void => {
    setTrail((prev) => prev.slice(0, index + 1));
  };

  return { trail, current, canDrillDeeper, drillInto, jumpTo };
}
