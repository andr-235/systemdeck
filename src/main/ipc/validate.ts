export function assertNoPayload(request: unknown, channel: string): void {
  if (request !== undefined && request !== null) {
    throw new Error(`Invalid ${channel} payload`);
  }
}
