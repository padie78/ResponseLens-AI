import {
  AnalyzeReplyUseCase,
  AnalyzeRivalReportUseCase,
  GetUserConfigUseCase,
  ListCompetitorAlertsUseCase,
  SaveUserConfigUseCase,
} from '@responselens/application';
import {
  DynamoDbCompetitorAlertRepository,
  DynamoDbUserConfigRepository,
  OpenAiReplyLlmAdapter,
} from '@responselens/infrastructure';

const userConfigs = new DynamoDbUserConfigRepository();
const alerts = new DynamoDbCompetitorAlertRepository();
const llm = new OpenAiReplyLlmAdapter();

export const analyzeReply = new AnalyzeReplyUseCase(llm);
export const analyzeRivalReport = new AnalyzeRivalReportUseCase(llm);
export const getUserConfig = new GetUserConfigUseCase(userConfigs);
export const saveUserConfig = new SaveUserConfigUseCase(userConfigs);
export const listCompetitorAlerts = new ListCompetitorAlertsUseCase(alerts);
