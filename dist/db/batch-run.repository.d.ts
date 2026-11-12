export interface BatchRun {
    id: string;
    batchId: string;
    status: 'pending' | 'completed' | 'failed';
    jobIds: string[];
    jobsFetched: number;
    runId?: string;
    submittedAt: Date;
    completedAt?: Date;
    errorMessage?: string;
}
export declare class BatchRunRepository {
    createBatchRun(batchId: string, jobIds: string[], jobsFetched: number, runId?: string): Promise<string>;
    getPendingBatches(): Promise<BatchRun[]>;
    completeBatch(id: string): Promise<void>;
    failBatch(id: string, errorMessage: string): Promise<void>;
    failStaleBatches(): Promise<void>;
}
//# sourceMappingURL=batch-run.repository.d.ts.map