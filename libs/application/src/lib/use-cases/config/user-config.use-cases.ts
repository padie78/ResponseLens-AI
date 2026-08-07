import { ValidationError, type UserConfig } from '@responselens/domain';
import type { SaveUserConfigInputDto, UserConfigDto } from '../../dto';
import type { IUserConfigRepository } from '../../ports';

export class SaveUserConfigUseCase {
  constructor(private readonly repository: IUserConfigRepository) {}

  async execute(input: SaveUserConfigInputDto): Promise<UserConfigDto> {
    if (!input.userId?.trim()) {
      throw new ValidationError('userId is required');
    }
    if (!input.company?.companyName?.trim()) {
      throw new ValidationError('company.companyName is required');
    }

    const config: UserConfig = {
      userId: input.userId.trim(),
      company: input.company,
      competitors: Array.isArray(input.competitors) ? input.competitors : [],
      updatedAt: new Date().toISOString(),
    };

    return this.repository.save(config);
  }
}

export class GetUserConfigUseCase {
  constructor(private readonly repository: IUserConfigRepository) {}

  async execute(input: { userId: string }): Promise<UserConfigDto | null> {
    if (!input.userId?.trim()) {
      throw new ValidationError('userId is required');
    }
    return this.repository.findByUserId(input.userId.trim());
  }
}
