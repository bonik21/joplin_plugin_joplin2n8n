export type DiffType = 'equal' | 'insert' | 'delete';

export interface DiffLine {
    type: DiffType;
    text: string;
    oldLineNum?: number;
    newLineNum?: number;
}

export type HunkType = 'modify' | 'add' | 'delete';
export type HunkDecision = 'pending' | 'accepted' | 'rejected';

export interface DiffHunk {
    id: number;
    type: HunkType;
    oldLines: string[];
    newLines: string[];
    oldStartLine: number;
    newStartLine: number;
    lines: DiffLine[];
    decision: HunkDecision;
}

export interface DiffSegment {
    type: 'equal' | 'hunk';
    lines?: string[];
    equalLines?: DiffLine[];
    hunkId?: number;
}

export interface DiffResult {
    hunks: DiffHunk[];
    allSegments: DiffSegment[];
    addedCount: number;
    deletedCount: number;
}

/**
 * 라인 단위 LCS 기반 Diff 계산
 */
export function computeLineDiff(oldText: string, newText: string): DiffResult {
    const oldLines = oldText ? oldText.split('\n') : [];
    const newLines = newText ? newText.split('\n') : [];

    const m = oldLines.length;
    const n = newLines.length;

    // LCS DP 테이블 구성
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

    for (let i = 0; i < m; i++) {
        for (let j = 0; j < n; j++) {
            if (oldLines[i] === newLines[j]) {
                dp[i + 1][j + 1] = dp[i][j] + 1;
            } else {
                dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
            }
        }
    }

    // Backtrack하여 diff 라인 목록 추출
    let i = m;
    let j = n;
    const rawDiff: DiffLine[] = [];

    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
            rawDiff.unshift({
                type: 'equal',
                text: oldLines[i - 1],
                oldLineNum: i,
                newLineNum: j,
            });
            i--;
            j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            rawDiff.unshift({
                type: 'insert',
                text: newLines[j - 1],
                newLineNum: j,
            });
            j--;
        } else {
            rawDiff.unshift({
                type: 'delete',
                text: oldLines[i - 1],
                oldLineNum: i,
            });
            i--;
        }
    }

    // rawDiff를 Equal 세그먼트와 Hunk로 묶기
    const allSegments: DiffSegment[] = [];
    const hunks: DiffHunk[] = [];
    let hunkCounter = 0;
    let addedCount = 0;
    let deletedCount = 0;

    let currentHunkLines: DiffLine[] = [];
    let currentEqualLines: DiffLine[] = [];

    const flushEqual = () => {
        if (currentEqualLines.length > 0) {
            allSegments.push({
                type: 'equal',
                lines: currentEqualLines.map(l => l.text),
                equalLines: [...currentEqualLines],
            });
            currentEqualLines = [];
        }
    };

    const flushHunk = () => {
        if (currentHunkLines.length > 0) {
            const oldLinesInHunk = currentHunkLines
                .filter(l => l.type === 'delete')
                .map(l => l.text);
            const newLinesInHunk = currentHunkLines
                .filter(l => l.type === 'insert')
                .map(l => l.text);

            let hunkType: HunkType = 'modify';
            if (oldLinesInHunk.length === 0) hunkType = 'add';
            else if (newLinesInHunk.length === 0) hunkType = 'delete';

            const firstOld = currentHunkLines.find(l => l.oldLineNum !== undefined);
            const firstNew = currentHunkLines.find(l => l.newLineNum !== undefined);

            const hunk: DiffHunk = {
                id: hunkCounter++,
                type: hunkType,
                oldLines: oldLinesInHunk,
                newLines: newLinesInHunk,
                oldStartLine: firstOld?.oldLineNum || 1,
                newStartLine: firstNew?.newLineNum || 1,
                lines: [...currentHunkLines],
                decision: 'pending',
            };

            hunks.push(hunk);
            allSegments.push({ type: 'hunk', hunkId: hunk.id });
            currentHunkLines = [];
        }
    };

    for (const d of rawDiff) {
        if (d.type === 'equal') {
            flushHunk();
            currentEqualLines.push(d);
        } else {
            flushEqual();
            currentHunkLines.push(d);
            if (d.type === 'insert') addedCount++;
            if (d.type === 'delete') deletedCount++;
        }
    }
    flushHunk();
    flushEqual();

    return {
        hunks,
        allSegments,
        addedCount,
        deletedCount,
    };
}

/**
 * Hunk 결정 상태에 따라 최종 텍스트 재구성
 *
 * 규칙:
 * - 수정된 내용 (modify):
 *   - 'accepted' -> '수정 후' 내용(newLines) 사용
 *   - 'rejected' -> '수정 전' 내용(oldLines) 유지
 * - 추가된 내용 (add):
 *   - 'accepted' -> 추가된 내용 유지(newLines)
 *   - 'rejected' -> 추가된 내용 제거
 * - 삭제된 내용 (delete):
 *   - 'accepted' -> 삭제된 내용 유지 (즉 본문에서 삭제)
 *   - 'rejected' -> 삭제를 취소하고 기존 내용(oldLines) 유지
 */
export function reconstructText(
    diffResult: DiffResult,
    decisions: Record<number, HunkDecision>,
    unresolvedFallback: 'accepted' | 'rejected'
): string {
    const resultLines: string[] = [];
    const hunkMap = new Map(diffResult.hunks.map(h => [h.id, h]));

    for (const seg of diffResult.allSegments) {
        if (seg.type === 'equal' && seg.lines) {
            resultLines.push(...seg.lines);
        } else if (seg.type === 'hunk' && seg.hunkId !== undefined) {
            const hunk = hunkMap.get(seg.hunkId);
            if (!hunk) continue;

            let decision = decisions[hunk.id] || hunk.decision;
            if (decision === 'pending') {
                decision = unresolvedFallback;
            }

            if (decision === 'accepted') {
                if (hunk.type === 'modify' || hunk.type === 'add') {
                    resultLines.push(...hunk.newLines);
                }
                // delete의 accepted는 본문에서 삭제(출력 안함)
            } else {
                // rejected
                if (hunk.type === 'modify' || hunk.type === 'delete') {
                    resultLines.push(...hunk.oldLines);
                }
                // add의 rejected는 추가 취소(출력 안함)
            }
        }
    }

    return resultLines.join('\n');
}
