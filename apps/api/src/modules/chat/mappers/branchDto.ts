import type { ChatBranch, ChatBranchDto } from '@choral-writer/shared';

export function toChatBranchDto(branch: ChatBranch): ChatBranchDto {
  return {
    id: branch.id,
    projectId: branch.projectId,
    name: branch.name,
    sourceBranchId: branch.sourceBranchId,
    forkTurnId: branch.forkTurnId,
    headTurnId: branch.headTurnId,
    createdAt: branch.createdAt.toISOString(),
  };
}
