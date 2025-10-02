import { InventoryMoveType } from '@prisma/client';

import { prisma } from '../lib/prisma.js';

export async function getStockForProducts(productIds: string[]) {
  if (productIds.length === 0) {
    return new Map<string, number>();
  }

  const moves = await prisma.inventoryMove.findMany({
    where: {
      deleted_at: null,
      product_id: { in: productIds },
    },
    select: {
      product_id: true,
      type: true,
      quantity: true,
    },
  });

  const stock = new Map<string, number>();

  for (const move of moves) {
    const current = stock.get(move.product_id) ?? 0;
    let delta = move.quantity;

    switch (move.type) {
      case InventoryMoveType.OUT:
        delta = -Math.abs(move.quantity);
        break;
      case InventoryMoveType.ADJUSTMENT:
        delta = move.quantity;
        break;
      case InventoryMoveType.IN:
      default:
        delta = Math.abs(move.quantity);
        break;
    }

    stock.set(move.product_id, current + delta);
  }

  return stock;
}

export function calculateBundleStock(
  bundleComponents: Array<{ componentId: string; quantity: number }>,
  stock: Map<string, number>,
) {
  if (bundleComponents.length === 0) {
    return 0;
  }

  let min = Infinity;
  for (const item of bundleComponents) {
    const available = stock.get(item.componentId) ?? 0;
    const possible = Math.floor(available / Math.max(item.quantity, 1));
    if (possible < min) {
      min = possible;
    }
  }

  if (!Number.isFinite(min)) {
    return 0;
  }

  return min;
}
