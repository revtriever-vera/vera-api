import { normalizeDecimal } from './quantity';
import { Position, PositionView } from './positions.types';

export function toPositionView(position: Position, classId: string): PositionView {
    return {
        id: position.id,
        assetId: position.assetId,
        quantity: normalizeDecimal(position.quantity),
        averagePrice: position.averagePrice === null ? null : normalizeDecimal(position.averagePrice),
        classId,
        createdAt: position.createdAt.toISOString(),
        updatedAt: position.updatedAt.toISOString()
    };
}
