import { AgentMemory } from '../types';
export declare class AgentMemoryRepository {
    getAll(): Promise<AgentMemory[]>;
    upsertPattern(pattern: Pick<AgentMemory, 'patternName' | 'patternType' | 'patternData' | 'confidenceScore' | 'observationCount'>): Promise<void>;
    upsertAll(patterns: Pick<AgentMemory, 'patternName' | 'patternType' | 'patternData' | 'confidenceScore' | 'observationCount'>[]): Promise<void>;
}
//# sourceMappingURL=agent-memory.repository.d.ts.map