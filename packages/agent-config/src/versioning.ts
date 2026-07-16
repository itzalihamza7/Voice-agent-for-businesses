// Placeholder for version management on top of AgentConfigStore:
// - rollback: make an older version live again (by saving it as a new version)
// - A/B tests: split calls between two versions and record which one handled each call
// - schema migrations: upgrade configs saved with an older schemaVersion
export {};
