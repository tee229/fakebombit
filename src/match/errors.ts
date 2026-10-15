export type MatchErrorCode = 'invalid-config' | 'unknown-entity-type' | 'invalid-map' | 'invalid-intent' | 'generation-failed';
export class MatchError extends Error {
  constructor(readonly code: MatchErrorCode, message: string) {
    super(message);
    this.name = 'MatchError';
  }
}
