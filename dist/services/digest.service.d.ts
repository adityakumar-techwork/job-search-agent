export declare class DigestService {
    private readonly mailgunApiKey;
    private readonly mailgunDomain;
    private readonly mailgunBaseUrl;
    private readonly recipientEmail;
    private readonly digestRepo;
    constructor(mailgunApiKey: string, mailgunDomain: string, mailgunBaseUrl: string, recipientEmail: string);
    send(): Promise<void>;
    private buildHtml;
    private jobCard;
    private escape;
    private sendEmail;
}
//# sourceMappingURL=digest.service.d.ts.map