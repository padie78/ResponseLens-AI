/**
 * Port: links / paquetes compartibles (ficha rival, oportunidad).
 */

export type ShareKind = 'opportunity' | 'rival_ficha';

export interface SharePackage {
  shareId: string;
  kind: ShareKind;
  createdAt: string;
  expiresAt: string;
  title: string;
  /** Payload sanitizado (sin tokens). */
  data: Record<string, unknown>;
}

export interface CreateShareInput {
  kind: ShareKind;
  title: string;
  data: Record<string, unknown>;
  /** TTL en horas (default 168 = 7d). */
  ttlHours?: number;
}

export interface IShareLinkPort {
  create(input: CreateShareInput): Promise<SharePackage>;
  get(shareId: string): Promise<SharePackage | null>;
}
