import type {
	SerializedOrganization,
	SerializedProject,
	SerializedUser,
	SerializedApiKey,
	SerializedApiKeyIamRule,
} from "@llmgateway/db";

export type Organization = SerializedOrganization;
export type Project = SerializedProject;
export type User = SerializedUser | null;

export type ApiKey = Omit<
	SerializedApiKey,
	| "token"
	| "expiresAt"
	| "gracePeriodEndsAt"
	| "lastRotationAt"
	| "lastExpiryWarningSentAt"
	| "lineageId"
	| "rotationPeriodDays"
	| "rotatedFromId"
	| "inactivityTimeoutDays"
	| "disabledReason"
	| "costCenter"
> & {
	currentPeriodResetAt: string | null;
	maskedToken: string;
	iamRules?: Omit<SerializedApiKeyIamRule, "apiKeyId">[];
	expiresAt?: string | null;
	gracePeriodEndsAt?: string | null;
	lastRotationAt?: string | null;
	lastExpiryWarningSentAt?: string | null;
	lineageId?: string | null;
	rotationPeriodDays?: number | null;
	rotatedFromId?: string | null;
	inactivityTimeoutDays?: number | null;
	disabledReason?: string | null;
	costCenter?: string | null;
};
