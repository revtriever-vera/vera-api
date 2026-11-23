import { IntegrationCredential, IntegrationItem, IntegrationKind, IntegrationPublicFields } from './integration.types';

function publicFieldsOf(row: IntegrationCredential): IntegrationPublicFields {
    const fields: IntegrationPublicFields = {};
    if (row.baseUrl !== null) {
        fields.baseUrl = row.baseUrl;
    }
    if (row.model !== null) {
        fields.model = row.model;
    }
    if (row.phoneNumberId !== null) {
        fields.phoneNumberId = row.phoneNumberId;
    }
    if (row.clientId !== null) {
        fields.clientId = row.clientId;
    }
    return fields;
}

export function toIntegrationItem(kind: IntegrationKind, rows: readonly IntegrationCredential[]): IntegrationItem {
    const row: IntegrationCredential | undefined = rows.find((candidate: IntegrationCredential): boolean => candidate.kind === kind);
    if (row === undefined) {
        return { kind, configured: false, hint: null, public: {}, verifiedAt: null };
    }
    return { kind, configured: true, hint: row.hint, public: publicFieldsOf(row), verifiedAt: row.verifiedAt.toISOString() };
}
