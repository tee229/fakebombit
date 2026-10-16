export const requiredSlots = ['terrain.floor', 'terrain.solid', 'terrain.breakable', 'spawn.marker',
  'actor.player', 'actor.opponent', 'bomb.idle', 'hazard.fire', 'item.capacity', 'item.range', 'item.speed'] as const;
export type VisualSlot = typeof requiredSlots[number] | 'decoration.accent';
const semanticSlots = { floor: 'terrain.floor', 'solid-wall': 'terrain.solid', 'breakable-wall': 'terrain.breakable', spawn: 'spawn.marker',
  player: 'actor.player', opponent: 'actor.opponent', bomb: 'bomb.idle', fire: 'hazard.fire',
  'item.capacity': 'item.capacity', 'item.range': 'item.range', 'item.speed': 'item.speed' } as const;
export function visualSlotFor(type: keyof typeof semanticSlots): VisualSlot { return semanticSlots[type]; }
export interface ThemeResource {
  readonly id: string; readonly url: string; readonly width: number; readonly height: number;
  readonly frameWidth: number; readonly frameHeight: number; readonly required: boolean;
}
export interface VisualDefinition {
  readonly resource: string; readonly frames: readonly number[]; readonly framesPerSecond: number;
  readonly loop: boolean; readonly facing: 'none';
  readonly referenceSize: { readonly width: number; readonly height: number };
  readonly anchor: { readonly x: number; readonly y: number };
  readonly offset: { readonly x: number; readonly y: number };
}
export interface ThemePackage {
  readonly format: 'builtin-theme-v1'; readonly id: string; readonly label: string;
  readonly resources: readonly ThemeResource[];
  readonly slots: Readonly<Partial<Record<VisualSlot, VisualDefinition>>>;
  readonly skin?: SkinPackage;
}
export const skinActions = ['idle', 'move', 'eliminated'] as const;
export const skinDirections = ['up', 'right', 'down', 'left'] as const;
export type SkinAction = typeof skinActions[number];
export type SkinDirection = typeof skinDirections[number];
export interface SkinClip extends VisualDefinition { readonly flipX: boolean }
export interface SkinPackage {
  readonly format: 'builtin-skin-v1'; readonly id: string; readonly label: string;
  readonly resources: readonly ThemeResource[];
  readonly animations: Readonly<Record<SkinAction, Readonly<Record<SkinDirection, SkinClip>>>>;
}
export function withSkin(theme: ThemePackage, skin: SkinPackage): ThemePackage {
  return { ...theme, resources: [...theme.resources, ...skin.resources], skin };
}
export interface LoadedImage<T> { readonly value: T; readonly width: number; readonly height: number }
export interface PreparedImage<T> extends LoadedImage<T> { readonly key: string }
function imageKey(resource: ThemeResource): string {
  return JSON.stringify([resource.url, resource.width, resource.height, resource.frameWidth, resource.frameHeight]);
}
export interface ResourceDiagnostic { readonly resource: string; readonly message: string }
export interface ReadyTheme<T> {
  readonly id: string; readonly package: ThemePackage;
  readonly images: Readonly<Record<string, PreparedImage<T>>>;
  readonly diagnostics: readonly ResourceDiagnostic[];
}
export class ResourceError extends Error {
  constructor(readonly code: 'invalid-package' | 'load-failed' | 'size-mismatch', message: string) { super(message); this.name = 'ResourceError'; }
}
function sampleAnimation(definition: VisualDefinition, elapsedSeconds: number) {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) throw new RangeError('Visual time must be finite and nonnegative');
  const elapsedFrame = Math.floor(elapsedSeconds * definition.framesPerSecond);
  return {
    index: definition.loop ? elapsedFrame % definition.frames.length : Math.min(elapsedFrame, definition.frames.length - 1),
    finished: !definition.loop && elapsedFrame >= definition.frames.length,
  };
}
export function resolveVisual<T>(ready: ReadyTheme<T>, slot: VisualSlot, elapsedSeconds = 0) {
  const definition = ready.package.slots[slot];
  const image = definition && ready.images[definition.resource];
  if (!definition || !image) return null;
  const { index } = sampleAnimation(definition, elapsedSeconds);
  return { image, frame: definition.frames[index]!, referenceSize: definition.referenceSize, anchor: definition.anchor, offset: definition.offset, facing: definition.facing };
}
/** Presentation-only sampling; Phaser uses this same clip for actual Sprite playback. */
export function resolveSkinAnimation<T>(ready: ReadyTheme<T>, action: SkinAction, direction: SkinDirection, elapsedSeconds = 0) {
  const definition = ready.package.skin?.animations[action][direction];
  const image = definition && ready.images[definition.resource];
  if (!definition || !image) return null;
  const { index, finished } = sampleAnimation(definition, elapsedSeconds);
  return { image, frame: definition.frames[index]!, frameIndex: index, frames: definition.frames, framesPerSecond: definition.framesPerSecond,
    loop: definition.loop, flipX: definition.flipX, referenceSize: definition.referenceSize, anchor: definition.anchor, offset: definition.offset,
    finished };
}
export type PreparationResult<M> = { readonly status: 'ready'; readonly value: M } | { readonly status: 'failed'; readonly error: ResourceError } | { readonly status: 'cancelled' };

/** Application-owned resources; gameplay creation is a synchronous commit after preparation. */
export function createResourcePreparation<T>(load: (resource: ThemeResource) => Promise<LoadedImage<T>>) {
  let sequence = 0;
  let cancelPrevious: (() => void) | undefined;
  const cache = new Map<string, Promise<PreparedImage<T>>>();
  const cachedImage = (resource: ThemeResource): Promise<PreparedImage<T>> => {
    const key = imageKey(resource);
    const previous = cache.get(key);
    if (previous) return previous;
    const pending = load(resource).then(image => {
      if (image.width !== resource.width || image.height !== resource.height) throw new ResourceError('size-mismatch', `${resource.id}: image dimensions differ from the package`);
      return Object.freeze({ ...image, key });
    }).catch((error: unknown) => { cache.delete(key); throw error; });
    cache.set(key, pending);
    return pending;
  };
  return {
    start<M>(source: ThemePackage, beginMatch: (ready: ReadyTheme<T>) => M) {
      cancelPrevious?.();
      const id = ++sequence;
      let cancelled = false;
      let cancel!: () => void;
      const cancellation = new Promise<PreparationResult<M>>(resolve => { cancel = () => { cancelled = true; resolve({ status: 'cancelled' }); }; });
      cancelPrevious = cancel;
      const work: Promise<PreparationResult<M>> = (async () => {
        try {
          const { theme, diagnostics } = validateTheme(source);
          const images: Record<string, PreparedImage<T>> = {};
          for (const resource of theme.resources) {
            try {
              const image = await cachedImage(resource);
              if (cancelled) return { status: 'cancelled' };
              images[resource.id] = image;
            } catch (error) {
              if (resource.required) throw error;
              diagnostics.push({ resource: resource.id, message: error instanceof Error ? error.message : String(error) });
            }
          }
          if (cancelled) return { status: 'cancelled' };
          return { status: 'ready', value: beginMatch(Object.freeze({ id: theme.id, package: theme, images: Object.freeze(images), diagnostics: immutable(diagnostics) })) };
        } catch (error) {
          return { status: 'failed', error: error instanceof ResourceError ? error : new ResourceError('load-failed', error instanceof Error ? error.message : String(error)) };
        }
      })();
      return { id, completion: Promise.race([work, cancellation]), cancel };
    },
  };
}

function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function nonempty(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function positive(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value > 0; }
function point(value: unknown): value is { x: number; y: number } { return record(value) && Number.isFinite(value.x) && Number.isFinite(value.y); }
function dimension(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 4096; }
function imageDefinition(value: unknown): value is ThemeResource {
  return record(value) && nonempty(value.id) && nonempty(value.url) && typeof value.required === 'boolean'
    && dimension(value.width) && dimension(value.height) && dimension(value.frameWidth) && dimension(value.frameHeight)
    && value.width % value.frameWidth === 0 && value.height % value.frameHeight === 0;
}
function visualDefinition(value: unknown, resources: readonly ThemeResource[]): value is VisualDefinition {
  if (!record(value)) return false;
  const resource = resources.find(image => image.id === value.resource);
  return !!resource && Array.isArray(value.frames) && value.frames.length > 0
    && value.frames.every((frame: unknown) => typeof frame === 'number' && Number.isSafeInteger(frame) && frame >= 0 && frame < resource.width / resource.frameWidth * (resource.height / resource.frameHeight))
    && typeof value.framesPerSecond === 'number' && Number.isFinite(value.framesPerSecond) && value.framesPerSecond >= 0 && (value.frames.length === 1 || value.framesPerSecond > 0)
    && typeof value.loop === 'boolean' && value.facing === 'none'
    && record(value.referenceSize) && positive(value.referenceSize.width) && positive(value.referenceSize.height)
    && point(value.anchor) && value.anchor.x >= 0 && value.anchor.x <= 1 && value.anchor.y >= 0 && value.anchor.y <= 1 && point(value.offset);
}
function copyVisual<T extends VisualDefinition>(definition: T): T {
  return { ...definition, frames: [...definition.frames], referenceSize: { ...definition.referenceSize }, anchor: { ...definition.anchor }, offset: { ...definition.offset } };
}
function validateSkin(skin: SkinPackage, resources: readonly ThemeResource[]): SkinPackage {
  if (!record(skin) || skin.format !== 'builtin-skin-v1' || !nonempty(skin.id) || !nonempty(skin.label)
    || !Array.isArray(skin.resources) || skin.resources.length === 0 || !record(skin.animations)
    || skin.resources.some(resource => !imageDefinition(resource) || !resource.required || !resources.some(image => image.id === resource.id && image.required && imageKey(image) === imageKey(resource)))) {
    throw new ResourceError('invalid-package', 'Invalid required skin package');
  }
  const animations = {} as Record<SkinAction, Record<SkinDirection, SkinClip>>;
  for (const action of skinActions) {
    const directions = skin.animations[action];
    if (!record(directions)) throw new ResourceError('invalid-package', `Missing skin action: ${action}`);
    const clips = {} as Record<SkinDirection, SkinClip>;
    for (const direction of skinDirections) {
      const clip = directions[direction];
      if (!visualDefinition(clip, skin.resources) || typeof clip.flipX !== 'boolean' || clip.framesPerSecond <= 0
        || clip.loop !== (action !== 'eliminated')) throw new ResourceError('invalid-package', `Invalid skin animation: ${action}.${direction}`);
      clips[direction] = copyVisual(clip);
    }
    animations[action] = clips;
  }
  return { format: 'builtin-skin-v1', id: skin.id, label: skin.label, resources: skin.resources.map(resource => ({ ...resource })), animations };
}

function validateTheme(source: ThemePackage): { theme: ThemePackage; diagnostics: ResourceDiagnostic[] } {
  if (!record(source) || source.format !== 'builtin-theme-v1' || !nonempty(source.id) || !nonempty(source.label)
    || !Array.isArray(source.resources) || !record(source.slots)) throw new ResourceError('invalid-package', 'Unsupported or malformed built-in package');
  const resources: ThemeResource[] = [];
  const ids = new Set<string>();
  const diagnostics: ResourceDiagnostic[] = [];
  for (const resource of source.resources) {
    if (!imageDefinition(resource) || ids.has(resource.id)) {
      if (record(resource) && resource.required === false) { diagnostics.push({ resource: String(resource.id), message: 'Invalid optional image definition; omitted' }); continue; }
      throw new ResourceError('invalid-package', 'Invalid or duplicate required image definition');
    }
    ids.add(resource.id); resources.push({ ...resource });
  }
  for (const slot of requiredSlots) if (!source.slots[slot]) throw new ResourceError('invalid-package', `Missing required slot: ${slot}`);
  const slots: Partial<Record<VisualSlot, VisualDefinition>> = {};
  for (const slot of [...requiredSlots, 'decoration.accent'] as const) {
    const definition = source.slots[slot];
    if (!definition) continue;
    const resource = resources.find(image => image.id === definition.resource);
    const valid = resource && visualDefinition(definition, resources) && (slot === 'decoration.accent' || resource.required);
    if (!valid) {
      if (slot === 'decoration.accent') { diagnostics.push({ resource: String(definition.resource), message: `${slot}: invalid optional visual; omitted` }); continue; }
      throw new ResourceError('invalid-package', `${slot}: invalid required visual definition`);
    }
    slots[slot] = copyVisual(definition);
  }
  return { theme: immutable({ format: 'builtin-theme-v1', id: source.id, label: source.label, resources, slots,
    ...(source.skin !== undefined ? { skin: validateSkin(source.skin, resources) } : {}) }), diagnostics };
}

function immutable<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}
