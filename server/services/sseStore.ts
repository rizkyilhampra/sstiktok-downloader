import type { Response } from 'express';
import type { SseProgressEvent } from '../types/server.js';

const sseConnections = new Map<string, Response>();

export function registerSse(requestId: string, res: Response): void {
  sseConnections.set(requestId, res);
}

export function removeSse(requestId: string): void {
  sseConnections.delete(requestId);
}

export function getSse(requestId: string): Response | undefined {
  return sseConnections.get(requestId);
}

export function sendProgress(requestId: string, data: SseProgressEvent): void {
  const connection = sseConnections.get(requestId);
  if (connection) {
    connection.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}
