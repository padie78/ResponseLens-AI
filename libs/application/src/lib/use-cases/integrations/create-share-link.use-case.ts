import type { CreateShareInput, IShareLinkPort, SharePackage } from '../../ports/share-link.port';

export class CreateShareLinkUseCase {
  constructor(private readonly shares: IShareLinkPort) {}

  async execute(input: CreateShareInput): Promise<SharePackage> {
    if (!input.title?.trim()) throw new Error('Share title required');
    if (!input.data || typeof input.data !== 'object') throw new Error('Share data required');
    return this.shares.create(input);
  }
}
