import axios from 'axios';
import { resetGeminiStateForTests } from '../src/utils/gemini-retry';
import { TokenBudgetService } from '../src/services/token-budget.service';
import { ClaudeService } from '../src/services/claude.service';
import { AutonomousAgent, patternsFromLearning } from '../src/services/agent.service';
import { agentContext } from '../src/agent/context';
import { ResumeRepository } from '../src/db/resume.repository';
import { AgentMemoryRepository } from '../src/db/agent-memory.repository';
import { RunningAgentContext, Job } from '../src/types';
import { closePool } from '../src/db/client';
import { logger } from '../src/utils/logger';

// Matches TokenBudgetService's private safetyMargin (see its CONTEXT WINDOW BUDGET comment).
const SAFETY_MARGIN = 150_000;

afterAll(async () => {
  await closePool();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeContext(overrides: Partial<RunningAgentContext> = {}): RunningAgentContext {
  return {
    resume: {
      redactedText: 'Senior Software Engineer, 7 years, Java, Spring Boot, Kafka',
      hash: 'abc123',
      metadata: {
        resumeHash: 'abc123',
        resumeRedacted: 'Senior Software Engineer, 7 years, Java, Spring Boot, Kafka',
        isCurrent: true,
        yearsExperience: 7,
        technologies: ['Java', 'Spring Boot', 'Kafka'],
        companies: ['Google', 'Microsoft'],
      },
    },
    memory: [],
    appliedJobs: [],
    currentStrategy: 'Prioritize remote Java roles',
    jobsToAnalyze: [],
    analyses: [],
    ...overrides,
  };
}

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    source: 'test',
    externalId: 'test-1',
    title: 'Senior Software Engineer',
    company: 'Acme Corp',
    description: 'Java, Spring Boot, Kafka — distributed systems role',
    location: 'Remote',
    applyUrl: 'https://acme.com/jobs/1',
    isActive: true,
    ...overrides,
  };
}

function makeMockClaudeService(callResponse = 'Focus on remote Java roles.'): jest.Mocked<ClaudeService> {
  return {
    call: jest.fn().mockResolvedValue(callResponse),
    getTokenUsage: jest.fn().mockReturnValue({ input: 0, output: 0 }),
  } as unknown as jest.Mocked<ClaudeService>;
}

function makeMockResumeRepo(meta = makeContext().resume.metadata): jest.Mocked<ResumeRepository> {
  return { getResumeMetadata: jest.fn().mockResolvedValue(meta) } as unknown as jest.Mocked<ResumeRepository>;
}

function makeMockMemoryRepo(patterns = []): jest.Mocked<AgentMemoryRepository> {
  return {
    getAll: jest.fn().mockResolvedValue(patterns),
    upsertAll: jest.fn().mockResolvedValue(undefined),
    upsertPattern: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<AgentMemoryRepository>;
}

const fakeConfig = {
  jobTitles: ['Senior Software Engineer'],
  locationPriority: ['remote', 'bangalore-ncr'],
  llmApiKey: 'test-gemini-key',
  patternConfidenceThreshold: 0,
  enablePatternLearning: true,
  agentMemoryRetentionDays: 90,
  excludeKeywords: [],
  preferredTechnicalStack: [],
  yearsExperience: 7,
} as never;

// ── TokenBudgetService ────────────────────────────────────────────────────────

describe('TokenBudgetService', () => {
  it('validateForAnalysis() returns true when total is within the safety margin', () => {
    const budget = new TokenBudgetService();
    expect(budget.validateForAnalysis('short resume', [], [])).toBe(true);
  });

  it('validateForAnalysis() logs a budget breakdown with the correct buffer', () => {
    const spy = jest.spyOn(logger, 'info');
    const budget = new TokenBudgetService();
    budget.validateForAnalysis('Senior Software Engineer, 7 years, Java, Spring Boot, Kafka', [], []);

    const call = spy.mock.calls.find(([message]) => message === 'Token budget validated');
    expect(call).toBeDefined();
    const context = call?.[1] as { total: number; buffer: number } | undefined;
    expect(context?.buffer).toBe(SAFETY_MARGIN - (context?.total ?? 0));
    expect(context?.buffer).toBeGreaterThan(0);
    spy.mockRestore();
  });

  it('validateForAnalysis() returns false and logs an error when the safety margin is exceeded', () => {
    const spy = jest.spyOn(logger, 'error');
    const budget = new TokenBudgetService();
    // ~4 chars/token, so 700K chars ≈ 175K tokens — comfortably over the 150K margin.
    const hugeJob = makeJob({ description: 'x'.repeat(700_000) });

    expect(budget.validateForAnalysis('short resume', [], [hugeJob])).toBe(false);
    expect(spy).toHaveBeenCalledWith(
      'Token budget exceeded — aborting before Claude API calls',
      expect.any(Object),
    );
    spy.mockRestore();
  });

  it('locationCaps() distributes 30 jobs across 3 priorities as 15/10/5', () => {
    const budget = new TokenBudgetService();
    const caps = budget.locationCaps(['remote', 'bangalore-ncr', 'other']);
    expect(caps.get('remote')).toBe(15);
    expect(caps.get('bangalore-ncr')).toBe(10);
    expect(caps.get('other')).toBe(5);
    const total = [...caps.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(30);
  });

  it('locationCaps() distributes 30 jobs across 2 priorities as 20/10', () => {
    const budget = new TokenBudgetService();
    const caps = budget.locationCaps(['remote', 'bangalore-ncr']);
    expect(caps.get('remote')).toBe(20);
    expect(caps.get('bangalore-ncr')).toBe(10);
    expect([...caps.values()].reduce((a, b) => a + b, 0)).toBe(30);
  });

  it('locationCaps() assigns all 30 slots to a single priority', () => {
    const budget = new TokenBudgetService();
    const caps = budget.locationCaps(['remote']);
    expect(caps.get('remote')).toBe(30);
  });

  it('locationCaps() returns an empty map for an empty priority list', () => {
    const budget = new TokenBudgetService();
    expect(budget.locationCaps([]).size).toBe(0);
  });
});

// ── ClaudeService ─────────────────────────────────────────────────────────────

describe('ClaudeService', () => {
  beforeEach(() => resetGeminiStateForTests());
  afterEach(() => jest.restoreAllMocks());

  function gemini(text: string) {
    return { data: { candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 42, candidatesTokenCount: 13 } } };
  }

  it('instantiates without throwing given an API key, model, and maxTokens', () => {
    expect(() => new ClaudeService('test-gemini-key', 'gemini-test', 4096)).not.toThrow();
  });

  it('calls Gemini with the configured model (key in header) and returns text', async () => {
    const post = jest.spyOn(axios, 'post').mockResolvedValue(gemini('Strategy: focus on Bangalore backend roles.'));
    const service = new ClaudeService('test-gemini-key', 'gemini-test', 4096);

    const result = await service.call('What is your strategy?');

    expect(result).toContain('Strategy');
    const [url, , cfg] = post.mock.calls[0] as [string, unknown, { headers: Record<string, string> }];
    expect(url).toMatch(/\/models\/gemini-test:generateContent$/);
    expect(cfg.headers['x-goog-api-key']).toBe('test-gemini-key');
    expect(service.getTokenUsage()).toEqual({ input: 42, output: 13 });
  });

  it('falls back to the next model when the configured one is retired (404)', async () => {
    const post = jest
      .spyOn(axios, 'post')
      .mockRejectedValueOnce(Object.assign(new Error('Not Found'), { response: { status: 404 } }))
      .mockResolvedValueOnce(gemini('ok'));
    const service = new ClaudeService('test-gemini-key', 'gemini-retired', 4096, { fallbackModels: ['gemini-backup'] });

    expect(await service.call('hi')).toBe('ok');
    expect(post.mock.calls[1][0]).toContain('/models/gemini-backup:');
  });

  it('does not retry configuration errors such as 400 / 403', async () => {
    const post = jest
      .spyOn(axios, 'post')
      .mockRejectedValue(Object.assign(new Error('Forbidden'), { response: { status: 403 } }));
    const service = new ClaudeService('test-gemini-key', 'gemini-test', 4096, { fallbackModels: ['gemini-backup'] });
    await expect(service.call('hi')).rejects.toThrow('Forbidden');
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('treats an empty (safety-blocked) response as an error', async () => {
    jest.spyOn(axios, 'post').mockResolvedValue({ data: { candidates: [{ finishReason: 'SAFETY' }] } });
    const service = new ClaudeService('test-gemini-key', 'gemini-test', 4096);
    await expect(service.call('hi')).rejects.toThrow('finishReason=SAFETY');
  });
});

// ── AutonomousAgent ───────────────────────────────────────────────────────────

describe('AutonomousAgent', () => {
  function makeAgent(
    claudeService = makeMockClaudeService(),
    memoryRepo = makeMockMemoryRepo(),
    resumeRepo = makeMockResumeRepo(),
  ): AutonomousAgent {
    return new AutonomousAgent(
      fakeConfig,
      resumeRepo,
      memoryRepo,
      claudeService,
      new TokenBudgetService(),
    );
  }

  it('observe() loads resume from agentContext and memory from DB', async () => {
    const memoryRepo = makeMockMemoryRepo();
    const agent = makeAgent(makeMockClaudeService(), memoryRepo);

    const ctx = await agent.observe();

    expect(ctx.resume.hash).toBe('abc123');
    expect(memoryRepo.getAll).toHaveBeenCalledTimes(1);
    expect(Array.isArray(ctx.memory)).toBe(true);
  });

  it('assess() returns a non-empty strategy string from Claude', async () => {
    const claude = makeMockClaudeService('Prioritize remote distributed-systems roles at Series B companies.');
    const agent = makeAgent(claude);
    const strategy = await agent.assess(makeContext());

    expect(typeof strategy).toBe('string');
    expect(strategy.length).toBeGreaterThan(0);
    expect(claude.call).toHaveBeenCalledTimes(1);
  });

  it('runDailyLoop() validates token budget before any API call', async () => {
    const claude = makeMockClaudeService();
    const budget = new TokenBudgetService();
    const validateSpy = jest.spyOn(budget, 'validateForAnalysis').mockReturnValue(true);
    const agent = new AutonomousAgent(fakeConfig, makeMockResumeRepo(), makeMockMemoryRepo(), claude, budget);

    await agent.runDailyLoop();

    expect(validateSpy).toHaveBeenCalledTimes(1);
    // validateForAnalysis() runs after assess() (which calls Claude for strategy) but strictly
    // before any per-job analysis call, so call order still matters here.
    const validateOrder = validateSpy.mock.invocationCallOrder[0];
    const claudeCallOrder = (claude.call as jest.Mock).mock.invocationCallOrder[0];
    expect(validateOrder).toBeGreaterThan(claudeCallOrder);
  });

  it('runDailyLoop() halts immediately if token budget is exceeded', async () => {
    const claude = makeMockClaudeService();
    const budget = new TokenBudgetService();
    jest.spyOn(budget, 'validateForAnalysis').mockReturnValue(false);
    const agent = new AutonomousAgent(fakeConfig, makeMockResumeRepo(), makeMockMemoryRepo(), claude, budget);

    await agent.runDailyLoop();

    // assess() still calls Claude once (for strategy); analyzeJobs() must never be reached.
    expect(claude.call).toHaveBeenCalledTimes(1);
  });

  it('analyzeJobs() continues when one job fails, returning the rest', async () => {
    const claude = makeMockClaudeService();
    (claude.call as jest.Mock)
      .mockRejectedValueOnce(new Error('Claude timeout'))  // first job fails
      .mockResolvedValueOnce(
        JSON.stringify({                                    // second job succeeds
          relevance_score: 80,
          interview_chance: 65,
          location_category: 'remote',
          overall_category: 'auto-flag',
          relevance_reasoning: 'Strong Java match',
          insights: 'Distributed systems experience valued',
          matched_patterns: [],
        }),
      );

    const agent = makeAgent(claude);
    const jobs = [makeJob({ id: 'j1', title: 'Job 1' }), makeJob({ id: 'j2', title: 'Job 2' })];
    const analyses = await agent.analyzeJobs(jobs, makeContext());

    expect(analyses).toHaveLength(1);
    expect(analyses[0].relevance_score).toBe(80);
  });

  it('analyzeJob() parses Claude JSON response into a JobAnalysis', async () => {
    const jsonResponse = JSON.stringify({
      relevance_score: 88,
      interview_chance: 70,
      location_category: 'remote',
      overall_category: 'auto-flag',
      relevance_reasoning: 'Perfect Java/Kafka match',
      insights: 'Company uses distributed systems at scale',
      matched_patterns: ['kafka_expertise'],
      cover_letter_draft: 'I am excited to apply...',
    });
    const claude = makeMockClaudeService(jsonResponse);
    const agent = makeAgent(claude);

    const analysis = await agent.analyzeJob(makeJob(), makeContext());

    expect(analysis.relevance_score).toBe(88);
    expect(analysis.overall_category).toBe('auto-flag');
    expect(analysis.matched_patterns).toContain('kafka_expertise');
    expect(analysis.cover_letter_draft).toBeTruthy();
  });

  it('learnPatterns() returns empty array when no analyses provided', async () => {
    const agent = makeAgent();
    const patterns = await agent.learnPatterns([], []);
    expect(patterns).toHaveLength(0);
  });

  it('selectJobsForAnalysis() respects per-location caps and total cap', () => {
    // fakeConfig has locationPriority: ['remote', 'bangalore-ncr']
    // 2 priorities → caps: remote=20, bangalore-ncr=10
    const agent = makeAgent();
    const jobs = [
      ...Array.from({ length: 25 }, (_, i) =>
        makeJob({ id: `r${i}`, externalId: `r${i}`, locationCategory: 'remote' }),
      ),
      ...Array.from({ length: 15 }, (_, i) =>
        makeJob({ id: `w${i}`, externalId: `w${i}`, locationCategory: 'bangalore-ncr' }),
      ),
    ];

    const selected = agent.selectJobsForAnalysis(jobs);

    const remoteCount = selected.filter((j) => j.locationCategory === 'remote').length;
    const hubCount = selected.filter((j) => j.locationCategory === 'bangalore-ncr').length;

    // Supply exceeds caps in both locations, so we should hit the caps exactly
    expect(selected.length).toBe(30);
    expect(remoteCount).toBe(20);
    expect(hubCount).toBe(10);
  });

  it('selectJobsForAnalysis() takes all available jobs when supply is below cap', () => {
    const agent = makeAgent();
    const jobs = [
      makeJob({ id: 'r1', externalId: 'r1', locationCategory: 'remote' }),
      makeJob({ id: 'w1', externalId: 'w1', locationCategory: 'bangalore-ncr' }),
    ];

    const selected = agent.selectJobsForAnalysis(jobs);
    expect(selected).toHaveLength(2);
  });

  it('selectJobsForAnalysis() excludes jobs whose location is not in locationPriority', () => {
    const agent = makeAgent();
    const jobs = [
      makeJob({ id: 'r1', externalId: 'r1', locationCategory: 'remote' }),
      makeJob({ id: 'o1', externalId: 'o1', locationCategory: 'other' }),
    ];

    // fakeConfig locationPriority = ['remote', 'bangalore-ncr'] — 'other' gets cap 0
    const selected = agent.selectJobsForAnalysis(jobs);
    expect(selected.every((j) => j.locationCategory !== 'other')).toBe(true);
  });
});
// ── Learning → memory, and run-level failure detection ──────────────────────

describe('patternsFromLearning', () => {
  it('creates one focus_* pattern per focus area with evidence-based confidence', () => {
    const analyses = [
      { job_id: 'a', company: 'X', relevance_score: 90, interview_chance: 50, location_category: 'remote', overall_category: 'auto-flag', relevance_reasoning: '', insights: '', matched_patterns: ['Java'] },
      { job_id: 'b', company: 'Y', relevance_score: 40, interview_chance: 20, location_category: 'remote', overall_category: 'skip', relevance_reasoning: '', insights: '', matched_patterns: [] },
    ];
    const patterns = patternsFromLearning(
      { topSkillsMatched: ['Java'], commonGaps: ['Kubernetes'], recommendedFocus: ['Java', 'Spring Boot'], bestJobCategories: [] },
      analyses,
    );
    expect(patterns.map((p) => p.patternName)).toEqual(['focus_java', 'focus_spring_boot']);
    expect(patterns[0].confidenceScore).toBe(0.9); // matched the only non-skip job → 0.3 + 1.0 * 0.6
    expect(patterns[1].confidenceScore).toBe(0.3); // no evidence today → floor
    expect(patterns[0].patternData).toEqual({ topSkills: ['Java'], gaps: ['Kubernetes'], categories: [] });
  });
});

describe('AutonomousAgent run failure detection', () => {
  it('fails the run when every job analysis fails (e.g. bad API key) instead of reporting success', async () => {
    const jobs = [
      makeJob({ id: 'j1', locationCategory: 'remote' }),
      makeJob({ id: 'j2', externalId: 'j2', applyUrl: 'https://acme.com/jobs/2', locationCategory: 'remote' }),
    ];
    const aggregator = { fetchAndStoreJobs: jest.fn().mockResolvedValue(jobs) };
    const jobRepo = { getUnanalyzedJobs: jest.fn().mockResolvedValue(jobs) };
    const analysis = {
      analyzeJob: jest.fn().mockRejectedValue(new Error('403 Forbidden')),
      learnPatterns: jest.fn(),
      getTokenUsage: jest.fn().mockReturnValue({ input: 0, output: 0, cacheCreation: 0, cacheRead: 0 }),
    };
    const runs = { startRun: jest.fn().mockResolvedValue('run-1'), failRun: jest.fn(), completeRun: jest.fn() };
    agentContext.resume = makeContext().resume;
    const agent = new AutonomousAgent(
      { ...(fakeConfig as object), locationPriority: ['remote'] } as never,
      makeMockResumeRepo(),
      makeMockMemoryRepo(),
      makeMockClaudeService(),
      new TokenBudgetService(),
      aggregator as never,
      analysis as never,
      undefined,
      jobRepo as never,
      runs as never,
    );

    await expect(agent.runDailyLoop()).rejects.toThrow('All 2 job analyses failed');
    expect(runs.failRun).toHaveBeenCalledWith('run-1', expect.stringContaining('All 2 job analyses failed'));
    expect(runs.completeRun).not.toHaveBeenCalled();
  });
});
