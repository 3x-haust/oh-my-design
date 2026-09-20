import { readReferenceBoardArtifacts, sha256 } from '../ref/board-artifacts.ts';
import { requireDesignJudgmentForReferences } from './judgment-files.ts';
import { checkDesignHypothesis } from './judgment.ts';

export function designJudgmentInput(root: string) {
  const board = readReferenceBoardArtifacts(root);
  return { referenceBoardSha256: sha256(board.boardBytes), board: board.raw };
}

export function checkCurrentDesignJudgment(root: string) {
  const { referenceBoardSha256 } = designJudgmentInput(root);
  const record = requireDesignJudgmentForReferences(root, referenceBoardSha256);
  const findings = checkDesignHypothesis(record.hypothesis);
  return { ok: findings.length === 0, referenceBoardSha256, findings };
}
