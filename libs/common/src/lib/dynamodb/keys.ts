/**
 * Single-Table Design — ResponseLens AI
 *
 *   1. Config usuario:  PK = USER#<userId>  SK = CONFIG
 *   2. Alerta rival:    PK = USER#<userId>  SK = ALERT#<detectedAt>#<alertId>
 *   3. Lookup alerta:   GSI1PK = ALERT#<alertId>  GSI1SK = USER#<userId>
 *   4. Job SocialCrawl: PK = JOB#SC#<jobId>  SK = RESULT  (TTL ~1h)
 *   5. Intel superficies: PK = USER#<userId>  SK = INTEL#<rivalKey>
 */

export const KeyPrefix = {
  User: 'USER#',
  Config: 'CONFIG',
  Alert: 'ALERT#',
  JobSc: 'JOB#SC#',
  Result: 'RESULT',
  Intel: 'INTEL#',
} as const;

export const DynamoKeys = {
  userPk(userId: string): string {
    return `${KeyPrefix.User}${userId}`;
  },

  configSk(): string {
    return KeyPrefix.Config;
  },

  alertSk(detectedAt: string, alertId: string): string {
    return `${KeyPrefix.Alert}${detectedAt}#${alertId}`;
  },

  alertSkPrefix(): string {
    return KeyPrefix.Alert;
  },

  alertGsi1Pk(alertId: string): string {
    return `${KeyPrefix.Alert}${alertId}`;
  },

  alertGsi1Sk(userId: string): string {
    return `${KeyPrefix.User}${userId}`;
  },

  intelSk(rivalKey: string): string {
    return `${KeyPrefix.Intel}${rivalKey}`;
  },

  socialCrawlJobPk(jobId: string): string {
    return `${KeyPrefix.JobSc}${jobId}`;
  },

  socialCrawlJobSk(): string {
    return KeyPrefix.Result;
  },
};
