#!/usr/bin/env node
import { generateKeyPairSync } from "node:crypto";
import process from "node:process";

const keyId = process.argv[2] || "runner-ocean-navy-demo-ed25519";
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).replaceAll("\n", "\\n");
const publicPem = publicKey.export({ type: "spki", format: "pem" }).replaceAll("\n", "\\n");

console.log(`# Put these on the GPU runner host`);
console.log(`FISH_RUNNER_SIGNING_KEY_ID=${keyId}`);
console.log(`FISH_RUNNER_SIGNING_PRIVATE_KEY_PEM=${privatePem}`);
console.log("");
console.log(`# Put these on the Fish web/API host`);
console.log(`FISH_RUNNER_PUBLIC_KEY_ID=${keyId}`);
console.log(`FISH_RUNNER_PUBLIC_KEY_PEM=${publicPem}`);
