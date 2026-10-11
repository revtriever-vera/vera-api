import { putParameterWithAwsCli, runTunnel, settingsFrom, TunnelSettings } from './tunnel-core';

async function main(): Promise<void> {
    const settings: TunnelSettings = settingsFrom(process.argv.slice(2), process.env);
    await runTunnel(settings, { putParameter: putParameterWithAwsCli, log: console.log });
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
