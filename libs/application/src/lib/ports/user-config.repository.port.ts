import type { UserConfig } from '@responselens/domain';

export interface IUserConfigRepository {
  findByUserId(userId: string): Promise<UserConfig | null>;
  save(config: UserConfig): Promise<UserConfig>;
  listAll(): Promise<UserConfig[]>;
}
