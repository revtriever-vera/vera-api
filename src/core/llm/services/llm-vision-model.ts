import { LlmCredentials, LlmModelRole } from '../llm.types';

export function credentialsForRole(credentials: LlmCredentials, role: LlmModelRole, visionModel: string | undefined): LlmCredentials {
    if (role !== 'vision' || visionModel === undefined || credentials.driver !== 'gateway') {
        return credentials;
    }
    return { ...credentials, modelId: visionModel };
}
