import { Application, ApplicationStatus } from '../types';
export declare class ApplicationRepository {
    recordApplication(jobId: string): Promise<Application>;
    getApplications(): Promise<ApplicationWithJob[]>;
    getRecentApplications(limit?: number): Promise<ApplicationWithJob[]>;
    updateApplicationStatus(jobId: string, status: ApplicationStatus): Promise<Application | null>;
}
export interface ApplicationWithJob {
    id: string;
    jobId: string;
    appliedAt: Date;
    status: ApplicationStatus;
    title: string;
    company: string;
    location?: string;
    applyUrl: string;
}
//# sourceMappingURL=application.repository.d.ts.map