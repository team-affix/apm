import { Registry } from '@team-affix/apm-common';
import path from 'path';
import fs from 'fs';
import os from 'os';

export async function getRegistry(): Promise<Registry> {
    const defaultRegistryPath = path.join(os.homedir(), '.apm', 'client', 'registry');
    // If the default registry path does not exist, create it
    if (!fs.existsSync(defaultRegistryPath)) await Registry.create(defaultRegistryPath);
    // Return the default registry
    return await Registry.load(defaultRegistryPath);
}
