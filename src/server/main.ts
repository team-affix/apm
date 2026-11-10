#!/usr/bin/env node
import os from 'os';
import path from 'path';
import { Registry } from '../core';
import { createServer } from './server';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST;
const registryDir = process.env.DPM_REGISTRY ?? path.join(os.homedir(), '.dpm', 'server', 'registry');
const allowProviders = process.env.DPM_ALLOW_PROVIDERS !== '0';

const registry = Registry.openOrCreate(registryDir);
const server = createServer({ registry, allowProviders });

server.listen(port, host, () => {
    console.log(`dpm-server listening on ${host ?? '*'}:${port}`);
    console.log(`registry: ${registryDir}`);
});
