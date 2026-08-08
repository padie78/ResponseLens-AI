import {
  AnalyzeReplyUseCase,
  AnalyzeRivalReportUseCase,
  GetUserConfigUseCase,
  ListCompetitorAlertsUseCase,
  SaveUserConfigUseCase,
  UpdateCompetitorAlertUseCase,
  UpsertCompetitorAlertUseCase,
} from '@responselens/application';
import {
  AppSyncCompetitorAlertPublisher,
  DynamoDbCompetitorAlertRepository,
  DynamoDbUserConfigRepository,
  OpenAiReplyLlmAdapter,
} from '@responselens/infrastructure';

const userConfigs = new DynamoDbUserConfigRepository();
const alerts = new DynamoDbCompetitorAlertRepository();
const llm = new OpenAiReplyLlmAdapter();
const publisher = new AppSyncCompetitorAlertPublisher();

export const analyzeReply = new AnalyzeReplyUseCase(llm);
export const analyzeRivalReport = new AnalyzeRivalReportUseCase(llm);
export const getUserConfig = new GetUserConfigUseCase(userConfigs);
export const saveUserConfig = new SaveUserConfigUseCase(userConfigs);
export const listCompetitorAlerts = new ListCompetitorAlertsUseCase(alerts);
export const upsertCompetitorAlert = new UpsertCompetitorAlertUseCase(alerts, publisher);
export const updateCompetitorAlert = new UpdateCompetitorAlertUseCase(alerts);
