declare module '@prisma/client' {
  export type UserRole = 'admin' | 'tech' | 'cashier';
  export type WorkTicketStatus = 'NEW' | 'IN_PROGRESS' | 'READY' | 'CLOSED';
  export type WorkTicketEventType =
    | 'CREATED'
    | 'NOTE'
    | 'PHOTO'
    | 'ESTIMATE_SET'
    | 'CUSTOMER_APPROVED'
    | 'CUSTOMER_DECLINED'
    | 'READY'
    | 'PICKED_UP';
  export type ConsentChannel = 'whatsapp';
  export type InventoryMoveType = 'IN' | 'OUT' | 'ADJUSTMENT';
  export type InvoiceStatus = 'DRAFT' | 'SENT' | 'PARTIALLY_PAID' | 'PAID' | 'VOID';
  export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'EWALLET' | 'OTHER';

  export namespace Prisma {
    type Primitive = string | number | boolean | null | undefined;
    export type QueryMode = 'default' | 'insensitive';
    export type CustomerWhereInput = Record<string, Primitive | CustomerWhereInput | CustomerWhereInput[]>;
    export type DeviceWhereInput = Record<string, Primitive | DeviceWhereInput | DeviceWhereInput[]>;
    export type WorkTicketWhereInput = Record<string, Primitive | WorkTicketWhereInput | WorkTicketWhereInput[]>;

    export type TransactionClient = {
      [model: string]: any;
    };

    export class Decimal {
      constructor(value: string | number | bigint);
      plus(value: Decimal | string | number | bigint): Decimal;
      toNumber(): number;
    }
  }

  export const Prisma: {
    QueryMode: {
      readonly default: Prisma.QueryMode;
      readonly insensitive: Prisma.QueryMode;
    };
    Decimal: typeof Prisma.Decimal;
  };

  export const WorkTicketStatus: {
    readonly NEW: WorkTicketStatus;
    readonly IN_PROGRESS: WorkTicketStatus;
    readonly READY: WorkTicketStatus;
    readonly CLOSED: WorkTicketStatus;
  };

  export const WorkTicketEventType: {
    readonly CREATED: WorkTicketEventType;
    readonly NOTE: WorkTicketEventType;
    readonly PHOTO: WorkTicketEventType;
    readonly ESTIMATE_SET: WorkTicketEventType;
    readonly CUSTOMER_APPROVED: WorkTicketEventType;
    readonly CUSTOMER_DECLINED: WorkTicketEventType;
    readonly READY: WorkTicketEventType;
    readonly PICKED_UP: WorkTicketEventType;
  };

  export const ConsentChannel: {
    readonly whatsapp: ConsentChannel;
  };

  export const InventoryMoveType: {
    readonly IN: InventoryMoveType;
    readonly OUT: InventoryMoveType;
    readonly ADJUSTMENT: InventoryMoveType;
  };

  export const InvoiceStatus: {
    readonly DRAFT: InvoiceStatus;
    readonly SENT: InvoiceStatus;
    readonly PARTIALLY_PAID: InvoiceStatus;
    readonly PAID: InvoiceStatus;
    readonly VOID: InvoiceStatus;
  };

  export const PaymentMethod: {
    readonly CASH: PaymentMethod;
    readonly CARD: PaymentMethod;
    readonly TRANSFER: PaymentMethod;
    readonly EWALLET: PaymentMethod;
    readonly OTHER: PaymentMethod;
  };

  export class PrismaClient {
    constructor(options?: Record<string, unknown>);
    $transaction<T>(fn: (client: Prisma.TransactionClient) => Promise<T>): Promise<T>;
    $disconnect(): Promise<void>;
    [model: string]: any;
  }
}
