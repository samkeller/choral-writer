import type { ChatBranch } from '@choral-writer/shared';

import { ApiError } from '../../../errors/errors.js';
import type { ChatBranchRepository } from '../repositories/branchRepository.js';

export class ChatBranchService {
  constructor(private readonly repository: ChatBranchRepository) {}

  list(): Promise<ChatBranch[]> {
    return this.repository.list();
  }

  async get(id: string): Promise<ChatBranch> {
    const branch = await this.repository.find(id);
    if (!branch) throw new ApiError(404, 'CHAT_BRANCH_NOT_FOUND', 'Cette branche n\'existe pas dans ce projet.');
    return branch;
  }

  createMain(): Promise<ChatBranch> {
    return this.repository.create({ name: 'Principale', sourceBranchId: null, forkTurnId: null });
  }

  async fork(source: ChatBranch, parentTurnId: string | null): Promise<ChatBranch> {
    const existing = await this.repository.list();
    return this.repository.create({
      name: `Alternative ${existing.length}`, sourceBranchId: source.id, forkTurnId: parentTurnId,
    });
  }

  advance(id: string, headTurnId: string): Promise<void> {
    return this.repository.setHead(id, headTurnId);
  }
}
